import type { EdtMetricsResult, EdtSemanticLevel } from "@/lib/edtMetrics";

type EdtExecutiveDashboardProps = {
  metrics: EdtMetricsResult | null;
};

type MainBlock = {
  label: string;
  media: number;
  etiqueta: EdtSemanticLevel;
};

function semanticBadgeClasses(etiqueta: EdtSemanticLevel): string {
  switch (etiqueta) {
    case "Alto":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    case "Competitivo":
      return "bg-blue-100 text-blue-800 ring-blue-200";
    case "Bajo":
      return "bg-orange-100 text-orange-800 ring-orange-200";
    case "Crítico":
      return "bg-red-100 text-red-800 ring-red-200";
  }
}

function semanticBarClasses(etiqueta: EdtSemanticLevel): string {
  switch (etiqueta) {
    case "Alto":
      return "bg-emerald-500";
    case "Competitivo":
      return "bg-blue-500";
    case "Bajo":
      return "bg-orange-500";
    case "Crítico":
      return "bg-red-500";
  }
}

function formatScore(media: number): string {
  return media.toFixed(2);
}

function scoreBarWidth(media: number): string {
  const clamped = Math.max(0, Math.min(media, 4));
  return `${(clamped / 4) * 100}%`;
}

function EdtBlockCard({ label, media, etiqueta }: MainBlock) {
  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-xl font-semibold tracking-tight text-slate-900">
        {label}
      </h3>
      <p className="mt-4 text-4xl font-semibold tabular-nums tracking-tight text-slate-900">
        {formatScore(media)}
      </p>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">
        Media del bloque · escala 1.00–4.00
      </p>
      <div className="mt-5">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${semanticBadgeClasses(etiqueta)}`}
        >
          {etiqueta}
        </span>
      </div>
    </article>
  );
}

export default function EdtExecutiveDashboard({
  metrics,
}: EdtExecutiveDashboardProps) {
  if (!metrics || metrics.totalScoreCount === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Dashboard Ejecutivo EDT
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Diagnóstico ElevateX por bloques: Entorno, Dirección, Talento y EDT
            Transversal.
          </p>
        </div>
        <div className="px-6 py-10 text-center text-sm text-slate-500">
          Aún no hay respuestas EDT codificadas (preguntas 1–28 con valores A–D).
        </div>
      </section>
    );
  }

  const mainBlocks: MainBlock[] = [
    {
      label: "Entorno",
      media: metrics.entornoMedia,
      etiqueta: metrics.entornoEtiqueta,
    },
    {
      label: "Dirección",
      media: metrics.direccionMedia,
      etiqueta: metrics.direccionEtiqueta,
    },
    {
      label: "Talento",
      media: metrics.talentoMedia,
      etiqueta: metrics.talentoEtiqueta,
    },
  ];

  const transversal = metrics.bloques.transversal;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">
          Framework EDT · ElevateX
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">
          Dashboard Ejecutivo
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Medias aritméticas por bloque · {metrics.responseCount}{" "}
          {metrics.responseCount === 1 ? "respuesta" : "respuestas"} · Media
          global {formatScore(metrics.mediaGlobalSistema)} · σ{" "}
          {formatScore(metrics.desviacionTipica)}
        </p>
      </div>

      <div className="space-y-6 p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {mainBlocks.map((block) => (
            <EdtBlockCard key={block.label} {...block} />
          ))}
        </div>

        <article className="rounded-xl border border-slate-200 bg-slate-50/60 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-slate-900">
                EDT Transversal
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Preguntas 25 a 28
              </p>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatScore(transversal.media)}
              </p>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ring-inset ${semanticBadgeClasses(transversal.etiqueta)}`}
              >
                {transversal.etiqueta}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <div className="flex justify-between text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <span>1.00</span>
              <span>4.00</span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full transition-all ${semanticBarClasses(transversal.etiqueta)}`}
                style={{ width: scoreBarWidth(transversal.media) }}
              />
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
