import { toSupabaseGroupId } from "@/lib/groupId";
import { getSupabase } from "@/lib/supabase";

export const ACTIVE_QUESTIONNAIRE_ID =
  "11111111-1111-1111-1111-111111111111";

export type QuestionnaireQuestionType = "elevatex" | "sociogram";

export type QuestionnaireQuestion = {
  id: string;
  questionnaire_id: string;
  order_index: number;
  type: QuestionnaireQuestionType;
  /** Dimensión ElevateX (columna `dimension` en questionnaire_questions). */
  title: string;
  /** Texto de la pregunta (columna `content`). */
  prompt: string;
  subtitle: string | null;
};

type QuestionnaireQuestionRow = {
  id: string;
  order_index: number;
  type: string;
  dimension?: string | null;
  content?: string | null;
};

const QUESTION_SELECT = "id, type, dimension, content, order_index";

function normalizeQuestionType(value: string): QuestionnaireQuestionType | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "elevatex" || normalized === "sociogram") {
    return normalized;
  }
  return null;
}

function mapQuestionRow(
  row: QuestionnaireQuestionRow,
  questionnaireId: string,
): QuestionnaireQuestion | null {
  const type = normalizeQuestionType(row.type);
  if (!type) {
    return null;
  }

  const dimension = row.dimension?.trim() ?? "";
  const content = row.content?.trim() ?? "";

  return {
    id: row.id,
    questionnaire_id: questionnaireId,
    order_index: row.order_index,
    type,
    title: dimension || content || "Pregunta",
    prompt: content || dimension || "Pregunta",
    subtitle: dimension || null,
  };
}

function normalizeQuestionKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Clave JSONB para answers en preguntas sociograma (ej: silos, alineacion). */
export function resolveSociogramAnswerKey(
  question: Pick<QuestionnaireQuestion, "id" | "title" | "subtitle" | "prompt">,
): string {
  const combined = [question.subtitle, question.title, question.prompt]
    .filter(Boolean)
    .join(" ");
  const normalized = combined
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  if (normalized.includes("silos") || normalized.includes("silo")) {
    return "silos";
  }

  if (normalized.includes("alineacion")) {
    return "alineacion";
  }

  if (question.subtitle?.trim()) {
    return normalizeQuestionKey(question.subtitle);
  }

  return question.id;
}

export async function fetchParticipantsForGroup(groupId: string): Promise<{
  data: Array<{ id: string; name: string }>;
  error: string | null;
}> {
  try {
    const { data, error } = await getSupabase()
      .from("participants")
      .select("id, name")
      .eq("group_id", groupId)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error crítico en Supabase:", error);
      return { data: [], error: error.message };
    }

    const participants = (data ?? [])
      .map((row) => ({
        id: String(row.id),
        name: typeof row.name === "string" ? row.name.trim() : "",
      }))
      .filter((participant) => participant.name.length > 0);

    return { data: participants, error: null };
  } catch (error) {
    console.error("Error crítico en Supabase:", error);
    return {
      data: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchQuestionnaireQuestions(
  questionnaireId = ACTIVE_QUESTIONNAIRE_ID,
): Promise<{ data: QuestionnaireQuestion[]; error: string | null }> {
  try {
    const { data, error } = await getSupabase()
      .from("questionnaire_questions")
      .select(QUESTION_SELECT)
      .eq("questionnaire_id", ACTIVE_QUESTIONNAIRE_ID)
      .order("order_index", { ascending: true });

    if (error) {
      console.error("Error crítico en Supabase:", error);
      return { data: [], error: error.message };
    }

    const questions = (data ?? [])
      .map((row) =>
        mapQuestionRow(row as QuestionnaireQuestionRow, questionnaireId),
      )
      .filter((question): question is QuestionnaireQuestion => question !== null);

    return { data: questions, error: null };
  } catch (error) {
    console.error("Error crítico en Supabase:", error);
    return {
      data: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchQuestionnaireResponseCountForGroup(
  groupId: string,
  questionnaireId = ACTIVE_QUESTIONNAIRE_ID,
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await getSupabase()
    .from("responses")
    .select("id", { count: "exact", head: true })
    .eq("group_id", toSupabaseGroupId(groupId))
    .eq("questionnaire_id", questionnaireId);

  if (error) {
    return { count: 0, error: error.message };
  }

  return { count: count ?? 0, error: null };
}

export async function hasExistingQuestionnaireResponse(input: {
  groupId: string;
  participantId: string;
  questionnaireId?: string;
}): Promise<{ exists: boolean; error: string | null }> {
  const questionnaireId = input.questionnaireId ?? ACTIVE_QUESTIONNAIRE_ID;

  const { count, error } = await getSupabase()
    .from("responses")
    .select("id", { count: "exact", head: true })
    .eq("group_id", toSupabaseGroupId(input.groupId))
    .eq("participant_id", input.participantId)
    .eq("questionnaire_id", questionnaireId);

  if (error) {
    return { exists: false, error: error.message };
  }

  return { exists: (count ?? 0) > 0, error: null };
}

export type SubmitQuestionnaireResponseInput = {
  groupId: string;
  participantId: string;
  questionnaireId?: string;
  answers: Record<string, string[]>;
  elevatexScores: Record<string, number>;
};

export async function fetchQuestionnaireResponsesForGroup(
  groupId: string,
  questionnaireId = ACTIVE_QUESTIONNAIRE_ID,
): Promise<{
  data: Array<{
    id: string;
    group_id: string | number;
    participant_id: string;
    questionnaire_id: string | null;
    answers: unknown;
    elevatex_scores: unknown;
  }>;
  error: string | null;
}> {
  const { data, error } = await getSupabase()
    .from("responses")
    .select(
      "id, group_id, participant_id, questionnaire_id, answers, elevatex_scores",
    )
    .eq("group_id", toSupabaseGroupId(groupId))
    .eq("questionnaire_id", questionnaireId);

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data ?? [], error: null };
}

export async function submitQuestionnaireResponse(
  input: SubmitQuestionnaireResponseInput,
) {
  const questionnaireId = input.questionnaireId ?? ACTIVE_QUESTIONNAIRE_ID;

  return getSupabase()
    .from("responses")
    .insert({
      group_id: toSupabaseGroupId(input.groupId),
      participant_id: input.participantId,
      questionnaire_id: questionnaireId,
      answers: input.answers,
      elevatex_scores: input.elevatexScores,
    })
    .select("id")
    .single();
}
