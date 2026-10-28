import type { ReactNode } from "react";

export interface Captcha {
  /** The widget to render above the submit button (null while CAPTCHA is off). */
  widget: ReactNode;
  /** The token to pass as captchaToken; undefined while CAPTCHA is off. */
  token: string | undefined;
  /** True when the form may be submitted (always, while CAPTCHA is off). */
  ready: boolean;
  /** Call after each submit: Turnstile tokens are single use. */
  reset: () => void;
}

/**
 * The CAPTCHA for the sign-in, sign-up and forgot-password forms. Off for now: Supabase Auth's
 * CAPTCHA protection is not switched on. To add Cloudflare Turnstile, render the widget here
 * with VITE_TURNSTILE_SITE_KEY, keep its token in state and reset it after each submit; the
 * forms already render `widget`, wait for `ready` and pass `token` to the auth services.
 * See docs/auth-setup.md, "CAPTCHA later".
 */
export function useCaptcha(): Captcha {
  return { widget: null, token: undefined, ready: true, reset: () => undefined };
}
