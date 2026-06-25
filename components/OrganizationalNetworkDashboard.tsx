"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import SociogramGraph from "@/components/SociogramGraph";
import {
  computeOnaFromSurveyRows,
  NETWORK_LAYER_OPTIONS,
  type NetworkLayer,
} from "@/lib/onaMetrics";
import type { SurveyResponseRow } from "@/lib/surveyResponseGraph";

type OrganizationalNetworkDashboardProps = {
  surveyRows: SurveyResponseRow[];
  isLoading?: boolean;
  subtitle?: string;
};

export default function OrganizationalNetworkDashboard({
  surveyRows,
  isLoading = false,
  subtitle = "Datos en vivo desde survey_responses · Supabase",
}: OrganizationalNetworkDashboardProps) {
  const [networkLayer, setNetworkLayer] = useState<NetworkLayer>("all");

  const analysis = useMemo(
    () => computeOnaFromSurveyRows(surveyRows, networkLayer),
    [surveyRows, networkLayer],
  );

  const selectedLayerOption = NETWORK_LAYER_OPTIONS.find(
    (option) => option.value === networkLayer,
  );
  const maxVotes = analysis.ranking[0]?.votes ?? 0;

  if (isLoading) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
        Cargando análisis de red organizacional…
      </div>
    );
  }

  if (analysis.responseCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center">
        <p className="text-sm font-medium text-slate-700">
          Aún no hay respuestas en survey_responses
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Comparte el cuestionario nativo con los colaboradores para poblar el
          grafo interactivo.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Respuestas
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {analysis.responseCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Nodos en la capa
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {analysis.participants.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Enlaces en la capa
          </p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {analysis.links.length}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Mapa de Red Organizacional (ONA)
          </h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
          <label htmlFor="network-layer" className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Capa de la red
            </span>
            <div className="relative mt-2 max-w-xl">
              <select
                id="network-layer"
                value={networkLayer}
                onChange={(event) =>
                  setNetworkLayer(event.target.value as NetworkLayer)
                }
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3.5 pr-10 text-sm font-medium text-slate-800 shadow-sm transition-all hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-100"
              >
                {NETWORK_LAYER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            </div>
            {selectedLayerOption && (
              <p className="mt-2 text-xs text-slate-500">
                {selectedLayerOption.description}
              </p>
            )}
          </label>
        </div>

        <div className="p-6">
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-6">
              <MetricCard
                title="Densidad de Red"
                description={`Capa activa · ${analysis.networkDensity.linkCount} enlaces · ${analysis.networkDensity.nodeCount} nodos`}
              >
                <div className="mt-4 flex items-end gap-3 transition-all duration-300">
                  <p className="text-3xl font-semibold text-slate-900">
                    {analysis.networkDensity.densityPercent}%
                  </p>
                  <p className="pb-1 text-xs text-slate-500">
                    {analysis.networkDensity.linkCount}/
                    {analysis.networkDensity.maxPossibleLinks} posibles
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-500 ease-out"
                    style={{
                      width: `${analysis.networkDensity.densityPercent}%`,
                    }}
                  />
                </div>
              </MetricCard>

              <MetricCard
                title="Silos Detectados"
                description="Subgrupos conectados internamente pero separados del resto"
                tone="sky"
              >
                {analysis.networkSilos.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-600">
                    No hay silos significativos en la capa actual.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {analysis.networkSilos.map((silo) => (
                      <li
                        key={silo.id}
                        className="rounded-lg border border-sky-200/70 bg-white px-3 py-2.5 text-sm"
                      >
                        <p className="font-semibold text-slate-900">
                          {silo.memberNames.join(", ")}
                        </p>
                        <p className="mt-0.5 text-xs text-sky-700">
                          {silo.size} miembros
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </MetricCard>

              <LeaderList
                title="Líderes de Influencia"
                description="Top 3 con más conexiones recibidas en la capa"
                items={analysis.influenceLeaders.map((leader) => ({
                  key: leader.id,
                  name: leader.name,
                  badge: `${leader.votes} ${leader.votes === 1 ? "conexión" : "conexiones"}`,
                  badgeClass: "bg-indigo-100 text-indigo-700",
                }))}
                emptyMessage="Sin líderes identificados en esta capa."
              />

              <LeaderList
                title="Reciprocidad"
                description="Top 3 con más votos mutuos en la capa"
                items={analysis.reciprocityLeaders.map((leader) => ({
                  key: leader.id,
                  name: leader.name,
                  badge: `${leader.mutualConnections} mutuas`,
                  badgeClass: "bg-emerald-100 text-emerald-700",
                }))}
                emptyMessage="Aún no hay conexiones mutuas en esta capa."
              />

              <MetricCard title="Aislamiento" description="Sin conexiones entrantes en la capa" tone="amber">
                {analysis.isolatedParticipants.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-600">
                    Todos los miembros están integrados en la capa activa.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {analysis.isolatedParticipants.map((participant) => (
                      <li
                        key={participant.id}
                        className="rounded-lg border border-amber-200/70 bg-white px-3 py-2 text-sm font-medium text-slate-900"
                      >
                        {participant.name}
                      </li>
                    ))}
                  </ul>
                )}
              </MetricCard>
            </aside>

            <div
              key={networkLayer}
              className="transition-opacity duration-300 ease-in-out"
            >
              <SociogramGraph
                graphKey={networkLayer}
                nodes={analysis.nodes}
                links={analysis.links}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Ranking de Conexión
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Ordenado según la capa seleccionada:{" "}
            {selectedLayerOption?.label ?? "Ver Red Completa"}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Colaborador
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Conexiones
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Proporción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {analysis.ranking.map((entry, index) => (
                <tr key={entry.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                    #{index + 1}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                    {entry.name}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-indigo-700">
                    {entry.votes}
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all duration-500 ease-out"
                        style={{
                          width:
                            maxVotes > 0
                              ? `${(entry.votes / maxVotes) * 100}%`
                              : "0%",
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Detalle de Votaciones
          </h2>
        </div>
        <ul className="divide-y divide-slate-200">
          {analysis.voteDetails.map((detail) => (
            <li key={detail.voterId} className="px-6 py-5">
              <p className="text-sm font-semibold text-slate-900">
                {detail.voterName}
              </p>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                <p>
                  <span className="font-medium text-indigo-700">Técnico:</span>{" "}
                  {detail.technicalVotes.join(", ") || "Sin selección"}
                </p>
                <p>
                  <span className="font-medium text-emerald-700">Confianza:</span>{" "}
                  {detail.trustVotes.join(", ") || "Sin selección"}
                </p>
                <p>
                  <span className="font-medium text-violet-700">Cultura:</span>{" "}
                  {detail.cultureVotes.join(", ") || "Sin selección"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  description,
  tone = "slate",
  children,
}: {
  title: string;
  description: string;
  tone?: "slate" | "sky" | "amber";
  children: ReactNode;
}) {
  const toneClasses = {
    slate: "border-slate-200 bg-slate-50",
    sky: "border-sky-200/80 bg-sky-50/50",
    amber: "border-amber-200/80 bg-amber-50/50",
  } as const;

  return (
    <div className={`rounded-xl border p-5 ${toneClasses[tone]}`}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <p className="mt-1 text-xs text-slate-400">{description}</p>
      {children}
    </div>
  );
}

function LeaderList({
  title,
  description,
  items,
  emptyMessage,
}: {
  title: string;
  description: string;
  items: Array<{
    key: string;
    name: string;
    badge: string;
    badgeClass: string;
  }>;
  emptyMessage: string;
}) {
  return (
    <MetricCard title={title} description={description}>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {items.map((item, index) => (
            <li
              key={item.key}
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-400">#{index + 1}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">
                    {item.name}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${item.badgeClass}`}
                >
                  {item.badge}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </MetricCard>
  );
}
