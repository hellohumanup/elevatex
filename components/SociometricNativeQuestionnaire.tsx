"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toSupabaseGroupId } from "@/lib/groupId";
import {
  buildEdtAnswersPayload,
  EDT_ANSWER_OPTIONS,
  STANDARD_EDT_SURVEY_TITLE,
  type EdtAnswerOption,
} from "@/lib/surveyQuestions";

type Participant = {
  id: string;
  name: string;
};

/** Bypass de FK estrictas en desarrollo local. */
const IS_LOCAL_DEV = process.env.NODE_ENV === "development";

type SurveyQuestion = {
  id: string;
  survey_id?: string;
  question_number: number;
  question_text: string;
  block?: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  a?: string;
  b?: string;
  c?: string;
  d?: string;
};

function normalizeSurveyQuestion(row: Record<string, unknown>): SurveyQuestion {
  const questionText = String(
    row.question_text ?? row.text ?? row.question ?? "",
  ).trim();

  const optionA = pickOptionText(row.option_a ?? row.a ?? row.A);
  const optionB = pickOptionText(row.option_b ?? row.b ?? row.B);
  const optionC = pickOptionText(row.option_c ?? row.c ?? row.C);
  const optionD = pickOptionText(row.option_d ?? row.d ?? row.D);

  return {
    id: String(row.id ?? ""),
    survey_id: row.survey_id != null ? String(row.survey_id) : undefined,
    question_number: Number(row.question_number),
    question_text: questionText,
    block: typeof row.block === "string" ? row.block.trim() : undefined,
    option_a: optionA,
    option_b: optionB,
    option_c: optionC,
    option_d: optionD,
    a: pickOptionText(row.a ?? row.A),
    b: pickOptionText(row.b ?? row.B),
    c: pickOptionText(row.c ?? row.C),
    d: pickOptionText(row.d ?? row.D),
  };
}

function normalizeSurveyQuestions(
  rows: Array<Record<string, unknown>>,
): SurveyQuestion[] {
  const byQuestionNumber = new Map<number, SurveyQuestion>();

  for (const row of rows) {
    const question = normalizeSurveyQuestion(row);
    if (
      question.question_text.length === 0 ||
      !Number.isFinite(question.question_number) ||
      question.question_number <= 0
    ) {
      continue;
    }

    if (!byQuestionNumber.has(question.question_number)) {
      byQuestionNumber.set(question.question_number, question);
    }
  }

  return Array.from(byQuestionNumber.values()).sort(
    (left, right) => left.question_number - right.question_number,
  );
}

function pickOptionText(value: unknown): string {
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

function resolveQuestionOptionText(
  question: SurveyQuestion | null | undefined,
  letter: EdtAnswerOption,
): string {
  if (!question) {
    const fallbackIndex = { A: 0, B: 1, C: 2, D: 3 }[letter];
    return EDT_ANSWER_OPTIONS[fallbackIndex]?.description ?? letter;
  }

  const rawText =
    letter === "A"
      ? question.option_a || question.a
      : letter === "B"
        ? question.option_b || question.b
        : letter === "C"
          ? question.option_c || question.c
          : question.option_d || question.d;

  const trimmed = pickOptionText(rawText);
  if (trimmed.length > 0) {
    return trimmed;
  }

  const fallbackIndex = { A: 0, B: 1, C: 2, D: 3 }[letter];
  return EDT_ANSWER_OPTIONS[fallbackIndex]?.description ?? letter;
}

function QuestionnaireLoadingSpinner({ message }: { message: string }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-950 px-6">
      <div className="text-center">
        <span className="mx-auto mb-4 inline-flex h-10 w-10 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
        <p className="text-sm text-slate-400">{message}</p>
      </div>
    </div>
  );
}

type AuthenticatedParticipant = {
  id: string;
  name: string;
  groupId: string;
  surveyCompletedAt: string | null;
};

type SociometricNativeQuestionnaireProps = {
  groupId: string;
  surveyId?: string;
  /** UUID del participante — query param `token` en la URL. */
  participantToken?: string | null;
  /** Nombre del equipo (precargado desde la ruta /cuestionario/[id]). */
  groupName?: string;
  /** Preguntas EDT ya cargadas por la página contenedora. */
  initialQuestions?: Array<Record<string, unknown>>;
};

