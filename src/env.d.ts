/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" turns on self-service sign-up. Default off. */
  readonly VITE_SELF_SIGNUP?: string;
  /** Address that receives access and demo requests from /request-access. */
  readonly VITE_CONTACT_EMAIL?: string;
  /** Supabase project URL (the generated client hardcodes the same value). */
  readonly VITE_SUPABASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
