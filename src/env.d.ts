/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" turns on self-service sign-up. Default off. */
  readonly VITE_SELF_SIGNUP?: string;
  /** Address that receives access and demo requests from /request-access. */
  readonly VITE_CONTACT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
