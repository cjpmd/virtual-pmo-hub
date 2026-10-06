// Browser Supabase client (Lovable convention: one shared client, imported as
// `import { supabase } from "@/integrations/supabase/client"`).
// The URL and publishable key are public by design; access is enforced by RLS.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = "https://xvdlmtkzfmbcegkmampz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5k3rl8379FfldES7i4a-xg_v2IVRmJV";

const browser = typeof window !== "undefined";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    // During server rendering there is no session; the client picks it up on hydration.
    storage: browser ? window.localStorage : undefined,
    persistSession: browser,
    autoRefreshToken: browser,
    detectSessionInUrl: browser,
    flowType: "pkce",
  },
});
