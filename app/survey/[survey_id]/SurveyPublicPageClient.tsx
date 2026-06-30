"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import SociometricNativeQuestionnaire from "@/components/SociometricNativeQuestionnaire";

function SurveyPublicContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const surveyId = params.survey_id as string;
  const groupId = searchParams.get("group");
  const participantToken = searchParams.get("token");

  if (!groupId?.trim()) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-950 px-6 py-16">
        <div className="w-full max-w-lg rounded-2xl border border-slate-800/80 bg-slate-900/60 p-10 text-center shadow-2xl shadow-black/40 ring-1 ring-white/5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400/90">
            Evaluación EDT · ElevateX
          </p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
            Enlace de cuestionario
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            Para responder, utiliza el enlace completo que incluye el identificador
            de tu equipo. Si no lo tienes, contacta con tu Manager.
          </p>
          <p className="mt-6 font-mono text-xs text-slate-600">
            Survey ID: {surveyId}
          </p>
        </div>
      </div>
    );
  }

  return (
    <SociometricNativeQuestionnaire
      groupId={groupId.trim()}
      surveyId={surveyId}
      participantToken={participantToken}
    />
  );
}

export default function SurveyPublicPageClient() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-slate-950 px-6">
          <p className="text-sm text-slate-500">Cargando cuestionario…</p>
        </div>
      }
    >
      <SurveyPublicContent />
    </Suspense>
  );
}
