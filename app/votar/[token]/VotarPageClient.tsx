"use client";

import { useEffect, useState } from "react";
import SociometricNativeQuestionnaire from "@/components/SociometricNativeQuestionnaire";
import { toSupabaseGroupId } from "@/lib/groupId";
import type { MagicLinkBootstrap } from "@/lib/magicLink";
import { getSupabase } from "@/lib/supabase";
import { STANDARD_EDT_SURVEY_TITLE } from "@/lib/surveyQuestions";
import VotarLinkStatus from "./VotarLinkStatus";

type VotarPageClientProps = {
  bootstrap: MagicLinkBootstrap;
};

type LoadStatus = "loading" | "ready" | "error";

function filterQuestionsForSurvey(
  rows: Array<Record<string, unknown>>,
  surveyId: string,
): Array<Record<string, unknown>> {
  const forSurvey = rows.filter(
    (row) => String(row.survey_id ?? "") === surveyId,
  );
  return forSurvey.length > 0 ? forSurvey : rows;
}

export default function VotarPageClient({ bootstrap }: VotarPageClientProps) {
  const groupId = bootstrap.groupId;
  const groupName = bootstrap.groupName ?? `Equipo ${groupId}`;

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [initialQuestions, setInitialQuestions] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadQuestionnaireFramework() {
      setStatus("loading");
      setLoadError(null);
      setSurveyId(null);
      setInitialQuestions([]);

      try {
        const supabase = getSupabase();
        const supabaseGroupId = toSupabaseGroupId(groupId);

        const { data: groupRow, error: groupError } = await supabase
          .from("groups")
          .select("id")
          .eq("id", supabaseGroupId)
          .maybeSingle();

        if (cancelled) {
          return;
        }

        if (groupError || !groupRow?.id) {
          setLoadError(
            groupError?.message ??
              "No se encontró el equipo asociado a tu enlace.",
          );
          setStatus("error");
          return;
        }

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

        const questionsForSurvey = filterQuestionsForSurvey(
          (questionRows ?? []) as Array<Record<string, unknown>>,
          resolvedSurveyId,
        );

        if (questionsForSurvey.length === 0) {
          setLoadError(
            "No hay preguntas configuradas para el cuestionario EDT.",
          );
          setStatus("error");
          return;
        }

        setSurveyId(resolvedSurveyId);
        setInitialQuestions(questionsForSurvey);
        setStatus("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : "No se pudo cargar el cuestionario.",
        );
        setStatus("error");
      }
    }

    void loadQuestionnaireFramework();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (status === "loading") {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-950 px-6">
        <div className="text-center">
          <span
            className="mx-auto mb-4 inline-flex h-10 w-10 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400"
            aria-hidden
          />
          <p className="text-sm text-slate-400">
            Hola {bootstrap.participantName}, preparando tu cuestionario…
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <VotarLinkStatus
        title="No se pudo cargar el cuestionario"
        message={
          loadError ??
          "Ocurrió un error al consultar los datos. Inténtalo de nuevo más tarde."
        }
      />
    );
  }

  if (!surveyId || initialQuestions.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-950 px-6">
        <p className="text-sm text-slate-400">Preparando cuestionario…</p>
      </div>
    );
  }

  return (
    <SociometricNativeQuestionnaire
      groupId={groupId}
      surveyId={surveyId}
      participantToken={bootstrap.participantId}
      groupName={groupName}
      initialQuestions={initialQuestions}
    />
  );
}
