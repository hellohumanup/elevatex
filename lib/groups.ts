import { getDefaultOrganizationId, groupsTenantOrFilter } from "@/lib/tenant";
import { getSupabase } from "@/lib/supabase";

export type GroupRecord = {
  id: string;
  name: string;
  age_band: string;
  created_at: string;
  organization_id: number | null;
};

const GROUP_COLUMNS = "id, name, age_band, created_at, organization_id";

export async function fetchGroupsForTenant() {
  return getSupabase()
    .from("groups")
    .select(GROUP_COLUMNS)
    .or(groupsTenantOrFilter())
    .order("created_at", { ascending: false });
}

export async function fetchGroupById(groupId: string) {
  return getSupabase()
    .from("groups")
    .select(GROUP_COLUMNS)
    .eq("id", groupId)
    .single();
}

type CreateGroupInput = {
  name: string;
  age_band: string;
  organization_id?: number | null;
};

export async function insertGroup(input: CreateGroupInput) {
  return getSupabase().from("groups").insert({
    name: input.name,
    age_band: input.age_band,
    organization_id: input.organization_id ?? getDefaultOrganizationId(),
  });
}
