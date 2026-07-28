/**
 * Shim App Router: createClientComponentClient + re-export @supabase/ssr.
 * @supabase/auth-helpers-nextjs@0.15 consolidó APIs en @supabase/ssr.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv, logSupabaseEnvDebug } from "@/lib/supabase/env";

export { createBrowserClient, createServerClient } from "@supabase/ssr";
export type { Database } from "@/lib/supabase/database.types";

let cachedClient: SupabaseClient | undefined;

/** Cliente del navegador con anon_key — inicialización síncrona, sin await. */
export function createClientComponentClient(): SupabaseClient {
  if (!cachedClient) {
    logSupabaseEnvDebug("createClientComponentClient");

    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    cachedClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return cachedClient;
}
