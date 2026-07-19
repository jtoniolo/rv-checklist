'use client';

import type { Owner } from '@rv-checklist/domain';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import {
  exchangeGoogleCredential,
  fetchMe,
  refreshSession,
  revokeSession,
} from '../lib/api-client';
import { config } from '../lib/config';
import {
  clearSession,
  readSession,
  refreshDelayMs,
  storeSession,
  type StoredSession,
} from '../lib/tokens';

type Status = 'loading' | 'signed-out' | 'signed-in';

interface AuthState {
  readonly status: Status;
  readonly owner: Owner | undefined;
  /** Mount point for the Google Sign-In fallback button. */
  readonly buttonRef: (node: HTMLDivElement | null) => void;
  signOut: () => void;
}

/** A per-effect cancellation flag, held in an object so its reads stay dynamic. */
interface EffectGuard {
  isCancelled: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

/** Access the auth state; must be used within {@link AuthProvider}. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';

interface GsiGlobal {
  readonly google?: GoogleIdentityServices;
}

/** The One Tap client, once the script has loaded — typed off `globalThis`. */
function gsiId(): GoogleAccountsId | undefined {
  return (globalThis as unknown as GsiGlobal).google?.accounts.id;
}

/** Load the Google Identity Services script once; resolve when it is ready. */
const ensureGsi: () => Promise<void> = (() => {
  let promise: Promise<void> | undefined;
  return () => {
    if (gsiId()) {
      return Promise.resolve();
    }
    promise ??= new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GSI_SRC;
      script.async = true;
      script.addEventListener('load', () => {
        resolve();
      });
      script.addEventListener('error', () => {
        reject(new Error('Failed to load Google Identity Services'));
      });
      document.head.append(script);
    });
    return promise;
  };
})();

export function AuthProvider({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  const [status, setStatus] = useState<Status>('loading');
  const [owner, setOwner] = useState<Owner | undefined>(undefined);

  const sessionRef = useRef<StoredSession | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const buttonNodeRef = useRef<HTMLDivElement | undefined>(undefined);

  const clearTimer = useCallback(() => {
    if (timerRef.current === undefined) {
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const goSignedOut = useCallback(() => {
    clearTimer();
    clearSession();
    sessionRef.current = undefined;
    setOwner(undefined);
    setStatus('signed-out');
    gsiId()?.disableAutoSelect();
  }, [clearTimer]);

  // Refresh the access token ahead of expiry; on failure, drop to signed-out.
  const scheduleRefresh = useCallback(
    (session: StoredSession) => {
      clearTimer();
      const delay = refreshDelayMs(session.accessExpiresAt, Date.now());
      timerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const pair = await refreshSession(session.refreshToken);
            const next = storeSession(pair, Date.now());
            sessionRef.current = next;
            scheduleRefresh(next);
          } catch {
            goSignedOut();
          }
        })();
      }, delay);
    },
    [clearTimer, goSignedOut],
  );

  // Adopt a session: confirm the identity, then keep it alive.
  const adopt = useCallback(
    async (session: StoredSession): Promise<void> => {
      const me = await fetchMe(session.accessToken);
      sessionRef.current = session;
      setOwner(me);
      setStatus('signed-in');
      scheduleRefresh(session);
    },
    [scheduleRefresh],
  );

  // The One Tap callback: exchange the Google credential for our tokens.
  const onCredential = useCallback(
    (credential: string) => {
      void (async () => {
        try {
          const pair = await exchangeGoogleCredential(credential);
          await adopt(storeSession(pair, Date.now()));
        } catch {
          goSignedOut();
        }
      })();
    },
    [adopt, goSignedOut],
  );

  const signOut = useCallback(() => {
    const token = sessionRef.current?.refreshToken;
    if (token) {
      void revokeSession(token).catch(() => {
        /* best-effort revoke; local sign-out proceeds regardless */
      });
    }
    goSignedOut();
  }, [goSignedOut]);

  // Resume a stored session on load. The access token is short-lived, so we
  // always refresh first — that both renews it and proves the session is live.
  const resume = useCallback(
    async (guard: EffectGuard): Promise<void> => {
      const session = readSession();
      if (!session) {
        if (!guard.isCancelled) setStatus('signed-out');
        return;
      }
      try {
        const pair = await refreshSession(session.refreshToken);
        if (guard.isCancelled) return;
        await adopt(storeSession(pair, Date.now()));
      } catch {
        if (!guard.isCancelled) goSignedOut();
      }
    },
    [adopt, goSignedOut],
  );

  useEffect(() => {
    const guard: EffectGuard = { isCancelled: false };
    void resume(guard);
    return () => {
      guard.isCancelled = true;
      clearTimer();
    };
  }, [resume, clearTimer]);

  // While signed out, offer One Tap and render the fallback button.
  useEffect(() => {
    if (status !== 'signed-out' || !config.googleClientId) {
      return;
    }
    const guard: EffectGuard = { isCancelled: false };
    void (async () => {
      try {
        await ensureGsi();
      } catch {
        return;
      }
      const gsi = gsiId();
      if (!gsi || guard.isCancelled) {
        return;
      }
      gsi.initialize({
        client_id: config.googleClientId,
        callback: (response) => {
          onCredential(response.credential);
        },
        cancel_on_tap_outside: false,
      });
      if (buttonNodeRef.current) {
        gsi.renderButton(buttonNodeRef.current, {
          type: 'standard',
          theme: 'filled_blue',
          size: 'large',
          text: 'continue_with',
        });
      }
      gsi.prompt();
    })();
    return () => {
      guard.isCancelled = true;
    };
  }, [status, onCredential]);

  const buttonRef = useCallback((node: HTMLDivElement | null) => {
    buttonNodeRef.current = node ?? undefined;
  }, []);

  return (
    <AuthContext.Provider value={{ status, owner, buttonRef, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
