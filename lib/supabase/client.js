import { createBrowserClient } from "@supabase/ssr";
import { readEnv } from "@/lib/config";

export function createClient() {
  const env = readEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
