"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import SociometricNativeQuestionnaire from "@/components/SociometricNativeQuestionnaire";
import { toSupabaseGroupId } from "@/lib/groupId";
import { getSupabase } from "@/lib/supabase";
import { STANDARD_EDT_SURVEY_TITLE } from "@/lib/surveyQuestions";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type GroupDetails = {
  id: string;
  name: string;
  age_band: string | null;
};

type BootstrapStatus =
  | "loading"
  | "ready"
  | "not_found"
  | "invalid_url"
  | "error";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function extractGroupIdFromParams(
  params: ReturnType<typeof useParams>,
): string {
  const raw = params.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

function filterQuestionsForSurvey(
  rows: Array<Record<string, unknown>>,
  surveyId: string,
): Array<Record<string, unknown>> {
  const forSurvey = rows.filter(
    (row) => String(row.survey_id ?? "") === surveyId,
  );
  return forSurvey.length > 0 ? forSurvey : rows;
}

// ---------------------------------------------------------------------------
// Pantallas de estado
// ---------------------------------------------------------------------------

function QuestionnaireBootstrapLoading({ label }: { label?: string }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-950 px-6">
      <div className="text-center">
        <span
          className="mx-auto mb-4 inline-flex h-10 w-10 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400"
          aria-hidden
        />
        <p className="text-sm text-slate-400">
          {label ?? "Cargando cuestionario EDT…"}
        </p>
      </div>
    </div>
  );
}

function QuestionnaireStatusScreen({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
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
        {action ? <div className="mt-8">{action}</div> : null}
      </div>
    </div>
  );
}

function IncompleteLinkScreen() {
  return (
    <QuestionnaireStatusScreen
      title="Enlace incompleto"
      message="La URL no incluye un identificador de equipo válido. Usa el enlace personalizado que te enviaron por correo o solicita uno nuevo a tu Manager."
      action={
        <Link
          href="/"
          className="inline-flex rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Volver al panel
        </Link>
      }
    />
  );
}

function GroupNotFoundScreen({ groupId }: { groupId: string }) {
  return (
    <QuestionnaireStatusScreen
      title="Grupo no encontrado"
      message={`No existe ningún equipo registrado con el identificador «${groupId}». Comprueba que el enlace sea correcto o solicita uno nuevo a tu Manager.`}
      action={
        <Link
          href="/"
          className="inline-flex rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Volver al panel
        </Link>
      }
    />
  );
}

function LoadErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <QuestionnaireStatusScreen
      title="No se pudo cargar el cuestionario"
      message={message}
      action={
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Reintentar
        </button>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function CuestionarioTeamPageClient() {
  const params = useParams();
  const searchParams = useSearchParams();

  const groupId = useMemo(() => extractGroupIdFromParams(params), [params]);
  const participantToken =
    searchParams.get("token") ?? searchParams.get("user");

  const [status, setStatus] = useState<BootstrapStatus>(() =>
    groupId ? "loading" : "invalid_url",
  );
  const [groupDetails, setGroupDetails] = useState<GroupDetails | null>(null);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [initialQuestions, setInitialQuestions] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!groupId) {
      setStatus("invalid_url");
      setGroupDetails(null);
      setSurveyId(null);
      setInitialQuestions([]);
      setLoadError(null);
      return;
    }

    let cancelled = false;

    async function loadGroupAndFramework() {
      setStatus("loading");
      setLoadError(null);
      setGroupDetails(null);
      setSurveyId(null);
      setInitialQuestions([]);

      try {
        const supabase = getSupabase();
        const supabaseGroupId = toSupabaseGroupId(groupId);

        // 1. Validar que el grupo existe en la base de datos
        const { data: groupRow, error: groupError } = await supabase
          .from("groups")
          .select("id, name, age_band")
          .eq("id", supabaseGroupId)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (groupError) {
          setLoadError(groupError.message);
          setStatus("error");
          return;
        }

        if (!groupRow?.id) {
          setStatus("not_found");
          return;
        }

        // 2. Resolver el survey EDT estándar
        const { data: surveyRow, error: surveyError } = await supabase
          .from("surveys")
          .select("id")
          .eq("title", STANDARD_EDT_SURVEY_TITLE)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (surveyError) {
          setLoadError(surveyError.message);
          setStatus("error");
          return;
        }

        const resolvedSurveyId =
          typeof surveyRow?.id === "string" ? surveyRow.id.trim() : null;

        if (!resolvedSurveyId) {
          setLoadError(
            `No se encontró la encuesta «${STANDARD_EDT_SURVEY_TITLE}» en Supabase.`,
          );
          setStatus("error");
          return;
        }

        // 3. Cargar preguntas del Framework EDT
        const { data: questionRows, error: questionsError } = await supabase
          .from("survey_questions")
          .select("*")
          .order("question_number", { ascending: true });

        if (cancelled) {
          return;
        }

        if (questionsError) {
          setLoadError(questionsError.message);
          setStatus("error");
          return;
        }

        const rows = (questionRows ?? []) as Array<Record<string, unknown>>;
        const questionsForSurvey = filterQuestionsForSurvey(
          rows,
          resolvedSurveyId,
        );

        if (questionsForSurvey.length === 0) {
          setLoadError(
            "No hay preguntas configuradas para el Framework EDT. Revisa el seed en Supabase.",
          );
          setStatus("error");
          return;
        }

        setGroupDetails({
          id: String(groupRow.id),
          name: String(groupRow.name ?? "").trim() || `Equipo ${groupId}`,
          age_band:
            typeof groupRow.age_band === "string" ? groupRow.age_band : null,
        });
        setSurveyId(resolvedSurveyId);
        setInitialQuestions(questionsForSurvey);
        setStatus("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "No se pudo cargar el cuestionario del equipo.";

        setLoadError(
          message.includes("NEXT_PUBLIC_SUPABASE")
            ? "Faltan las credenciales de Supabase en el entorno. Contacta con el administrador."
            : message,
        );
        setStatus("error");
      }
    }

    void loadGroupAndFramework();

    return () => {
      cancelled = true;
    };
  }, [groupId, retryCount]);

  // --- Renderizado por estado ---

  if (status === "invalid_url") {
    return <IncompleteLinkScreen />;
  }

  if (status === "loading") {
    return (
      <QuestionnaireBootstrapLoading
        label={
          groupId
            ? `Cargando cuestionario del equipo ${groupId}…`
            : "Cargando cuestionario EDT…"
        }
      />
    );
  }

  if (status === "not_found") {
    return <GroupNotFoundScreen groupId={groupId} />;
  }

  if (status === "error") {
    return (
      <LoadErrorScreen
        message={
          loadError ??
          "Ocurrió un error al consultar los datos del equipo. Inténtalo de nuevo más tarde."
        }
        onRetry={() => setRetryCount((count) => count + 1)}
      />
    );
  }

  if (status !== "ready" || !groupDetails || !surveyId || initialQuestions.length === 0) {
    return <QuestionnaireBootstrapLoading label="Preparando cuestionario…" />;
  }

  return (
    <SociometricNativeQuestionnaire
      groupId={groupId}
      surveyId={surveyId}
      participantToken={participantToken}
      groupName={groupDetails.name}
      initialQuestions={initialQuestions}
    />
  );
}