const ONA_INFLUENCE_SLOTS = 3;
const ONA_COMMUNICATION_SLOTS = 2;

/** Survey EDT de pruebas — fallback local si la lookup en `surveys` falla o viene vacía. */
const FALLBACK_TEST_SURVEY_ID = "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d";

function AnswerOptionCard({
  letter,
  optionText,
  selected,
  onSelect,
}: {
  letter: EdtAnswerOption;
  optionText: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`Opción ${letter}: ${optionText}`}
      onClick={onSelect}
      className={`flex min-h-[5.5rem] flex-1 flex-col items-center justify-center rounded-2xl border px-3 py-4 text-center transition-all duration-200 ${
        selected
          ? "border-violet-400/70 bg-violet-600/20 text-white shadow-[0_0_24px_rgba(139,92,246,0.45)] ring-2 ring-violet-400/50"
          : "border-slate-700/80 bg-slate-900/60 text-slate-300 hover:border-violet-500/40 hover:bg-slate-800/80"
      }`}
    >
      <span className="text-2xl font-semibold tracking-tight">{letter}</span>
      <span
        className={`mt-2 text-xs font-medium leading-snug ${
          selected ? "text-violet-100" : "text-slate-400"
        }`}
      >
        {optionText}
      </span>
    </button>
  );
}

