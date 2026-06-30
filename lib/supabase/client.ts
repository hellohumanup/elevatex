import { createClientComponentClient as createBrowserSupabaseClient } from "@/lib/supabase/auth-helpers-nextjs-shim";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

export { getSupabaseEnv };

export function createSupabaseBrowserClient() {
  return createBrowserSupabaseClient();
}

/** @deprecated Usar createClientComponentClient desde @supabase/auth-helpers-nextjs */
export function createClientComponentClient() {
  return createBrowserSupabaseClient();
}

export function resetSupabaseBrowserClient() {
  // El singleton vive en auth-helpers-nextjs-shim; no-op por compatibilidad.
}

export async function waitForBrowserSession(
  supabase: SupabaseClient,
  maxAttempts = 10,
  delayMs = 100,
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();

    if (!error && data?.session?.user) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return false;
}
