import type { Metadata } from "next";
import { Suspense } from "react";
import InformeIndividualPageClient from "./InformeIndividualPageClient";

export const metadata: Metadata = {
  title: "Informe Individual | Vínculo",
  description:
    "Tu espacio personal de desarrollo profesional con análisis sociométrico confidencial.",
};

export default function InformeIndividualPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-slate-50 px-6">
          <p className="text-sm text-slate-500">Preparando tu informe personal…</p>
        </div>
      }
    >
      <InformeIndividualPageClient />
    </Suspense>
  );
}
