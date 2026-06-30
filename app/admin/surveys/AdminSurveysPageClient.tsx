"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildSurveyMagicLink,
  formatResponseCountLabel,
  formatSurveyCreatedAt,
  type ManagerSurveyRow,
} from "@/lib/adminSurveys";
import { FALLBACK_TEST_TENANT_ID } from "@/lib/groups";
import {
  computeEdtQualitativeSampling,
  type EdtQualitativeSamplingRecommendation,
} from "@/lib/edtQualitativeSampling";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

function QualitativeAuditSection({
  totalResponses,
  audit,
}: {
  totalResponses: number;
  audit: EdtQualitativeSamplingRecommendation;
}) {
  return (
    <section className="mb-10 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-700/35 via-slate-800/15 to-violet-900/25 p-px shadow-[0_0_40px_rgba(139,92,246,0.08)]">
      <div className="rounded-[15px] bg-slate-900/90 p-6 backdrop-blur-sm sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400/90">
              Framework ElevateX
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Auditoría Cualitativa Automatizada (Muestreo EDT)
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Recomendación oficial de entrevistas en profundidad según el volumen
              acumulado de respuestas cuantitativas del panel.
            </p>
          </div>

          <div className="inline-flex shrink-0 items-center self-start rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.2)] ring-1 ring-cyan-400/25">
            {totalResponses}{" "}
            {totalResponses === 1 ? "respuesta acumulada" : "respuestas acumuladas"}
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 ring-1 ring-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Tramo poblacional
            </p>
            <p className="mt-2 text-sm font-medium text-violet-200">{audit.bandLabel}</p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 ring-1 ring-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Entrevistas recomendadas
            </p>
            <p className="mt-2 text-lg font-semibold text-white">
              {audit.interviewsRangeLabel}
            </p>
            <p className="mt-1 text-xs text-slate-500">{audit.populationPercentLabel}</p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 ring-1 ring-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Foco analítico
            </p>
            <p className="mt-2 text-sm font-semibold text-cyan-200">{audit.focus}</p>
          </div>

          <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 shadow-[0_0_20px_rgba(139,92,246,0.08)] ring-1 ring-violet-400/15 sm:col-span-2 lg:col-span-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/80">
              Cobertura muestral
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
              {audit.populationPercentMin}–{audit.populationPercentMax}%
            </p>
            <p className="mt-1 text-xs text-slate-500">de la población respondida</p>
          </div>
        </div>

        <blockquote className="mt-6 rounded-xl border-l-2 border-violet-500/60 bg-slate-950/40 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Justificación metodológica
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {audit.justification}
          </p>
        </blockquote>
      </div>
    </section>
  );
}

