import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Cookies | ElevateX",
  description: "Política de cookies del sitio web de ElevateX.",
};

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-400">
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-32">
        <Link
          href="/"
          className="inline-block text-sm font-medium text-cyan-400 transition-colors hover:text-cyan-300"
        >
          ← Volver al inicio
        </Link>

        <h1 className="text-4xl font-semibold tracking-tight text-slate-50">
          Política de Cookies
        </h1>

        <section className="space-y-6">
          <p className="leading-relaxed">
            Este sitio utiliza cookies propias y de terceros para garantizar el
            funcionamiento del sitio y analizar el uso de la web de forma
            agregada.
          </p>

          <p className="leading-relaxed">
            Las cookies técnicas son necesarias para la navegación. Las cookies
            analíticas y de terceros solo se activan con el consentimiento del
            usuario.
          </p>

          <p className="leading-relaxed">
            El usuario puede gestionar o eliminar las cookies en cualquier momento
            desde la configuración de su navegador.
          </p>
        </section>
      </div>
    </main>
  );
}
