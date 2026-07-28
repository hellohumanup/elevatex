import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type { Database } from "@/lib/supabase/database.types";

export function getSupabase() {
  return createSupabaseBrowserClient();
}
