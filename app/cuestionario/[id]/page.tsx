import { Suspense } from "react";
import CuestionarioTeamPageClient from "./CuestionarioTeamPageClient";

export default function CuestionarioTeamPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-slate-50 px-6">
          <p className="text-sm text-slate-500">Cargando cuestionario…</p>
        </div>
      }
    >
      <CuestionarioTeamPageClient />
    </Suspense>
  );
}
