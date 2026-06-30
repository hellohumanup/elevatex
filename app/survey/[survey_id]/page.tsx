import { Suspense } from "react";
import SurveyPublicPageClient from "./SurveyPublicPageClient";

export default function SurveyPublicPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-slate-950 px-6">
          <p className="text-sm text-slate-500">Cargando…</p>
        </div>
      }
    >
      <SurveyPublicPageClient />
    </Suspense>
  );
}
