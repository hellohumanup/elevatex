import {
  buildEdtAnswersPayload,
  EDT_QUESTION_COUNT,
  fetchDefaultEdtSurveyId,
  type EdtAnswerOption,
} from "@/lib/surveyQuestions";
import {
  DEMO_DASHBOARD_ORGANIZATION_ID,
  FALLBACK_TEST_TENANT_ID,
} from "@/lib/groups";
import { toNumericSupabaseGroupId } from "@/lib/groupId";
import { ensureOrganizationWithServiceRole } from "@/lib/organizations-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

const EDT_OPTIONS: EdtAnswerOption[] = ["A", "B", "C", "D"];

const FICTITIOUS_FIRST_NAMES = [
  "Ana",
  "Bruno",
  "Carla",
  "Diego",
  "Elena",
  "Felipe",
  "Gabriela",
  "Hugo",
  "Irene",
  "Javier",
  "Laura",
  "Marcos",
  "Nuria",
  "Óscar",
  "Paula",
  "Raúl",
  "Sara",
  "Tomás",
  "Valeria",
  "Xavier",
];

const FICTITIOUS_LAST_NAMES = [
  "Álvarez",
  "Blanco",
  "Castro",
  "Delgado",
  "Escobar",
  "Fuentes",
  "García",
  "Herrera",
  "Iglesias",
  "Jiménez",
  "López",
  "Martín",
  "Navarro",
  "Ortega",
  "Pérez",
  "Quintana",
  "Ruiz",
  "Serrano",
  "Torres",
  "Vega",
];

export type SimulatedDevVotesResult = {
  participantCount: number;
  responseCount: number;
  surveyId: string;
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandomOption(): EdtAnswerOption {
  return EDT_OPTIONS[Math.floor(Math.random() * EDT_OPTIONS.length)]!;
}

function shuffleArray<T>(items: readonly T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex]!,
      shuffled[index]!,
    ];
  }

  return shuffled;
}

function buildRandomEdtAnswers(): Record<string, EdtAnswerOption> {
  const letterAnswers: Record<number, EdtAnswerOption> = {};

  for (let question = 1; question <= EDT_QUESTION_COUNT; question += 1) {
    letterAnswers[question] = pickRandomOption();
  }

  return buildEdtAnswersPayload(letterAnswers);
}

function buildFictitiousNames(count: number): string[] {
  const pool: string[] = [];

  for (const firstName of FICTITIOUS_FIRST_NAMES) {
    for (const lastName of FICTITIOUS_LAST_NAMES) {
      pool.push(`${firstName} ${lastName}`);
    }
  }

  return shuffleArray(pool).slice(0, count);
}

function pickCrossNominations(
  voterId: string,
  participantIds: readonly string[],
  hubIds: readonly string[],
): { influencia: string[]; comunicacion: string[] } {
  const peers = participantIds.filter((id) => id !== voterId);

  if (peers.length === 0) {
    return { influencia: [], comunicacion: [] };
  }

  const influenceCount = peers.length === 1 ? 1 : randomInt(2, Math.min(3, peers.length));
  const communicationCount =
    peers.length === 1 ? 1 : randomInt(2, Math.min(3, peers.length));

  const hubPeers = hubIds.filter((id) => id !== voterId);
  const pickFromPool = (count: number): string[] => {
    const selected = new Set<string>();
    const shuffledPeers = shuffleArray(peers);

    for (const hubId of shuffleArray(hubPeers)) {
      if (selected.size >= count) {
        break;
      }

      if (Math.random() < 0.72) {
        selected.add(hubId);
      }
    }

    for (const peerId of shuffledPeers) {
      if (selected.size >= count) {
        break;
      }

      selected.add(peerId);
    }

    return [...selected];
  };

  return {
    influencia: pickFromPool(influenceCount),
    comunicacion: pickFromPool(communicationCount),
  };
}

function buildHybridAnswersPayload(
  voterId: string,
  participantIds: readonly string[],
  hubIds: readonly string[],
): Record<string, unknown> {
  const edtAnswers = buildRandomEdtAnswers();
  const { influencia, comunicacion } = pickCrossNominations(
    voterId,
    participantIds,
    hubIds,
  );

  return {
    ...edtAnswers,
    influencia,
    comunicacion,
  };
}

const DEV_EDT_SURVEY_FALLBACK = "edt-standard-fallback";

/**
 * Resuelve el group_id canónico de Supabase a partir del segmento de la URL.
 * Si el equipo no existe (p. ej. /group/123 sin fila previa), lo provisiona en dev
 * con ese mismo id para mantener la integridad referencial de participants/responses.
 */
