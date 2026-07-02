import { toSupabaseGroupId } from "@/lib/groupId";
import { createClientComponentClient } from "@/lib/supabase/auth-helpers-nextjs-shim";

export const STANDARD_EDT_SURVEY_TITLE =
  "Evaluación de Dinámicas de Trabajo (EDT) Estándar";

export type EdtAnswerOption = "A" | "B" | "C" | "D";

export const EDT_QUESTION_COUNT = 28;

/** JSONb EDT: claves string "1"–"28" con valores A|B|C|D. */
export type EdtAnswersPayload = Record<
  `${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28}`,
  EdtAnswerOption
>;

export function buildEdtAnswersPayload(
  answers: Record<number, EdtAnswerOption>,
  questionNumbers?: Iterable<number>,
): Record<string, EdtAnswerOption> {
  const payload: Record<string, EdtAnswerOption> = {};
  const numbers = questionNumbers
    ? [...questionNumbers]
    : Array.from({ length: EDT_QUESTION_COUNT }, (_, index) => index + 1);

  for (const questionNumber of numbers) {
    const value = answers[questionNumber];
    if (value !== undefined) {
      payload[String(questionNumber)] = value;
    }
  }

  return payload;
}

export function getFirstMissingEdtAnswer(
  answers: Record<number, EdtAnswerOption>,
): number | null {
  for (let questionNumber = 1; questionNumber <= EDT_QUESTION_COUNT; questionNumber += 1) {
    if (answers[questionNumber] === undefined) {
      return questionNumber;
    }
  }

  return null;
}

export type SurveyQuestion = {
  id: string;
  survey_id: string;
  question_number: number;
  text: string;
  block: string;
};

export const EDT_ANSWER_OPTIONS: Array<{
  value: EdtAnswerOption;
  label: string;
  description: string;
}> = [
  { value: "A", label: "A", description: "Totalmente de acuerdo" },
  { value: "B", label: "B", description: "De acuerdo" },
  { value: "C", label: "C", description: "En desacuerdo" },
  { value: "D", label: "D", description: "Totalmente en desacuerdo" },
];

export async function fetchDefaultEdtSurveyId(): Promise<{
  surveyId: string | null;
  error: string | null;
}> {
  const supabase = createClientComponentClient();
  const { data, error } = await supabase
    .from("surveys")
    .select("id")
    .eq("title", STANDARD_EDT_SURVEY_TITLE)
    .maybeSingle();

  if (error) {
    console.error("[surveyQuestions] Error al resolver survey EDT:", error);
    return { surveyId: null, error: error.message };
  }

  if (!data?.id) {
    return {
      surveyId: null,
      error: "No se encontró la encuesta EDT estándar en Supabase.",
    };
  }

  return { surveyId: data.id, error: null };
}

function mapSurveyQuestionRows(
  rows: Array<Record<string, unknown>>,
  surveyId?: string,
): SurveyQuestion[] {
  return rows
    .filter((row) => !surveyId || String(row.survey_id) === surveyId)
    .map((row) => ({
      id: String(row.id),
      survey_id: String(row.survey_id),
      question_number: Number(row.question_number),
      text: typeof row.text === "string" ? row.text.trim() : "",
      block: typeof row.block === "string" ? row.block.trim() : "",
    }))
    .filter((question) => question.text.length > 0)
    .sort((left, right) => left.question_number - right.question_number);
}

export async function fetchSurveyQuestions(
  surveyId?: string,
): Promise<{ data: SurveyQuestion[]; error: string | null }> {
  try {
    const supabase = createClientComponentClient();
    const { data, error } = await supabase
      .from("survey_questions")
      .select("*")
      .order("question_number", { ascending: true });

    if (error) {
      console.error("[surveyQuestions] Error al cargar preguntas:", error);
      return { data: [], error: error.message };
    }

    return {
      data: mapSurveyQuestionRows((data ?? []) as Array<Record<string, unknown>>, surveyId),
      error: null,
    };
  } catch (error) {
    console.error("[surveyQuestions] Error inesperado:", error);
    return {
      data: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function hasExistingSurveyResponse(input: {
  groupId: string;
  participantId: string;
  surveyId: string;
}): Promise<{ exists: boolean; error: string | null }> {
  const supabase = createClientComponentClient();
  const { count, error } = await supabase
    .from("responses")
    .select("id", { count: "exact", head: true })
    .eq("group_id", toSupabaseGroupId(input.groupId))
    .eq("participant_id", input.participantId)
    .eq("survey_id", input.surveyId);

  if (error) {
    return { exists: false, error: error.message };
  }

  return { exists: (count ?? 0) > 0, error: null };
}

export async function submitSurveyResponse(input: {
  groupId: string;
  participantId: string;
  surveyId: string;
  /** Claves "1"–"28" con valores A|B|C|D */
  answers: Record<string, EdtAnswerOption>;
}) {
  const supabase = createClientComponentClient();
  return supabase
    .from("responses")
    .insert({
      group_id: toSupabaseGroupId(input.groupId),
      participant_id: input.participantId,
      survey_id: input.surveyId,
      answers: input.answers,
    })
    .select("id")
    .single();
}
