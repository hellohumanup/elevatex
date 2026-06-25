"use client";

import type { CSSProperties, ReactNode } from "react";
import type { IndividualEmployeeReport } from "@/lib/individualReportEngine";

export const INFORME_INDIVIDUAL_PDF_ID = "informe-individual-report";

/** Paleta HEX/RGB compatible con html2canvas (evita lab()/oklch() de Tailwind v4). */
const PDF = {
  white: "#ffffff",
  slate50: "#f8fafc",
  slate200: "#e2e8f0",
  slate500: "#64748b",
  slate600: "#475569",
  slate800: "#1e293b",
  slate900: "#0f172a",
  indigo50: "#eef2ff",
  indigo100: "#e0e7ff",
  indigo200: "#c7d2fe",
  indigo600: "#4f46e5",
  sky50: "#f0f9ff",
  sky600: "#0284c7",
  violet50: "#f5f3ff",
  violet600: "#7c3aed",
  headerBg: "linear-gradient(to bottom right, #0f172a, #1e293b, #1e1b4b)",
  headerGlow:
    "radial-gradient(circle at top right, rgba(255,255,255,0.12), transparent 45%)",
  oppCardBg: "linear-gradient(to right, #f8fafc, #eef2ff)",
  white10: "rgba(255, 255, 255, 0.1)",
  white15: "rgba(255, 255, 255, 0.15)",
  cardShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
} as const;

