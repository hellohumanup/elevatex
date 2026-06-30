import {
  buildEdtAnswersPayload,
  EDT_QUESTION_COUNT,
  fetchDefaultEdtSurveyId,
  type EdtAnswerOption,
} from "@/lib/surveyQuestions";
import { toSupabaseGroupId } from "@/lib/groupId";
import type { SupabaseClient } from "@supabase/supabase-js";

const EDT_OPTIONS: EdtAnswerOption[] = ["A", "B", "C", "D"];

/** Escala Likert por defecto — requerida por columnas NOT NULL en survey_responses/responses. */
const DEFAULT_EDT_SCALE_OPTIONS = {
  option_a: "Totalmente de acuerdo",
  option_b: "De acuerdo",
  option_c: "En desacuerdo",
  option_d: "Totalmente en desacuerdo",
} as const;

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

export async function simulateDevVotesForGroup(
  supabase: SupabaseClient,
  groupId: string,
): Promise<SimulatedDevVotesResult> {
  const { surveyId, error: surveyError } = await fetchDefaultEdtSurveyId();

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

  const supabaseGroupId = toSupabaseGroupId(groupId);
  const responseCount = randomInt(10, 15);
  const fictitiousNames = buildFictitiousNames(responseCount);

  const { error: deleteResponsesError } = await supabase
    .from("responses")
    .delete()
    .eq("group_id", supabaseGroupId);

  if (deleteResponsesError) {
    throw new Error(deleteResponsesError.message);
  }

  const { error: deleteParticipantsError } = await supabase
    .from("participants")
    .delete()
    .eq("group_id", supabaseGroupId);

  if (deleteParticipantsError) {
    throw new Error(deleteParticipantsError.message);
  }

  const { data: insertedParticipants, error: participantsError } = await supabase
    .from("participants")
    .insert(
      fictitiousNames.map((name) => ({
        name,
        group_id: supabaseGroupId,
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
    group_id: supabaseGroupId,
    participant_id: participant.id,
    ...(dbSurveyId ? { survey_id: dbSurveyId } : {}),
    answers: buildHybridAnswersPayload(
      String(participant.id),
      participantIds,
      hubIds,
    ),
    ...DEFAULT_EDT_SCALE_OPTIONS,
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
