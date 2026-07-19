/**
 * Minimal typing for the Google Identity Services One Tap client, loaded from
 * `https://accounts.google.com/gsi/client` at runtime (ADR-0002). Only the
 * surface this app uses is declared.
 */
interface GoogleCredentialResponse {
  /** The Google ID token (a JWT) to exchange with the API. */
  readonly credential: string;
}

interface GoogleIdConfiguration {
  readonly client_id: string;
  readonly callback: (response: GoogleCredentialResponse) => void;
  readonly auto_select?: boolean;
  readonly cancel_on_tap_outside?: boolean;
}

interface GoogleButtonOptions {
  readonly type?: 'standard' | 'icon';
  readonly theme?: 'outline' | 'filled_blue' | 'filled_black';
  readonly size?: 'small' | 'medium' | 'large';
  readonly text?: 'signin_with' | 'signup_with' | 'continue_with';
}

interface GoogleAccountsId {
  initialize(config: GoogleIdConfiguration): void;
  prompt(): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
  disableAutoSelect(): void;
}

interface GoogleIdentityServices {
  readonly accounts: {
    readonly id: GoogleAccountsId;
  };
}
