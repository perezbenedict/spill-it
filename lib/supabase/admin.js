import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { readEnv } from "@/lib/config";

// Service-role client for trusted server code only (bypasses RLS).
// The key is read from process.env and never exported or exposed to the client.
export function createAdminClient() {
  const env = readEnv();
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
