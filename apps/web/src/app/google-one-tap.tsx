'use client';

import { useLoginWithGoogleMutation } from '@rv-checklist/web-data-access';
import { useCallback, useEffect, useRef, type JSX } from 'react';
import { config } from '../lib/config';

/**
 * Google One Tap sign-in (ADR-0002). Loads the Google Identity Services client,
 * renders its button, and prompts One Tap; when the owner authenticates it hands
 * the resulting Google credential to the `loginWithGoogle` mutation, which
 * exchanges it for the first-party token pair and stores it in the auth slice.
 * Rendered only while signed out.
 */
const GSI_SRC = 'https://accounts.google.com/gsi/client';

interface GsiGlobal {
  readonly google?: GoogleIdentityServices;
}

/** A per-effect cancellation flag, held in an object so its reads stay dynamic. */
interface EffectGuard {
  isCancelled: boolean;
}

/** The One Tap client, once the script has loaded — typed off `globalThis`. */
function gsiId(): GoogleAccountsId | undefined {
  return (globalThis as unknown as GsiGlobal).google?.accounts.id;
}

/**
 * Stop One Tap from silently re-selecting the just-signed-out credential.
 * Called on explicit sign-out so the owner stays signed out until they choose
 * to sign in again.
 */
export function disableGoogleAutoSelect(): void {
  gsiId()?.disableAutoSelect();
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

export function GoogleOneTap(): JSX.Element {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [loginWithGoogle] = useLoginWithGoogleMutation();

  const onCredential = useCallback(
    (credential: string) => {
      void loginWithGoogle(credential);
    },
    [loginWithGoogle],
  );

  useEffect(() => {
    if (!config.googleClientId) {
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
      if (buttonRef.current) {
        gsi.renderButton(buttonRef.current, {
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
  }, [onCredential]);

  return <div ref={buttonRef} />;
}