function SurveyCard({
  survey,
  onCopyLink,
  isCopied,
}: {
  survey: ManagerSurveyRow;
  onCopyLink: (surveyId: string) => void;
  isCopied: boolean;
}) {
  return (
    <div className="group relative rounded-2xl bg-gradient-to-br from-slate-700/40 via-slate-800/20 to-slate-700/40 p-px shadow-xl shadow-black/25 transition-all duration-500 hover:bg-gradient-to-br hover:from-slate-600/60 hover:via-violet-500/35 hover:to-cyan-400/30 hover:shadow-[0_0_28px_rgba(139,92,246,0.12)]">
      <article className="flex h-full flex-col justify-between rounded-[15px] bg-slate-900/85 p-6 backdrop-blur-sm transition-colors duration-500 group-hover:bg-slate-900/75">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-semibold leading-snug tracking-tight text-white transition-colors group-hover:text-violet-50">
              {survey.title}
            </h2>
            <span className="inline-flex shrink-0 items-center rounded-full border border-cyan-400/20 bg-gradient-to-r from-violet-500/15 to-cyan-500/15 px-3 py-1.5 text-xs font-semibold tracking-wide text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.25),0_0_22px_rgba(139,92,246,0.2)] backdrop-blur-md ring-1 ring-cyan-400/25">
              <span
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]"
                aria-hidden="true"
              />
              {formatResponseCountLabel(survey.responseCount)}
            </span>
          </div>
          <p className="mt-3 text-sm text-slate-500 transition-colors group-hover:text-slate-400">
            Creada el {formatSurveyCreatedAt(survey.created_at)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onCopyLink(survey.id)}
          className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold tracking-wide transition-all duration-200 active:scale-[0.98] ${
            isCopied
              ? "scale-[1.02] bg-emerald-500/15 text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.25)] ring-1 ring-emerald-400/35"
              : "bg-gradient-to-r from-violet-600 via-violet-500 to-blue-500 text-white shadow-[0_0_15px_rgba(147,51,234,0.3)] ring-1 ring-violet-400/30 hover:scale-[1.02] hover:from-violet-500 hover:via-indigo-500 hover:to-cyan-400 hover:shadow-[0_0_24px_rgba(147,51,234,0.45),0_0_40px_rgba(59,130,246,0.2)]"
          }`}
        >
        {isCopied ? (
          <>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.42 0l-3.25-3.25a1 1 0 111.42-1.42l2.54 2.54 6.54-6.54a1 1 0 011.42 0z"
                clipRule="evenodd"
              />
            </svg>
            Enlace copiado
          </>
        ) : (
          <>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.435 3.435A1.5 1.5 0 0117 7.435V13.5A1.5 1.5 0 0115.5 15h-1v1.5a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 014 16.5v-11A1.5 1.5 0 015.5 4H7v-.5zM8.5 4a.5.5 0 00-.5.5V5h5.379a.5.5 0 00.353-.146L13.146 3.354A.5.5 0 0012.793 3H8.5zM5.5 5a.5.5 0 00-.5.5v11a.5.5 0 00.5.5h7a.5.5 0 00.5-.5V15H8.5A1.5 1.5 0 017 13.5v-8.5z" />
            </svg>
            Copiar Enlace Mágico
          </>
        )}
      </button>
      </article>
    </div>
  );
}

export default function AdminSurveysPageClient() {
  const [surveys, setSurveys] = useState<ManagerSurveyRow[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedSurveyId, setCopiedSurveyId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const totalResponses = useMemo(
    () => surveys.reduce((sum, survey) => sum + survey.responseCount, 0),
    [surveys],
  );

  const qualitativeAudit = useMemo(
    () => computeEdtQualitativeSampling(totalResponses),
    [totalResponses],
  );

  const fetchData = useCallback(async () => {
    setError(null);

    const supabase = createClientComponentClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.warn(
        "[admin/surveys] Error de sesión — continuando con tenant de pruebas:",
        authError.message,
      );
    }

    if (!user) {
      console.warn(
        "[admin/surveys] Sin sesión activa en local — usando tenant de pruebas.",
      );
    }

    let profile: { tenant_id: string | null } | null = null;

    if (user) {
      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .maybeSingle();

      profile = profileRow;

      if (profileError || !profile?.tenant_id) {
        console.warn(
          "[admin/surveys] Perfil ausente o sin tenant_id — usando tenant de pruebas:",
          profileError?.message ?? "tenant_id nulo",
        );
      }
    }

    const tenantId =
      profile?.tenant_id || FALLBACK_TEST_TENANT_ID;

    setTenantId(String(tenantId));

    const { data: surveyRows, error: surveysError } = await supabase
      .from("surveys")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (surveysError) {
      console.error("[admin/surveys] Error al leer surveys:", surveysError);
      setError(surveysError.message);
      setSurveys([]);
      return;
    }

    const loadedSurveys = surveyRows ?? [];

    if (loadedSurveys.length === 0) {
      setSurveys([]);
      return;
    }

    const surveyIds = loadedSurveys.map((survey) => String(survey.id));

    const { data: responseRows, error: responsesError } = await supabase
      .from("responses")
      .select("survey_id")
      .in("survey_id", surveyIds);

    if (responsesError) {
      console.warn("[admin/surveys] Error al contar responses:", responsesError);
    }

    const responseCounts = new Map<string, number>();
    for (const row of responseRows ?? []) {
      if (!row.survey_id) {
        continue;
      }

      const surveyId = String(row.survey_id);
      responseCounts.set(surveyId, (responseCounts.get(surveyId) ?? 0) + 1);
    }

    setSurveys(
      loadedSurveys.map((survey) => ({
        id: String(survey.id),
        title: String(survey.title),
        created_at: String(survey.created_at),
        tenant_id: String(survey.tenant_id),
        responseCount: responseCounts.get(String(survey.id)) ?? 0,
      })),
    );
  }, []);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await fetchData();
      setIsLoading(false);
    }

    void load();
  }, [fetchData]);

  async function handleCopyMagicLink(surveyId: string) {
    const magicLink = buildSurveyMagicLink(surveyId, window.location.origin);

    try {
      await navigator.clipboard.writeText(magicLink);
      setCopiedSurveyId(surveyId);
      setToastMessage("Enlace mágico copiado al portapapeles.");
      window.setTimeout(() => setCopiedSurveyId(null), 2500);
      window.setTimeout(() => setToastMessage(null), 3200);
    } catch (copyError) {
      console.error("[admin/surveys] Error al copiar enlace:", copyError);
      setToastMessage("No se pudo copiar el enlace. Inténtalo de nuevo.");
      window.setTimeout(() => setToastMessage(null), 3200);
    }
  }

  return (
    <div className="min-h-full bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400/90">
                ElevateX · Panel Manager
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Administración de Encuestas
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                Gestiona los cuestionarios EDT de tu organización, monitoriza la
                participación y comparte enlaces mágicos con tu equipo.
              </p>
              {tenantId && !isLoading && (
                <p className="mt-3 font-mono text-xs text-slate-600">
                  Tenant: {tenantId}
                </p>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href="/admin"
                className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/80 hover:text-white"
              >
                ← Panel ONA
              </Link>
              <Link
                href="/"
                className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800/80 hover:text-white"
              >
                Equipos
              </Link>
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  void fetchData().finally(() => setIsLoading(false));
                }}
                className="inline-flex items-center rounded-xl bg-gradient-to-b from-violet-600 to-violet-800 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(76,29,149,0.2)] ring-1 ring-white/10 transition-all hover:from-violet-500 hover:to-violet-700"
              >
                Actualizar
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <span className="mx-auto mb-4 inline-flex h-10 w-10 animate-spin rounded-full border-2 border-violet-500/20 border-t-violet-400" />
              <p className="text-sm text-slate-500">Cargando encuestas…</p>
            </div>
          </div>
        )}

        {!isLoading && error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {!isLoading && !error && (
          <QualitativeAuditSection
            totalResponses={totalResponses}
            audit={qualitativeAudit}
          />
        )}

        {!isLoading && !error && surveys.length === 0 && (
          <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 px-8 py-16 text-center ring-1 ring-white/5">
            <p className="text-lg font-medium text-slate-300">
              No hay encuestas registradas para tu organización.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Cuando se cree un cuestionario EDT en tu tenant, aparecerá aquí.
            </p>
          </div>
        )}

        {!isLoading && !error && surveys.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {surveys.map((survey) => (
              <SurveyCard
                key={survey.id}
                survey={survey}
                onCopyLink={handleCopyMagicLink}
                isCopied={copiedSurveyId === survey.id}
              />
            ))}
          </div>
        )}
      </main>

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
        >
          <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-slate-900/95 px-4 py-3 text-sm font-medium text-emerald-300 shadow-2xl shadow-black/40 ring-1 ring-emerald-500/20 backdrop-blur">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.42 0l-3.25-3.25a1 1 0 111.42-1.42l2.54 2.54 6.54-6.54a1 1 0 011.42 0z"
                clipRule="evenodd"
              />
            </svg>
            {toastMessage}
          </div>
        </div>
      )}
    </div>
  );
}
