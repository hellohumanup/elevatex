"use client";

import Link from "next/link";
import { Activity, ChevronRight, Network } from "lucide-react";
import { FormEvent, useState } from "react";

const navLinks = [
  { href: "#dolor", label: "Dolor" },
  { href: "#solucion", label: "Solución" },
  { href: "#valor", label: "Valor" },
];

const WAITLIST_SUCCESS_MESSAGE =
  "¡Gracias! Te hemos añadido a la lista de espera. Te avisaremos en cuanto ElevateX® esté disponible para tu organización.";

export default function LandingPage() {
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWaitlistSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!waitlistEmail.trim()) {
      setError("Introduce un email corporativo válido.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "lista_espera",
          email: waitlistEmail.trim(),
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        setError(
          payload.error ||
            "No pudimos registrarte en la lista. Inténtalo de nuevo en unos instantes.",
        );
        return;
      }

      setSubmitted(true);
      setWaitlistEmail("");
    } catch {
      setError(
        "Error de conexión con el servidor. Por favor, inténtalo de nuevo en unos instantes.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-3 transition-opacity duration-300 hover:opacity-90"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.18)]">
              <Network className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-base font-bold tracking-tight text-slate-50 sm:text-lg">
                Vínculo
              </span>
              <span className="hidden border-l border-white/10 pl-3 text-xs font-medium text-slate-400 sm:inline-block">
                by ElevateX
              </span>
            </div>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-slate-300 transition-colors duration-300 hover:text-cyan-300"
              >
                {link.label}
              </a>
            ))}
          </div>

          <a
            href="#pricing"
            className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition-all duration-300 hover:scale-105 hover:bg-slate-100"
          >
            Acceso Anticipado
          </a>
        </nav>
      </div>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(139,92,246,0.16),transparent_28%),linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:auto,auto,56px_56px,56px_56px] bg-[position:center,center,center,center]" />
        <div className="absolute left-1/2 top-24 h-72 w-72 -translate-x-[120%] rounded-full bg-cyan-500/20 blur-[120px]" />
        <div className="absolute right-0 top-32 h-80 w-80 -translate-x-1/4 rounded-full bg-violet-500/20 blur-[120px]" />

        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-4 pb-20 pt-32 text-center sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 shadow-[0_0_30px_rgba(15,23,42,0.45)] backdrop-blur-xl">
            <Activity className="h-4 w-4 text-cyan-400" />
            <span>Inteligencia Organizacional Avanzada</span>
          </div>

          <h1 className="mt-8 max-w-5xl text-balance text-4xl font-semibold tracking-tight text-slate-50 sm:text-6xl lg:text-7xl">
            La radiografía matemática
            <br />
            <span className="bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">
              de tu organización
            </span>
          </h1>

          <p className="mt-6 max-w-3xl text-pretty text-base leading-8 text-slate-400 sm:text-lg">
            Análisis de redes organizacionales (ONA) e Inteligencia Artificial
            para visualizar silos, detectar talento oculto y diseñar la cohesión
            real de tus equipos.
          </p>

          <div className="mt-10 flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row">
            <a
              href="#pricing"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_0_40px_rgba(34,211,238,0.24)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_50px_rgba(59,130,246,0.3)] sm:w-auto"
            >
              <span>Solicitar Demo</span>
              <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>

            <a
              href="#solucion"
              className="inline-flex w-full items-center justify-center rounded-full border border-slate-700/80 bg-white/5 px-6 py-3.5 text-sm font-semibold text-slate-100 backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-slate-500 hover:bg-white/10 sm:w-auto"
            >
              Conocer la Metodología
            </a>
          </div>
        </div>
      </section>

      <section
        id="dolor"
        className="min-h-screen border-t border-white/10 bg-slate-950"
      />
      <section
        id="solucion"
        className="min-h-screen border-t border-white/10 bg-slate-950"
      />
      <section
        id="valor"
        className="min-h-screen border-t border-white/10 bg-slate-950"
      />

      <section
        id="pricing"
        className="relative border-t border-white/5 bg-slate-950 py-32"
      >
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xs font-bold tracking-widest text-violet-400">
            PRÓXIMAMENTE
          </p>
          <h2 className="mt-4 text-balance text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
            Pronto, la última versión de nuestro SaaS ElevateX
            <sup className="text-[0.45em] font-normal text-violet-300">®</sup>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-400">
            Tras meses de desarrollo y el respaldo de un modelo matemático
            ultra-robusto, ponemos a tu alcance la tecnología definitiva para
            medir la madurez de tus equipos, activar las palancas de rendimiento
            correctas y monitorizar el impacto en tiempo real. Una gestión
            única, predictiva y disruptiva.
          </p>

          {submitted ? (
            <div className="mx-auto mt-10 max-w-xl rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-6">
              <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">
                Registro confirmado
              </p>
              <p className="mt-4 text-base leading-relaxed text-slate-200">
                {WAITLIST_SUCCESS_MESSAGE}
              </p>
            </div>
          ) : (
            <>
              <form
                onSubmit={handleWaitlistSubmit}
                className="mx-auto mt-10 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center"
              >
                <input
                  type="email"
                  value={waitlistEmail}
                  onChange={(event) => {
                    setWaitlistEmail(event.target.value);
                    setError(null);
                  }}
                  placeholder="tu@empresa.com"
                  disabled={loading}
                  className="w-full rounded-full border border-white/10 bg-slate-900 px-6 py-3 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_40px_rgba(8,145,178,0.24)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_50px_rgba(34,211,238,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Enviando…" : "Unirme a la lista de espera"}
                </button>
              </form>

              {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
