import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function getSupabase() {
  return createSupabaseBrowserClient();
}