async function resolveGroupIdForDevSimulation(
  supabase: SupabaseClient,
  routeGroupId: string,
): Promise<number> {
  const numericGroupId = toNumericSupabaseGroupId(routeGroupId);

  if (numericGroupId === null) {
    throw new Error(
      `El group_id "${routeGroupId}" de la URL no es un identificador numérico válido.`,
    );
  }

  const { data: existingGroup, error: lookupError } = await supabase
    .from("groups")
    .select("id")
    .eq("id", numericGroupId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  if (existingGroup?.id != null) {
    return Number(existingGroup.id);
  }

  const ensuredOrganization = await ensureOrganizationWithServiceRole({
    id: DEMO_DASHBOARD_ORGANIZATION_ID,
    name: "Organización Demo",
  });

  if (ensuredOrganization.error || !ensuredOrganization.id) {
    throw new Error(
      ensuredOrganization.error ??
        "No se pudo asegurar la organización antes de crear el equipo de simulación.",
    );
  }

  const { data: createdGroup, error: insertError } = await supabase
    .from("groups")
    .insert({
      id: numericGroupId,
      name: `Equipo simulación ${numericGroupId}`,
      age_band: "25-35",
      organization_id: ensuredOrganization.id,
      tenant_id: FALLBACK_TEST_TENANT_ID,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(
      `No se pudo crear el equipo ${numericGroupId} para la simulación: ${insertError.message}`,
    );
  }

  if (createdGroup?.id == null) {
    throw new Error(`No se pudo confirmar el equipo ${numericGroupId}.`);
  }

  return Number(createdGroup.id);
}

export async function simulateDevVotesForGroup(
  supabase: SupabaseClient,
  groupId: string,
): Promise<SimulatedDevVotesResult> {
  if (typeof window !== "undefined") {
    throw new Error(
      "simulateDevVotesForGroup solo puede ejecutarse en el servidor (API /api/dev/simulate-votes).",
    );
  }

  const { surveyId, error: surveyError } = await fetchDefaultEdtSurveyId(supabase);

  let resolvedSurveyId = surveyId;

  if (surveyError || !surveyId) {
    console.warn(
      "[simulateDevVotes] Encuesta EDT estándar no disponible (RLS/dev); continuando con fallback.",
      surveyError,
    );

    const { data: fallbackSurvey } = await supabase
      .from("surveys")
      .select("id")
      .limit(1)
      .maybeSingle();

    resolvedSurveyId = fallbackSurvey?.id ?? DEV_EDT_SURVEY_FALLBACK;
  }

  const dbSurveyId =
    resolvedSurveyId === DEV_EDT_SURVEY_FALLBACK ? null : resolvedSurveyId;

  const resolvedGroupId = await resolveGroupIdForDevSimulation(supabase, groupId);
  const responseCount = randomInt(10, 15);
  const fictitiousNames = buildFictitiousNames(responseCount);

  const { error: groupOrgError } = await supabase
    .from("groups")
    .update({ organization_id: DEMO_DASHBOARD_ORGANIZATION_ID })
    .eq("id", resolvedGroupId);

  if (groupOrgError) {
    throw new Error(groupOrgError.message);
  }

  const { error: deleteResponsesError } = await supabase
    .from("responses")
    .delete()
    .eq("group_id", resolvedGroupId);

  if (deleteResponsesError) {
    throw new Error(deleteResponsesError.message);
  }

  const { error: deleteParticipantsError } = await supabase
    .from("participants")
    .delete()
    .eq("group_id", resolvedGroupId);

  if (deleteParticipantsError) {
    throw new Error(deleteParticipantsError.message);
  }

  const { data: insertedParticipants, error: participantsError } = await supabase
    .from("participants")
    .insert(
      fictitiousNames.map((name) => ({
        name,
        group_id: resolvedGroupId,
      })),
    )
    .select("id, name, group_id");

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  if (!insertedParticipants || insertedParticipants.length === 0) {
    throw new Error("No se pudieron crear colaboradores ficticios.");
  }

  const participantIds = insertedParticipants.map((participant) =>
    String(participant.id),
  );
  const hubIds = shuffleArray(participantIds).slice(
    0,
    Math.min(3, Math.max(2, Math.floor(participantIds.length / 4))),
  );

  const responseRows = insertedParticipants.map((participant) => ({
    group_id: resolvedGroupId,
    participant_id: participant.id,
    ...(dbSurveyId ? { survey_id: dbSurveyId } : {}),
    answers: buildHybridAnswersPayload(
      String(participant.id),
      participantIds,
      hubIds,
    ),
  }));

  const { error: insertResponsesError } = await supabase
    .from("responses")
    .insert(responseRows);

  if (insertResponsesError) {
    throw new Error(insertResponsesError.message);
  }

  return {
    participantCount: insertedParticipants.length,
    responseCount: responseRows.length,
    surveyId: resolvedSurveyId ?? DEV_EDT_SURVEY_FALLBACK,
  };
}
