import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tenant fijo para inserts locales sin sesión (RLS dev). */
export const FALLBACK_TEST_TENANT_ID = "cbd62767-1644-477c-a496-e26ea31dc109";

/** @deprecated Usar FALLBACK_TEST_TENANT_ID */
export const LOCAL_DEV_TENANT_ID = FALLBACK_TEST_TENANT_ID;

export function createSupabaseServiceRoleClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
