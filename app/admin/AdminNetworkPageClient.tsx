"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import OrganizationalNetworkDashboard from "@/components/OrganizationalNetworkDashboard";
import type { SurveyResponseRow } from "@/lib/surveyResponseGraph";

type AdminSurveyApiResponse = {
  error: string | null;
  fetchMode?: string;
  rawCount?: number;
  data?: unknown;
  graphRows?: SurveyResponseRow[];
};

export default function AdminNetworkPageClient() {
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponseRow[]>(
    [],
  );
  const [fetchMode, setFetchMode] = useState<string | null>(null);
  const [rawCount, setRawCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSurveyData = useCallback(async () => {
    setError(null);

    const response = await fetch(
      `/api/admin/survey-responses?t=${Date.now()}`,
      {
        method: "GET",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      },
    );

    const payload = (await response.json()) as AdminSurveyApiResponse;

    console.log("[admin panel] survey_responses payload:", payload);
    console.log("[admin panel] graphRows:", payload.graphRows);

    if (!response.ok || payload.error) {
      setError(payload.error ?? "No se pudieron cargar las respuestas del cuestionario.");
      setSurveyResponses([]);
      setRawCount(0);
      return;
    }

    setFetchMode(payload.fetchMode ?? null);
    setRawCount(payload.rawCount ?? payload.graphRows?.length ?? 0);
    setSurveyResponses(payload.graphRows ?? []);
  }, []);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await loadSurveyData();
      setIsLoading(false);
    }

    void load();
  }, [loadSurveyData]);

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                  Super User
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Panel de Administración · ONA
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                Análisis de Redes Organizacionales
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Grafo interactivo alimentado por{" "}
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                  survey_responses
                </code>{" "}
                + perfiles (emails visibles en nodos).
              </p>
              {!isLoading && fetchMode && (
                <p className="mt-2 text-xs text-slate-400">
                  Fuente: {fetchMode} · {rawCount} fila(s) en Supabase ·{" "}
                  {surveyResponses.length} fila(s) procesadas para el grafo
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Link
                href="/"
                className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                ← Panel de equipos
              </Link>
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  void loadSurveyData().finally(() => setIsLoading(false));
                }}
                className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
              >
                Actualizar datos
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <OrganizationalNetworkDashboard
          surveyRows={surveyResponses}
          isLoading={isLoading}
        />
      </main>
    </div>
  );
}
