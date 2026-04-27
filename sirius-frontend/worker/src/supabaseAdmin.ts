import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

/** Service-role client — server-side only. */
export const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
