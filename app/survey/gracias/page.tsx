import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gracias · Evaluación EDT",
  description: "Confirmación de envío del cuestionario EDT ElevateX.",
};

export default function SurveyGraciasPage() {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-slate-950 px-6 py-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.18),transparent_65%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl"
      />

      <div className="relative w-full max-w-md rounded-2xl border border-violet-500/40 bg-slate-900/70 p-10 text-center shadow-[0_0_48px_rgba(139,92,246,0.28)] ring-1 ring-violet-400/20 backdrop-blur-sm">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-400/40 shadow-[0_0_24px_rgba(52,211,153,0.25)]"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-8 w-8 text-emerald-400"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M8 12.5 10.75 15.25 16 9.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">
          Evaluación EDT · ElevateX
        </p>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          ¡Muchas gracias por tu participación!
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-slate-400">
          Tus respuestas han sido guardadas de forma segura. Ya puedes cerrar
          esta ventana.
        </p>
      </div>
    </div>
  );
}
