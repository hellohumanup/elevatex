import type { Metadata } from "next";
import { Suspense } from "react";
import CuestionarioPageClient from "./CuestionarioPageClient";

export const metadata: Metadata = {
  title: "Cuestionario Sociométrico | Vínculo",
  description:
    "Participa en la dinámica de equipo de forma confidencial y segura.",
};

export default function CuestionarioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-slate-50 px-6">
          <p className="text-sm text-slate-500">Cargando cuestionario…</p>
        </div>
      }
    >
      <CuestionarioPageClient />
    </Suspense>
  );
}
