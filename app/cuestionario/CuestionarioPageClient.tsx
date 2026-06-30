"use client";

import Link from "next/link";

export default function CuestionarioPageClient() {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">
          Selecciona un equipo
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          El cuestionario ElevateX está vinculado a un equipo concreto. Accede
          desde el enlace del grupo:{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
            /cuestionario/[id]
          </code>
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Ir al dashboard
        </Link>
      </div>
    </div>
  );
}
