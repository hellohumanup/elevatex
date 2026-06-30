import {
  getDemoOrganization,
  type DemoOrgId,
} from "@/lib/demoOrganizations";
import type {
  ImportedParticipant,
  ImportedResponse,
} from "@/lib/parseVotesImportFile";
import { getSupabase } from "@/lib/supabase";

export type PersistedVotesImport = {
  organizationId: string;
  organizationName: string;
  participants: ImportedParticipant[];
  responses: ImportedResponse[];
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

async function resolveOrganizationId(orgId: DemoOrgId): Promise<string> {
  const organization = getDemoOrganization(orgId);
  const supabase = getSupabase();

  const { data: byName, error: lookupError } = await supabase
    .from("organizations")
    .select("id")
    .eq("name", organization.organizationName)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  if (byName?.id) {
    return String(byName.id);
  }

  const { data: created, error: insertError } = await supabase
    .from("organizations")
    .insert({ name: organization.organizationName })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return String(created.id);
}

export async function persistVotesImportToSupabase(input: {
  groupId: string;
  demoOrgId: DemoOrgId;
  participants: ImportedParticipant[];
  responses: ImportedResponse[];
}): Promise<PersistedVotesImport> {
  const organizationId = await resolveOrganizationId(input.demoOrgId);
  const organizationName = getDemoOrganization(input.demoOrgId).organizationName;
  const supabase = getSupabase();

  const { error: groupUpdateError } = await supabase
    .from("groups")
    .update({ organization_id: organizationId })
    .eq("id", input.groupId);

  if (groupUpdateError) {
    throw new Error(groupUpdateError.message);
  }

  const { error: deleteResponsesError } = await supabase
    .from("responses")
    .delete()
    .eq("group_id", input.groupId);

  if (deleteResponsesError) {
    throw new Error(deleteResponsesError.message);
  }

  const { error: deleteParticipantsError } = await supabase
    .from("participants")
    .delete()
    .eq("group_id", input.groupId);

  if (deleteParticipantsError) {
    throw new Error(deleteParticipantsError.message);
  }

  const { data: insertedParticipants, error: participantsError } = await supabase
    .from("participants")
    .insert(
      input.participants.map((participant) => ({
        name: participant.name,
        group_id: input.groupId,
      })),
    )
    .select("id, name, group_id");

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  if (!insertedParticipants || insertedParticipants.length === 0) {
    throw new Error("No se pudieron guardar los colaboradores en Supabase.");
  }

  const importIdToRealId = new Map<string, string>();

  for (const importedParticipant of input.participants) {
    const persistedParticipant = insertedParticipants.find(
      (participant) =>
        normalizeName(participant.name) === normalizeName(importedParticipant.name),
    );

    if (persistedParticipant) {
      importIdToRealId.set(importedParticipant.id, persistedParticipant.id);
    }
  }

  const responseRows = input.responses.map((response) => ({
    group_id: input.groupId,
    participant_id: importIdToRealId.get(response.participant_id),
    answers: response.answers
      .map((answerId) => importIdToRealId.get(answerId))
      .filter((answerId): answerId is string => Boolean(answerId)),
  }));

  const validResponseRows = responseRows.filter(
    (response) =>
      response.participant_id && response.answers.length > 0,
  );

  if (validResponseRows.length > 0) {
    const { error: responsesError } = await supabase
      .from("responses")
      .insert(validResponseRows);

    if (responsesError) {
      throw new Error(responsesError.message);
    }
  }

  const persistedParticipants: ImportedParticipant[] = insertedParticipants.map(
    (participant) => ({
      id: participant.id,
      name: participant.name,
      group_id: participant.group_id,
    }),
  );

  const persistedResponses: ImportedResponse[] = validResponseRows.map(
    (response, index) => ({
      id: `db-response-${index + 1}`,
      group_id: response.group_id,
      participant_id: response.participant_id!,
      answers: response.answers,
    }),
  );

  return {
    organizationId,
    organizationName,
    participants: persistedParticipants,
    responses: persistedResponses,
  };
}
