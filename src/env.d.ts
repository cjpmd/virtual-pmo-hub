/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "false" switches off self-service organisation creation (the kill switch). Default on. */
  readonly VITE_SELF_SIGNUP?: string;
  /** "true" shows board automations (hidden until work package 4.3). Default off. */
  readonly VITE_BOARD_AUTOMATIONS?: string;
  /** Address that receives access and demo requests from /request-access. */
  readonly VITE_CONTACT_EMAIL?: string;
  /** Supabase project URL (the generated client hardcodes the same value). */
  readonly VITE_SUPABASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
