import { toSupabaseGroupId } from "@/lib/groupId";
import { createClientComponentClient } from "@/lib/supabase/auth-helpers-nextjs-shim";
import type { SupabaseClient } from "@supabase/supabase-js";

export const STANDARD_EDT_SURVEY_TITLE =
  "Evaluación de Dinámicas de Trabajo (EDT) Estándar";

/** Plantilla global sembrada en migración 018. */
export const ONA_ELITE_SURVEY_ID =
  "a1000001-0001-4000-8000-000000000000" as const;

export const ONA_ELITE_SURVEY_NAME = "ONA Élite · Dimensiones";

/** Dimensiones ONA de élite para campañas dinámicas de evaluación. */
export const ONA_ELITE_DIMENSIONS = [
  "informacion",
  "confianza",
  "innovacion",
] as const;

export type OnaEliteDimension = (typeof ONA_ELITE_DIMENSIONS)[number];

export const ONA_ELITE_DIMENSION_LABELS: Record<OnaEliteDimension, string> = {
  informacion: "Información",
  confianza: "Confianza",
  innovacion: "Innovación",
};

/** UUIDs estables del seed 018 (útiles en tests / fixtures). */
export const ONA_ELITE_QUESTION_IDS: Record<OnaEliteDimension, string> = {
  informacion: "a1000001-0001-4000-8000-000000000001",
  confianza: "a1000001-0001-4000-8000-000000000002",
  innovacion: "a1000001-0001-4000-8000-000000000003",
};

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
  for (
    let questionNumber = 1;
    questionNumber <= EDT_QUESTION_COUNT;
    questionNumber += 1
  ) {
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

/**
 * Pregunta ONA dinámica (campos canónicos de survey_questions / vista
 * `ona_elite_questions`).
 */
export type OnaSurveyQuestion = {
  id: string;
  dimension: string;
  question_text: string;
  max_choices: number;
  created_at: string | null;
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

function resolveClient(supabaseClient?: SupabaseClient): SupabaseClient {
  return supabaseClient ?? createClientComponentClient();
}

/** Normaliza slug de dimensión (acentos / mayúsculas → canónico). */
export function normalizeOnaDimension(
  value: string | null | undefined,
): OnaEliteDimension | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "");

  if (normalized === "informacion" || normalized === "information") {
    return "informacion";
  }
  if (normalized === "confianza" || normalized === "trust") {
    return "confianza";
  }
  if (normalized === "innovacion" || normalized === "innovation") {
    return "innovacion";
  }

  return null;
}

export function isOnaEliteDimension(
  value: string | null | undefined,
): value is OnaEliteDimension {
  return normalizeOnaDimension(value) !== null;
}

function mapOnaSurveyQuestionRow(
  row: Record<string, unknown> | null | undefined,
): OnaSurveyQuestion | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const id = row.id != null ? String(row.id) : "";
  const dimensionRaw =
    typeof row.dimension === "string" ? row.dimension.trim() : "";
  const dimension =
    normalizeOnaDimension(dimensionRaw) ?? dimensionRaw.toLowerCase();
  const questionText = String(row.question_text ?? row.text ?? "").trim();
  const maxChoicesRaw = Number(row.max_choices);
  const maxChoices =
    Number.isFinite(maxChoicesRaw) && maxChoicesRaw > 0
      ? Math.floor(maxChoicesRaw)
      : 3;
  const createdAt =
    typeof row.created_at === "string"
      ? row.created_at
      : row.created_at != null
        ? String(row.created_at)
        : null;

  if (!id || !questionText) {
    return null;
  }

  return {
    id,
    dimension,
    question_text: questionText,
    max_choices: maxChoices,
    created_at: createdAt,
  };
}

export async function fetchDefaultEdtSurveyId(
  supabaseClient?: SupabaseClient,
): Promise<{
  surveyId: string | null;
  error: string | null;
}> {
  const supabase = resolveClient(supabaseClient);
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
      question_number: Number(row.question_number ?? row.order_index ?? 0),
      text:
        typeof row.text === "string"
          ? row.text.trim()
          : typeof row.question_text === "string"
            ? row.question_text.trim()
            : "",
      block:
        typeof row.block === "string"
          ? row.block.trim()
          : typeof row.dimension === "string"
            ? row.dimension.trim()
            : "",
    }))
    .filter((question) => question.text.length > 0)
    .sort((left, right) => left.question_number - right.question_number);
}