function ShieldIcon({ color = PDF.indigo200 }: { color?: string }) {
  return (
    <svg
      className="mt-0.5 h-6 w-6 shrink-0"
      style={{ color }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3 5 6v6c0 4.2 2.9 8.1 7 9 4.1-.9 7-4.8 7-9V6l-7-3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="m9.5 12 1.8 1.8L15 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function InfluenceIcon({ color }: { color: string }) {
  return (
    <svg
      className="h-5 w-5"
      style={{ color }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3v18M7 8l5-3 5 3M7 16l5 3 5-3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReciprocityIcon({ color }: { color: string }) {
  return (
    <svg
      className="h-5 w-5"
      style={{ color }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 7h10v10H7z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M9 12h6M12 9v6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CultureIcon({ color }: { color: string }) {
  return (
    <svg
      className="h-5 w-5"
      style={{ color }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3a5 5 0 0 1 5 5c0 2.2-1.4 4.1-3.4 4.8L12 21l-1.6-8.2A5 5 0 0 1 12 3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  accentBg,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  accentBg: string;
}) {
  return (
    <article
      className="rounded-2xl p-6"
      style={{
        backgroundColor: PDF.white,
        border: `1px solid ${PDF.slate200}`,
        boxShadow: PDF.cardShadow,
      }}
    >
      <div
        className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: accentBg }}
      >
        {icon}
      </div>
      <p
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: PDF.slate500 }}
      >
        {label}
      </p>
      <p
        className="mt-2 text-2xl font-semibold tracking-tight"
        style={{ color: PDF.slate900 }}
      >
        {value}
      </p>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: PDF.slate600 }}>
        {detail}
      </p>
    </article>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative h-24 w-24">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96" aria-hidden="true">
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke={PDF.slate200}
          strokeWidth="8"
        />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke={PDF.indigo600}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-lg font-semibold"
        style={{ color: PDF.slate900 }}
      >
        {score}%
      </span>
    </div>
  );
}

type IndividualEmployeeReportViewProps = {
  report: IndividualEmployeeReport;
  onDownloadPdf: () => void | Promise<void>;
  isDownloading?: boolean;
  downloadError?: string | null;
};

export default function IndividualEmployeeReportView({
  report,
  onDownloadPdf,
  isDownloading = false,
  downloadError = null,
}: IndividualEmployeeReportViewProps) {
  const confidentialityBoxStyle: CSSProperties = {
    backgroundColor: PDF.white10,
    border: `1px solid ${PDF.white15}`,
  };

  return (
    <div className="min-h-full" style={{ backgroundColor: PDF.slate50 }}>
      <div id={INFORME_INDIVIDUAL_PDF_ID} style={{ backgroundColor: PDF.white }}>
        <section
          className="relative overflow-hidden"
          style={{
            background: PDF.headerBg,
            color: PDF.white,
            borderBottom: `1px solid ${PDF.slate200}`,
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ background: PDF.headerGlow }}
          />
          <div className="relative mx-auto max-w-5xl px-6 py-12">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <span
                  className="inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
                  style={{
                    backgroundColor: PDF.white10,
                    color: PDF.indigo100,
                    border: `1px solid ${PDF.white15}`,
                  }}
                >
                  El Espejo del Profesional
                </span>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Informe Individual · {report.employeeName}
                </h1>
                <p className="mt-2 text-sm" style={{ color: PDF.indigo100 }}>
                  {report.teamName} · {report.organizationName}
                </p>
              </div>
              <div
                className="flex items-start gap-3 rounded-2xl p-4"
                style={confidentialityBoxStyle}
              >
                <ShieldIcon />
                <p
                  className="max-w-md text-sm leading-relaxed"
                  style={{ color: PDF.indigo50 }}
                >
                  Este es tu espacio personal de desarrollo. Tus resultados son
                  confidenciales y están diseñados para ayudarte a potenciar tu
                  impacto en el equipo.
                </p>
              </div>
            </div>
          </div>
        </section>

        <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
          <section>
            <div className="mb-6">
              <h2
                className="text-xl font-semibold"
                style={{ color: PDF.slate900 }}
              >
                Métricas Clave
              </h2>
              <p className="mt-1 text-sm" style={{ color: PDF.slate500 }}>
                Análisis EDT calculado a partir de tu posición en la red del equipo.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <MetricCard
                icon={<InfluenceIcon color={PDF.indigo600} />}
                label="In-Degree Técnico"
                value={report.technicalIndegreeLevel}
                detail={`${report.technicalIndegreeScore}/100 · ${report.technicalIndegree} nominaciones recibidas en la red del equipo.`}
                accentBg={PDF.indigo50}
              />
              <article
                className="rounded-2xl p-6"
                style={{
                  backgroundColor: PDF.white,
                  border: `1px solid ${PDF.slate200}`,
                  boxShadow: PDF.cardShadow,
                }}
              >
                <div
                  className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: PDF.sky50 }}
                >
                  <ReciprocityIcon color={PDF.sky600} />
                </div>
                <p
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: PDF.slate500 }}
                >
                  Reciprocidad de Confianza
                </p>
                <div className="mt-4 flex items-center gap-4">
                  <ScoreRing score={report.reciprocityPercent} />
                  <p className="text-sm leading-relaxed" style={{ color: PDF.slate600 }}>
                    {report.reciprocityMutualCount} conexiones mutuas · Solidez de
                    tus vínculos bidireccionales en el equipo.
                  </p>
                </div>
              </article>
              <MetricCard
                icon={<CultureIcon color={PDF.violet600} />}
                label="Energía Cultural"
                value={report.culturalEnergyLabel}
                detail={`Impacto estimado: ${report.culturalEnergyScore}/100 en el clima laboral de la organización.`}
                accentBg={PDF.violet50}
              />
            </div>
          </section>

          <section>
            <div className="mb-6">
              <h2
                className="text-xl font-semibold"
                style={{ color: PDF.slate900 }}
              >
                Tus Puntos Ciegos y Oportunidades
              </h2>
              <p className="mt-1 text-sm" style={{ color: PDF.slate500 }}>
                Recomendaciones constructivas basadas en tus métricas sociométricas.
              </p>
            </div>

            <div className="space-y-4">
              {report.opportunities.map((opportunity) => (
                <div
                  key={opportunity.id}
                  className="rounded-2xl px-6 py-5"
                  style={{
                    background: PDF.oppCardBg,
                    border: `1px solid ${PDF.slate200}`,
                    boxShadow: PDF.cardShadow,
                  }}
                >
                  <p
                    className="text-sm font-semibold"
                    style={{ color: PDF.slate800 }}
                  >
                    {opportunity.title}
                  </p>
                  <p
                    className="mt-2 text-sm leading-relaxed"
                    style={{ color: PDF.slate600 }}
                  >
                    {opportunity.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-10 pt-2">
        {downloadError && (
          <p className="mb-4 text-center text-sm text-[#dc2626]">{downloadError}</p>
        )}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={isDownloading}
            className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl px-6 py-3.5 text-sm font-semibold tracking-wide transition-all disabled:cursor-not-allowed disabled:opacity-70"
            style={{
              background: "linear-gradient(to bottom, #1e293b, #020617)",
              color: PDF.white,
              boxShadow:
                "0 1px 2px rgba(15, 23, 42, 0.12), 0 8px 24px rgba(15, 23, 42, 0.18)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(to right, transparent, rgba(255,255,255,0.25), transparent)",
              }}
            />
            {isDownloading ? (
              <>
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-t-[#ffffff]"
                  style={{ borderColor: "rgba(255,255,255,0.25)", borderTopColor: PDF.white }}
                />
                Generando PDF…
              </>
            ) : (
              "Descargar mi Plan de Acción en PDF"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
