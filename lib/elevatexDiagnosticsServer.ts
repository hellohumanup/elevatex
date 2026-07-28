/**
 * Capa servidor — carga `participants` + `responses` con service role y calcula
 * métricas EDT + ONA para un grupo.
 */

import { computeEdtMetrics, type EdtMetricsResult } from "@/lib/edtMetrics";
import {
  computeElevateXOnaDiagnostics,
  type ElevateXOnaDiagnostics,
} from "@/lib/elevatexOnaEngine";
import { toSupabaseGroupId } from "@/lib/groupId";
import type { SupabaseClient } from "@supabase/supabase-js";

export type GroupParticipantRow = {
  id: string;
  name: string;
};

export type GroupResponseRow = {
  participant_id: string | null;
  answers: unknown;
};

export type ElevateXGroupDiagnostics = {
  groupId: string;
  participantCount: number;
  responseCount: number;
  edt: EdtMetricsResult;
  ona: ElevateXOnaDiagnostics;
};

export async function fetchGroupParticipantsAndResponses(
  supabase: SupabaseClient,
  groupId: string,
): Promise<{
  participants: GroupParticipantRow[];
  responses: GroupResponseRow[];
}> {
  const supabaseGroupId = toSupabaseGroupId(groupId);

  const [participantsResult, responsesResult] = await Promise.all([
    supabase
      .from("participants")
      .select("id, name")
      .eq("group_id", supabaseGroupId)
      .order("name", { ascending: true }),
    supabase
      .from("responses")
      .select("participant_id, answers")
      .eq("group_id", supabaseGroupId),
  ]);

  if (participantsResult.error) {
    throw new Error(participantsResult.error.message);
  }

  if (responsesResult.error) {
    throw new Error(responsesResult.error.message);
  }

  const participants: GroupParticipantRow[] = (participantsResult.data ?? []).map(
    (row) => ({
      id: String(row.id),
      name: typeof row.name === "string" ? row.name.trim() : String(row.id),
    }),
  );

  const responses: GroupResponseRow[] = (responsesResult.data ?? []).map(
    (row) => ({
      participant_id:
        row.participant_id === null || row.participant_id === undefined
          ? null
          : String(row.participant_id),
      answers: row.answers,
    }),
  );

  return { participants, responses };
}

/**
 * Orquesta la lectura con service role y el cálculo matemático completo
 * (EDT Likert + ONA en 3 dimensiones ElevateX).
 */
export async function computeGroupElevateXDiagnostics(
  supabase: SupabaseClient,
  groupId: string,
): Promise<ElevateXGroupDiagnostics> {
  const { participants, responses } = await fetchGroupParticipantsAndResponses(
    supabase,
    groupId,
  );

  const edt = computeEdtMetrics(
    responses.map((response) => ({ answers: response.answers })),
  );

  const ona = computeElevateXOnaDiagnostics(participants, responses);

  return {
    groupId,
    participantCount: participants.length,
    responseCount: responses.length,
    edt,
    ona,
  };
}
