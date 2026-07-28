import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FALLBACK_TEST_TENANT_ID as CANONICAL_FALLBACK_TEST_TENANT_ID } from "@/lib/groups";

export type { Database } from "@/lib/supabase/database.types";

/** Re-export canónico desde lib/groups (evitar drift de UUID). */
export const FALLBACK_TEST_TENANT_ID = CANONICAL_FALLBACK_TEST_TENANT_ID;

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