function ParticipantSearchSelect({
  id,
  label,
  value,
  options,
  excludedIds,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Participant[];
  excludedIds: Set<string>;
  onChange: (participantId: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return options.filter((participant) => {
      if (excludedIds.has(participant.id) && participant.id !== value) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return participant.name.toLowerCase().includes(normalized);
    });
  }, [excludedIds, options, query, value]);

  const selectedName =
    options.find((participant) => participant.id === value)?.name ?? "";

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4">
      <label
        htmlFor={`${id}-search`}
        className="mb-2 block text-xs font-semibold uppercase tracking-wide text-violet-300/90"
      >
        {label}
      </label>
      <input
        id={`${id}-search`}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar compañero por nombre…"
        className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-violet-500/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
      />
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-medium text-slate-200 focus:border-violet-500/60 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
      >
        <option value="">
          {selectedName || "Seleccionar compañero…"}
        </option>
        {filteredOptions.map((participant) => (
          <option key={participant.id} value={participant.id}>
            {participant.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function isRespondentNameColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("respondent_name") ||
    normalized.includes("schema cache") ||
    (normalized.includes("column") &&
      normalized.includes("responses") &&
      normalized.includes("could not find"))
  );
}

function buildAnswersPayload(
  edtAnswers: Record<number, EdtAnswerOption>,
  onaInfluence: string[],
  onaCommunication: string[],
): Record<string, EdtAnswerOption | string[]> {
  const payload: Record<string, EdtAnswerOption | string[]> = {
    ...buildEdtAnswersPayload(edtAnswers),
  };

  const influencia = onaInfluence.filter(Boolean);
  const comunicacion = onaCommunication.filter(Boolean);

  if (influencia.length > 0) {
    payload.influencia = influencia;
  }

  if (comunicacion.length > 0) {
    payload.comunicacion = comunicacion;
  }

  return payload;
}

function isSurveyCompletedColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("survey_completed_at") ||
    normalized.includes("schema cache") ||
    (normalized.includes("column") &&
      normalized.includes("participants") &&
      normalized.includes("could not find"))
  );
}

function groupsMatch(left: string, right: string): boolean {
  return String(toSupabaseGroupId(left)) === String(toSupabaseGroupId(right));
}

function TokenAccessError({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-950 px-6 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800/80 bg-slate-900/60 p-10 text-center shadow-2xl shadow-black/40 ring-1 ring-white/5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400/90">
          Evaluación EDT · ElevateX
        </p>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-400">{message}</p>
      </div>
    </div>
  );
}

async function resolveDefaultSurveyId(
  supabase: ReturnType<typeof createClientComponentClient>,
  surveyIdProp?: string,
): Promise<string> {
  if (surveyIdProp?.trim()) {
    return surveyIdProp.trim();
  }

  const { data: defaultSurvey, error: surveyLookupError } = await supabase
    .from("surveys")
    .select("id")
    .eq("title", STANDARD_EDT_SURVEY_TITLE)
    .maybeSingle();

  if (surveyLookupError) {
    console.warn(
      "[EDT Questionnaire] Error al resolver survey EDT — usando ID de pruebas:",
      surveyLookupError.message,
      FALLBACK_TEST_SURVEY_ID,
    );
    return FALLBACK_TEST_SURVEY_ID;
  }

  if (!defaultSurvey?.id) {
    console.warn(
      "[EDT Questionnaire] Survey EDT estándar no encontrado — usando ID de pruebas:",
      FALLBACK_TEST_SURVEY_ID,
    );
    return FALLBACK_TEST_SURVEY_ID;
  }

  return String(defaultSurvey.id);
}

export default function SociometricNativeQuestionnaire({
  groupId,
  surveyId: surveyIdProp,
  participantToken,
  groupName,
  initialQuestions,
}: SociometricNativeQuestionnaireProps) {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [authenticatedParticipant, setAuthenticatedParticipant] =
    useState<AuthenticatedParticipant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, EdtAnswerOption>>({});
  const [onaInfluence, setOnaInfluence] = useState<string[]>(
    () => Array.from({ length: ONA_INFLUENCE_SLOTS }, () => ""),
  );
  const [onaCommunication, setOnaCommunication] = useState<string[]>(
    () => Array.from({ length: ONA_COMMUNICATION_SLOTS }, () => ""),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const submitLockRef = useRef(false);

  const edtQuestions = useMemo(
    () =>
      [...questions]
        .filter(
          (question) =>
            question.question_text.length > 0 && question.question_number > 0,
        )
        .sort((left, right) => left.question_number - right.question_number),
    [questions],
  );

  const showOnaStep = participants.length > 0;

  const steps = useMemo(() => {
    const list: Array<
      { kind: "edt"; question: SurveyQuestion } | { kind: "ona" }
    > = [];

    for (const question of edtQuestions) {
      list.push({ kind: "edt", question });
    }

    if (showOnaStep) {
      list.push({ kind: "ona" });
    }

    return list;
  }, [edtQuestions, showOnaStep]);

  const totalSteps = steps.length;
  const safeCurrentStep =
    totalSteps > 0 ? Math.min(currentStep, totalSteps - 1) : 0;
  const progressPercent =
    totalSteps <= 1 ? 0 : Math.round((safeCurrentStep / (totalSteps - 1)) * 100);
  const activeStep = steps[safeCurrentStep];
  const currentEdtQuestion =
    activeStep?.kind === "edt" ? (activeStep.question ?? null) : null;
  const isLastStep = safeCurrentStep === totalSteps - 1 && totalSteps > 0;
  const showSubmitButton = isLastStep;
  const isEdtStepPending =
    activeStep?.kind === "edt" &&
    (questions.length === 0 || currentEdtQuestion == null);

  useEffect(() => {
    let cancelled = false;

    async function loadQuestionnaireData() {
      setIsLoading(true);
      setCurrentStep(0);
      setError(null);
      setTokenError(null);
      setAlreadyCompleted(false);
      setAuthenticatedParticipant(null);

      const token = participantToken?.trim() ?? "";

      if (!token) {
        setTokenError(
          "Este cuestionario requiere un enlace personalizado con token. Solicita tu enlace único al Manager del equipo.",
        );
        setIsLoading(false);
        return;
      }

      try {
        const { data: participantRow, error: participantLookupError } =
          await supabase
            .from("participants")
            .select("id, name, group_id, survey_completed_at")
            .eq("id", token)
            .maybeSingle();

        if (cancelled) {
          return;
        }

        if (participantLookupError || !participantRow?.id) {
          setTokenError(
            participantLookupError?.message ??
              "El enlace no es válido o ha expirado. Comprueba que usas el enlace personal que te enviaron.",
          );
          return;
        }

        const participantGroupId = String(participantRow.group_id ?? "").trim();
        const participantName =
          typeof participantRow.name === "string"
            ? participantRow.name.trim()
            : "";

        if (!participantName || !participantGroupId) {
          setTokenError(
            "No se pudo verificar tu identidad en el equipo. Contacta con tu Manager.",
          );
          return;
        }

        if (!groupsMatch(groupId, participantGroupId)) {
          setTokenError(
            "Este enlace no corresponde al equipo indicado en la URL. Usa el enlace que te enviaron por correo.",
          );
          return;
        }

        const resolvedSurveyId = await resolveDefaultSurveyId(
          supabase,
          surveyIdProp,
        );

        if (cancelled) {
          return;
        }

        const surveyId =
          surveyIdProp?.trim() || resolvedSurveyId || FALLBACK_TEST_SURVEY_ID;
        setActiveSurveyId(surveyId);

        const surveyCompletedAt =
          typeof participantRow.survey_completed_at === "string"
            ? participantRow.survey_completed_at
            : null;

        const { count: existingResponseCount, error: duplicateError } =
          await supabase
            .from("responses")
            .select("id", { count: "exact", head: true })
            .eq("participant_id", String(participantRow.id))
            .eq("survey_id", surveyId);

        if (cancelled) {
          return;
        }

        if (duplicateError && !IS_LOCAL_DEV) {
          console.warn(
            "[EDT Questionnaire] Error comprobando respuesta previa:",
            duplicateError.message,
          );
        }

        if (
          surveyCompletedAt ||
          (!duplicateError && (existingResponseCount ?? 0) > 0)
        ) {
          setAlreadyCompleted(true);
          setAuthenticatedParticipant({
            id: String(participantRow.id),
            name: participantName,
            groupId: participantGroupId,
            surveyCompletedAt,
          });
          return;
        }

        const { data, error: questionsError } = initialQuestions?.length
          ? { data: initialQuestions, error: null }
          : await supabase
              .from("survey_questions")
              .select("*")
              .order("question_number", { ascending: true });

        console.log("Preguntas descargadas:", data);

        if (cancelled) {
          return;
        }

        const loadedQuestions = normalizeSurveyQuestions(
          (data ?? []) as Array<Record<string, unknown>>,
        );
        setQuestions(loadedQuestions);

        if (questionsError) {
          console.warn(
            "[EDT Questionnaire] Error al cargar survey_questions:",
            questionsError.message,
          );
        }

        if (loadedQuestions.length === 0) {
          setError(
            questionsError?.message ??
              "No hay preguntas configuradas para este cuestionario. Revisa el seed en Supabase.",
          );
        }

        const { data: participantRows, error: participantsError } = await supabase
          .from("participants")
          .select("id, name")
          .eq("group_id", participantGroupId)
          .order("name", { ascending: true });

        if (cancelled) {
          return;
        }

        if (participantsError) {
          console.warn(
            "[EDT Questionnaire] Error al cargar participantes:",
            participantsError.message,
          );
        }

        const loadedParticipants = (participantRows ?? [])
          .map((row) => ({
            id: String(row.id),
            name: typeof row.name === "string" ? row.name.trim() : "",
          }))
          .filter((participant) => participant.name.length > 0);

        setParticipants(loadedParticipants);
        setAuthenticatedParticipant({
          id: String(participantRow.id),
          name: participantName,
          groupId: participantGroupId,
          surveyCompletedAt,
        });
        setAnswers({});
        setCurrentStep(0);

        if (loadedQuestions.length > 0) {
          setError(null);
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        console.warn("[EDT Questionnaire] Error inesperado al cargar:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "No se pudo cargar el cuestionario.",
        );
        setQuestions([]);
        setActiveSurveyId(FALLBACK_TEST_SURVEY_ID);
        setParticipants([]);
        setAuthenticatedParticipant(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadQuestionnaireData();

    return () => {
      cancelled = true;
    };
  }, [groupId, surveyIdProp, participantToken, initialQuestions]);

  useEffect(() => {
    setCurrentStep((step) => {
      if (steps.length === 0) {
        return 0;
      }

      if (step >= steps.length) {
        return 0;
      }

      return step;
    });
  }, [steps.length]);

  useEffect(() => {
    if (questions.length > 0) {
      setCurrentStep(0);
    }
  }, [questions.length]);

  function updateAnswer(questionNumber: number, value: EdtAnswerOption) {
    setAnswers((current) => ({ ...current, [questionNumber]: value }));
    setError(null);
  }

  function updateOnaInfluence(index: number, participantId: string) {
    setOnaInfluence((current) => {
      const next = [...current];
      next[index] = participantId;
      return next;
    });
    setError(null);
  }

  function updateOnaCommunication(index: number, participantId: string) {
    setOnaCommunication((current) => {
      const next = [...current];
      next[index] = participantId;
      return next;
    });
    setError(null);
  }

  function validateCurrentStep(): boolean {
    if (!activeStep) {
      return false;
    }

    if (activeStep.kind === "edt") {
      if (!activeStep.question) {
        setError("La pregunta actual no está disponible. Recarga la página.");
        return false;
      }

      if (!answers[activeStep.question.question_number]) {
        setError(
          `Selecciona una opción (A–D) para la pregunta ${activeStep.question.question_number}.`,
        );
        return false;
      }
      return true;
    }

    if (activeStep.kind === "ona") {
      const influenceCount = onaInfluence.filter(Boolean).length;
      if (influenceCount < 1) {
        setError("Nombra al menos un compañero en el bloque de influencia.");
        return false;
      }
      return true;
    }

    return true;
  }

  function validateAllBeforeSubmit(): boolean {
    if (!authenticatedParticipant?.id) {
      setError("No se pudo verificar tu identidad. Usa tu enlace personalizado.");
      return false;
    }

    if (!activeSurveyId) {
      setError("No se pudo identificar la encuesta activa.");
      return false;
    }

    for (const question of edtQuestions) {
      if (!answers[question.question_number]) {
        setError(
          `Falta responder la pregunta ${question.question_number}: «${question.question_text}».`,
        );
        setCurrentStep(
          steps.findIndex(
            (step) =>
              step.kind === "edt" &&
              step.question.question_number === question.question_number,
          ),
        );
        return false;
      }
    }

    if (showOnaStep && onaInfluence.filter(Boolean).length < 1) {
      setError("Completa al menos una nominación en el bloque ONA.");
      setCurrentStep(steps.length - 1);
      return false;
    }

    if (Object.keys(buildEdtAnswersPayload(answers)).length !== edtQuestions.length) {
      setError(
        `Completa las ${edtQuestions.length} preguntas del cuestionario antes de enviar.`,
      );
      return false;
    }

    return true;
  }

  function resolveRespondentName(): string {
    return authenticatedParticipant?.name ?? "Colaborador";
  }

  async function markParticipantCompleted(participantId: string): Promise<void> {
    const completedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("participants")
      .update({ survey_completed_at: completedAt })
      .eq("id", participantId);

    if (!updateError) {
      return;
    }

    if (isSurveyCompletedColumnError(updateError.message)) {
      console.warn(
        "[EDT Questionnaire] Fallback: survey_completed_at no disponible en schema cache.",
        updateError.message,
      );
      return;
    }

    console.warn(
      "[EDT Questionnaire] No se pudo marcar al participante como completado:",
      updateError.message,
    );
  }

  function goNext() {
    if (!validateCurrentStep()) {
      return;
    }

    setError(null);
    setCurrentStep((step) => Math.min(step + 1, totalSteps - 1));
  }

  function goPrevious() {
    setError(null);
    setCurrentStep((step) => Math.max(step - 1, 0));
  }

  function clearQuestionnaireState() {
    setAnswers({});
    setCurrentStep(0);
    setOnaInfluence(Array.from({ length: ONA_INFLUENCE_SLOTS }, () => ""));
    setOnaCommunication(
      Array.from({ length: ONA_COMMUNICATION_SLOTS }, () => ""),
    );
    setError(null);
  }

  async function persistSurveyResponse(input: {
    participantId: string;
    respondentName: string;
    answersPayload: Record<string, EdtAnswerOption | string[] | string>;
    groupIdForInsert: string | number;
  }): Promise<void> {
    const buildResponseRow = (
      includeRespondentColumn: boolean,
    ): Record<string, unknown> => {
      const row: Record<string, unknown> = {
        survey_id: activeSurveyId,
        participant_id: input.participantId,
        answers: input.answersPayload,
        group_id: input.groupIdForInsert,
      };

      if (includeRespondentColumn) {
        row.respondent_name = input.respondentName;
      }

      return row;
    };

    const tryInsert = async (
      row: Record<string, unknown>,
    ): Promise<{ error: { message: string } | null }> => {
      const { error } = await supabase.from("responses").insert(row);
      return { error };
    };

    try {
      const primaryRow = buildResponseRow(true);
      const { error: insertError } = await tryInsert(primaryRow);

      if (!insertError) {
        return;
      }

      if (isRespondentNameColumnError(insertError.message)) {
        console.warn(
          "[EDT Questionnaire] Fallback: respondent_name omitido del payload principal:",
          insertError.message,
        );

        const { error: fallbackError } = await tryInsert(buildResponseRow(false));
        if (fallbackError) {
          throw new Error(fallbackError.message);
        }

        return;
      }

      if (IS_LOCAL_DEV) {
        console.warn(
          "[EDT Questionnaire] Dev bypass: reintentando responses sin respondent_name en columna:",
          insertError.message,
        );

        const { error: devFallbackError } = await tryInsert({
          survey_id: activeSurveyId,
          participant_id: input.participantId,
          group_id: input.groupIdForInsert,
          answers: input.answersPayload,
        });

        if (devFallbackError) {
          throw new Error(devFallbackError.message);
        }

        return;
      }

      throw new Error(insertError.message);
    } catch (persistError) {
      if (
        persistError instanceof Error &&
        isRespondentNameColumnError(persistError.message)
      ) {
        console.warn(
          "[EDT Questionnaire] Fallback tras excepción de respondent_name:",
          persistError.message,
        );

        const { error: fallbackError } = await tryInsert(buildResponseRow(false));
        if (fallbackError) {
          throw new Error(fallbackError.message);
        }

        return;
      }

      throw persistError;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitLockRef.current || isSubmitting || !activeSurveyId) {
      return;
    }

    if (currentStep < totalSteps - 1) {
      goNext();
      return;
    }

    if (!validateAllBeforeSubmit()) {
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const participantId = authenticatedParticipant?.id;

      if (!participantId) {
        throw new Error(
          "No se pudo verificar tu identidad. Usa el enlace personalizado que te enviaron.",
        );
      }

      const groupIdForInsert = toSupabaseGroupId(groupId);

      const { count, error: duplicateError } = await supabase
        .from("responses")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", participantId)
        .eq("group_id", groupIdForInsert)
        .eq("survey_id", activeSurveyId);

      if (duplicateError) {
        if (IS_LOCAL_DEV) {
          console.warn(
            "[EDT Questionnaire] Dev bypass: error comprobando duplicados:",
            duplicateError.message,
          );
        } else {
          throw new Error(duplicateError.message);
        }
      } else if ((count ?? 0) > 0) {
        setAlreadyCompleted(true);
        setError(
          "Ya has completado este cuestionario. No se permiten envíos duplicados.",
        );
        return;
      }

      const respondentName = resolveRespondentName();
      const answersPayload: Record<string, EdtAnswerOption | string[] | string> =
        {
          ...buildAnswersPayload(answers, onaInfluence, onaCommunication),
          respondent_name: respondentName,
        };

      await persistSurveyResponse({
        participantId,
        respondentName,
        answersPayload,
        groupIdForInsert,
      });

      await markParticipantCompleted(participantId);

      clearQuestionnaireState();
      router.replace("/survey/gracias");
    } catch (submitError) {
      console.error("[EDT Questionnaire] Error al enviar:", submitError);
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo enviar el cuestionario.",
      );
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  }

  const excludedOnaIds = useMemo(() => {
    const ids = new Set<string>();
    if (authenticatedParticipant?.id) {
      ids.add(authenticatedParticipant.id);
    }
    for (const id of [...onaInfluence, ...onaCommunication]) {
      if (id) {
        ids.add(id);
      }
    }
    return ids;
  }, [authenticatedParticipant?.id, onaCommunication, onaInfluence]);

  if (tokenError) {
    return (
      <TokenAccessError
        title="Enlace no válido"
        message={tokenError}
      />
    );
  }

  if (alreadyCompleted) {
    return (
      <TokenAccessError
        title="Cuestionario ya completado"
        message={`${
          authenticatedParticipant?.name
            ? `${authenticatedParticipant.name}, `
            : ""
        }ya has enviado tus respuestas. No es posible volver a responder con este enlace.`}
      />
    );
  }

  if (isLoading || isEdtStepPending || !authenticatedParticipant) {
    return (
      <QuestionnaireLoadingSpinner
        message={
          isLoading
            ? "Cargando cuestionario EDT…"
            : "Preparando pregunta…"
        }
      />
    );
  }

  return (
    <div className="min-h-full bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <span className="inline-flex rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-violet-300 shadow-[0_0_12px_rgba(139,92,246,0.25)]">
            Evaluación EDT · ElevateX
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white">
            Cuestionario de Dinámicas de Trabajo
          </h1>
          {groupName ? (
            <p className="mt-2 text-sm font-medium text-slate-300">
              Equipo: {groupName}
            </p>
          ) : null}
          {authenticatedParticipant ? (
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-violet-200">
              Hola, {authenticatedParticipant.name}. Bienvenido al cuestionario de
              ElevateX.
            </p>
          ) : null}
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400">
            Responde con sinceridad. Tus respuestas alimentan el diagnóstico del
            equipo y el análisis de redes ONA.
          </p>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>
                Paso {safeCurrentStep + 1} de {totalSteps}
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.65)] transition-all duration-300"
                style={{ width: `${Math.max(progressPercent, 4)}%` }}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 pb-16">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {activeStep?.kind === "edt" && currentEdtQuestion && (
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 shadow-[0_0_24px_rgba(0,0,0,0.35)]">
              <div className="border-b border-slate-800 px-6 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
                  Pregunta {currentEdtQuestion.question_number}
                  {currentEdtQuestion.block
                    ? ` · ${currentEdtQuestion.block}`
                    : ""}
                </p>
                <h2
                  id={`question-${currentEdtQuestion.question_number}-prompt`}
                  className="mt-2 text-lg font-semibold leading-snug text-white"
                >
                  {currentEdtQuestion.question_text}
                </h2>
              </div>
              <div className="px-6 py-6">
                <div
                  className="grid grid-cols-2 gap-3 sm:grid-cols-4"
                  role="radiogroup"
                  aria-labelledby={`question-${currentEdtQuestion.question_number}-prompt`}
                >
                  {(["A", "B", "C", "D"] as const).map((letter) => (
                    <AnswerOptionCard
                      key={`${currentEdtQuestion.id}-${letter}`}
                      letter={letter}
                      optionText={resolveQuestionOptionText(
                        currentEdtQuestion,
                        letter,
                      )}
                      selected={
                        answers[currentEdtQuestion.question_number] === letter
                      }
                      onSelect={() =>
                        updateAnswer(currentEdtQuestion.question_number, letter)
                      }
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeStep?.kind === "ona" && (
            <section className="overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/50 shadow-[0_0_28px_rgba(34,211,238,0.12)]">
              <div className="border-b border-cyan-500/20 px-6 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-400">
                  Análisis de Redes · ONA
                </p>
                <h2 className="mt-2 text-lg font-semibold text-white">
                  Nominaciones sociométricas
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Selecciona compañeros de tu mismo equipo. Usa el buscador para
                  encontrarlos rápidamente.
                </p>
              </div>
              <div className="space-y-4 px-6 py-6">
                {participants.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No hay compañeros registrados en este equipo todavía.
                  </p>
                ) : (
                  <>
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">
                        Influencia positiva en tu trabajo
                      </p>
                      {onaInfluence.map((value, index) => (
                        <ParticipantSearchSelect
                          key={`influence-${index}`}
                          id={`ona-influence-${index}`}
                          label={`Nominación ${index + 1}`}
                          value={value}
                          options={participants}
                          excludedIds={excludedOnaIds}
                          onChange={(participantId) =>
                            updateOnaInfluence(index, participantId)
                          }
                        />
                      ))}
                    </div>
                    <div className="space-y-3 border-t border-slate-800 pt-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
                        Comunicación frecuente
                      </p>
                      {onaCommunication.map((value, index) => (
                        <ParticipantSearchSelect
                          key={`communication-${index}`}
                          id={`ona-communication-${index}`}
                          label={`Compañero ${index + 1}`}
                          value={value}
                          options={participants}
                          excludedIds={excludedOnaIds}
                          onChange={(participantId) =>
                            updateOnaCommunication(index, participantId)
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={goPrevious}
              disabled={safeCurrentStep === 0 || isSubmitting}
              className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>

            {showSubmitButton ? (
              <button
                type="submit"
                disabled={isSubmitting || edtQuestions.length === 0}
                className="rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.35)] transition-all hover:from-violet-500 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center justify-center gap-3">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                    Guardando respuestas...
                  </span>
                ) : (
                  "Enviar Cuestionario"
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={isSubmitting || edtQuestions.length === 0}
                className="rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(139,92,246,0.35)] transition-all hover:from-violet-500 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            )}
          </div>
        </form>
      </main>
    </div>
  );
}
