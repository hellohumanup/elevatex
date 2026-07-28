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

function createMissingEnvClient(): SupabaseClient {
  const message =
    "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.";

  return new Proxy(
    {},
    {
      get() {
        throw new Error(message);
      },
    },
  ) as SupabaseClient;
}

/** Cliente del navegador con anon_key — inicialización síncrona, sin await. */
export function createClientComponentClient(): SupabaseClient {
  if (!cachedClient) {
    logSupabaseEnvDebug("createClientComponentClient");

    const env = getSupabaseEnv();

    if (!env) {
      console.warn(
        "[Supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes. Se devuelve un cliente placeholder para no romper el build.",
      );
      cachedClient = createMissingEnvClient();
      return cachedClient;
    }

    const { supabaseUrl, supabaseAnonKey } = env;
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
