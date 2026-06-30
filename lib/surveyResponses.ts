import { resolveOrganizationIdForInsert } from "@/lib/organizations";
import { getDefaultOrganizationId } from "@/lib/tenant";
import { getSupabase } from "@/lib/supabase";

export type SurveyResponseRecord = {
  organization_id: string;
  responder_id: string;
  p1_voto1: string;
  p1_voto2: string;
  p1_voto3: string;
  p2_voto1: string;
  p2_voto2: string;
  p2_voto3: string;
  p3_voto1: string;
  p3_voto2: string;
  p3_voto3: string;
};

export type SurveyFormVotes = {
  p1: [string, string, string];
  p2: [string, string, string];
  p3: [string, string, string];
};

export function buildSurveyResponseRecord(input: {
  organizationId?: string;
  responderId: string;
  votes: SurveyFormVotes;
}): SurveyResponseRecord {
  return {
    organization_id: input.organizationId ?? getDefaultOrganizationId(),
    responder_id: input.responderId,
    p1_voto1: input.votes.p1[0],
    p1_voto2: input.votes.p1[1],
    p1_voto3: input.votes.p1[2],
    p2_voto1: input.votes.p2[0],
    p2_voto2: input.votes.p2[1],
    p2_voto3: input.votes.p2[2],
    p3_voto1: input.votes.p3[0],
    p3_voto2: input.votes.p3[1],
    p3_voto3: input.votes.p3[2],
  };
}

export function createAnonymousResponderId(): string {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `Empleado_Anonimo_${suffix}`;
}

export async function insertSurveyResponse(record: SurveyResponseRecord) {
  const organizationId = await resolveOrganizationIdForInsert(record.organization_id);

  return getSupabase().from("survey_responses").insert({
    ...record,
    organization_id: organizationId,
  });
}

export async function fetchOrganizationIdForGroup(
  groupId: string,
): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("groups")
    .select("organization_id")
    .eq("id", groupId)
    .maybeSingle();

  if (error || !data?.organization_id) {
    return null;
  }

  return typeof data.organization_id === "string"
    ? data.organization_id
    : String(data.organization_id);
}