export async function fetchSurveyQuestions(
  surveyId?: string,
): Promise<{ data: SurveyQuestion[]; error: string | null }> {
  try {
    const supabase = createClientComponentClient();
    let query = supabase
      .from("survey_questions")
      .select("*")
      .order("question_number", { ascending: true });

    if (surveyId) {
      query = query.eq("survey_id", surveyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[surveyQuestions] Error al cargar preguntas:", error);
      return { data: [], error: error.message };
    }

    return {
      data: mapSurveyQuestionRows(
        (data ?? []) as Array<Record<string, unknown>>,
        surveyId,
      ),
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

/**
 * Carga la pregunta ONA activa para una dimensión de campaña.
 * Prioridad: vista `ona_elite_questions` → fallback `survey_questions`.
 */
export async function fetchOnaQuestionByDimension(
  dimensionInput: string,
  supabaseClient?: SupabaseClient,
): Promise<{ data: OnaSurveyQuestion | null; error: string | null }> {
  const dimension = normalizeOnaDimension(dimensionInput);

  if (!dimension) {
    return {
      data: null,
      error: `Dimensión ONA no válida: "${dimensionInput}". Usa informacion | confianza | innovacion.`,
    };
  }

  const supabase = resolveClient(supabaseClient);

  try {
    const { data: viewRow, error: viewError } = await supabase
      .from("ona_elite_questions")
      .select("id, dimension, question_text, max_choices, created_at")
      .eq("dimension", dimension)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!viewError && viewRow) {
      const mapped = mapOnaSurveyQuestionRow(
        viewRow as Record<string, unknown>,
      );
      if (mapped) {
        return { data: mapped, error: null };
      }
    }

    if (viewError && process.env.NODE_ENV === "development") {
      console.warn(
        "[surveyQuestions] Vista ona_elite_questions no disponible, fallback survey_questions:",
        viewError.message,
      );
    }

    const { data: tableRows, error: tableError } = await supabase
      .from("survey_questions")
      .select(
        "id, dimension, question_text, text, max_choices, created_at, question_type",
      )
      .eq("question_type", "ona_nomination")
      .ilike("dimension", dimension)
      .order("created_at", { ascending: true })
      .limit(1);

    if (tableError) {
      console.error(
        "[surveyQuestions] Error al cargar pregunta ONA por dimensión:",
        tableError,
      );
      return { data: null, error: tableError.message };
    }

    const firstRow = (tableRows ?? [])[0] as
      | Record<string, unknown>
      | undefined;
    const mapped = mapOnaSurveyQuestionRow(firstRow);

    if (!mapped) {
      return {
        data: null,
        error: `No hay pregunta ONA sembrada para la dimensión "${dimension}". Ejecuta la migración 018.`,
      };
    }

    return { data: mapped, error: null };
  } catch (error) {
    console.error("[surveyQuestions] Error inesperado (ONA dimensión):", error);
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Lista las 3 preguntas ONA de élite (catálogo de campaña). */
export async function fetchOnaEliteQuestions(
  supabaseClient?: SupabaseClient,
): Promise<{ data: OnaSurveyQuestion[]; error: string | null }> {
  const supabase = resolveClient(supabaseClient);

  const { data, error } = await supabase
    .from("ona_elite_questions")
    .select("id, dimension, question_text, max_choices, created_at");

  if (error) {
    const fallback = await Promise.all(
      ONA_ELITE_DIMENSIONS.map((dimension) =>
        fetchOnaQuestionByDimension(dimension, supabase),
      ),
    );
    const questions = fallback
      .map((result) => result.data)
      .filter((question): question is OnaSurveyQuestion => question !== null);

    if (questions.length === 0) {
      return { data: [], error: error.message };
    }

    return { data: questions, error: null };
  }

  const questions = (data ?? [])
    .map((row) => mapOnaSurveyQuestionRow(row as Record<string, unknown>))
    .filter((question): question is OnaSurveyQuestion => question !== null)
    .sort((left, right) => {
      const leftIndex = ONA_ELITE_DIMENSIONS.indexOf(
        normalizeOnaDimension(left.dimension) ?? "informacion",
      );
      const rightIndex = ONA_ELITE_DIMENSIONS.indexOf(
        normalizeOnaDimension(right.dimension) ?? "informacion",
      );
      return leftIndex - rightIndex;
    });

  return { data: questions, error: null };
}

/**
 * Resuelve la pregunta activa de la campaña:
 * 1) `dimension` explícita del mánager
 * 2) `groups.active_ona_dimension` si se pasa groupId
 * 3) fallback `informacion`
 */
export async function fetchActiveOnaCampaignQuestion(input: {
  dimension?: string | null;
  groupId?: string | number | null;
  supabaseClient?: SupabaseClient;
}): Promise<{
  data: OnaSurveyQuestion | null;
  dimension: OnaEliteDimension;
  error: string | null;
}> {
  const supabase = resolveClient(input.supabaseClient);
  let dimension = normalizeOnaDimension(input.dimension);

  if (!dimension && input.groupId != null && String(input.groupId).trim()) {
    const groupId = toSupabaseGroupId(String(input.groupId));
    const { data: groupRow, error: groupError } = await supabase
      .from("groups")
      .select("active_ona_dimension")
      .eq("id", groupId)
      .maybeSingle();

    if (groupError && process.env.NODE_ENV === "development") {
      console.warn(
        "[surveyQuestions] No se pudo leer groups.active_ona_dimension:",
        groupError.message,
      );
    }

    dimension = normalizeOnaDimension(
      typeof groupRow?.active_ona_dimension === "string"
        ? groupRow.active_ona_dimension
        : null,
    );
  }

  const resolvedDimension: OnaEliteDimension = dimension ?? "informacion";
  const result = await fetchOnaQuestionByDimension(resolvedDimension, supabase);

  return {
    data: result.data,
    dimension: resolvedDimension,
    error: result.error,
  };
}

/** Persiste la dimensión activa de campaña elegida por el mánager. */
export async function setGroupActiveOnaDimension(input: {
  groupId: string | number;
  dimension: string;
  supabaseClient?: SupabaseClient;
}): Promise<{ success: boolean; error: string | null }> {
  const dimension = normalizeOnaDimension(input.dimension);

  if (!dimension) {
    return {
      success: false,
      error: `Dimensión inválida: "${input.dimension}".`,
    };
  }

  const supabase = resolveClient(input.supabaseClient);
  const { error } = await supabase
    .from("groups")
    .update({ active_ona_dimension: dimension })
    .eq("id", toSupabaseGroupId(String(input.groupId)));

  if (error) {
    console.error(
      "[surveyQuestions] Error al guardar active_ona_dimension:",
      error,
    );
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
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
