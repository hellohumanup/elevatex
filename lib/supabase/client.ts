import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseEnv, getSupabaseEnv } from "@/lib/supabase/env";

export { getSupabaseEnv };

let browserClient: SupabaseClient | undefined;

export function createSupabaseBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = assertSupabaseEnv();

  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }

  return browserClient;
}

export function resetSupabaseBrowserClient() {
  browserClient = undefined;
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
