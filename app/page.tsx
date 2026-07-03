"use client";

import {
  ArrowRight,
  ArrowUpRight,
  BatteryWarning,
  Building,
  ChevronRight,
  Compass,
  Database,
  Layers,
  LineChart,
  Mail,
  Menu,
  MessageSquareOff,
  Rocket,
  Search,
  Target,
  TrendingDown,
  User,
  UserX,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

function scrollToContacto() {
  document.getElementById("contacto")?.scrollIntoView({ behavior: "smooth" });
}

const navLinks = [
  { href: "#problema", label: "Problema" },
  { href: "#servicios", label: "Servicios" },
  { href: "#metodologia", label: "Metodología" },
];

type ContactFormState = {
  name: string;
  company: string;
  email: string;
};

const LEAD_SUCCESS_MESSAGE =
  "¡Solicitud recibida! Debido a la alta demanda y para garantizar la máxima calidad, abrimos acceso a un grupo limitado de 20 empresas al mes. Nos pondremos en contacto contigo en menos de 24 horas si tu perfil es seleccionado.";

export default function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<
    "idle" | "success" | "error"
  >("idle");

  const [contactForm, setContactForm] = useState<ContactFormState>({
    name: "",
    company: "",
    email: "",
  });
  const [contactStatus, setContactStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [contactError, setContactError] = useState<string | null>(null);

  function handleWaitlistSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!waitlistEmail.trim()) {
      setWaitlistStatus("error");
      return;
    }

    setWaitlistStatus("success");
    setWaitlistEmail("");
  }

  async function handleContactSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !contactForm.name.trim() ||
      !contactForm.company.trim() ||
      !contactForm.email.trim()
    ) {
      setContactError("Completa todos los campos antes de enviar.");
      setContactStatus("error");
      return;
    }

    setContactStatus("submitting");
    setContactError(null);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactForm.name.trim(),
          email: contactForm.email.trim(),
          company: contactForm.company.trim(),
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        setContactError(
          payload.error ||
            "No pudimos registrar tu solicitud. Inténtalo de nuevo en unos instantes.",
        );
        setContactStatus("error");
        return;
      }

      setContactStatus("success");
      setContactForm({
        name: "",
        company: "",
        email: "",
      });
    } catch {
      setContactError(
        "Error de conexión con el servidor. Por favor, inténtalo de nuevo en unos instantes.",
      );
      setContactStatus("error");
    }
  }

  return (
    <main className="scroll-smooth min-h-screen bg-slate-950 text-slate-50">
      <div className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <a
            href="#top"
            onClick={() => setIsMenuOpen(false)}
            className="text-sm font-bold uppercase tracking-[0.2em] text-slate-50 transition-opacity duration-300 hover:opacity-90"
          >
            ELEVATEX<sup className="text-[0.55em] font-normal">®</sup>
          </a>

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

          <div className="flex items-center gap-3">
            <a
              href="#contacto"
              className="hidden items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-950 transition-all duration-300 hover:scale-105 hover:bg-slate-100 md:inline-flex"
            >
              Hablemos
            </a>

            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              className="inline-flex items-center justify-center rounded-lg p-2 text-slate-200 transition-colors hover:bg-white/10 md:hidden"
              aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={isMenuOpen}
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </nav>

        {isMenuOpen && (
          <div className="border-t border-white/5 bg-slate-950/95 backdrop-blur-xl md:hidden">
            <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="block border-b border-white/5 py-5 text-center text-lg font-medium text-slate-200 transition-colors hover:text-cyan-300"
                >
                  {link.label}
                </a>
              ))}
              <a
                href="#contacto"
                onClick={() => setIsMenuOpen(false)}
                className="block py-5 text-center text-lg font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
              >
                Hablemos
              </a>
            </div>
          </div>
        )}
      </div>

      <section id="top" className="relative overflow-hidden">
        <div className="absolute left-1/2 top-24 h-80 w-80 -translate-x-[130%] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute right-0 top-28 h-96 w-96 -translate-x-1/4 rounded-full bg-cyan-500/20 blur-[120px]" />

        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-4 pb-20 pt-32 text-center sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 backdrop-blur-xl">
            <Compass className="h-4 w-4 text-cyan-400" />
            <span>
              Consultoría de liderazgo y talento de alto rendimiento
            </span>
          </div>

          <h1 className="mt-8 max-w-5xl text-balance text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl md:text-7xl">
            <span className="block">Estrategias exponenciales.</span>
            <span className="mt-2 block">Ejecución impecable.</span>
            <span className="mt-2 block bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent">
              Transformación audaz.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-pretty text-base leading-8 text-slate-400 sm:text-lg">
            Ayudamos a empresas y a sus líderes a convertir el potencial de sus
            equipos en resultados medibles. Sin humo: método, criterio y el
            factor X que marca la diferencia.
          </p>

          <div className="mt-10 flex w-full flex-col items-stretch justify-center gap-4 md:flex-row md:items-center">
            <a
              href="#contacto"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_0_40px_rgba(8,145,178,0.24)] transition-all duration-300 hover:scale-105 hover:shadow-[0_0_50px_rgba(34,211,238,0.28)] md:w-auto"
            >
              <span>Diseñemos tu salto exponencial</span>
              <ChevronRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>

            <a
              href="#metodologia"
              className="inline-flex w-full items-center justify-center rounded-full border border-slate-700 bg-transparent px-6 py-3.5 text-sm font-semibold text-slate-100 transition-all duration-300 hover:scale-105 hover:bg-slate-800 md:w-auto"
            >
              Ver cómo trabajamos
            </a>
          </div>

          <div className="mt-14 grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <Layers className="h-5 w-5 text-blue-400" />
              <p className="mt-3 text-sm font-medium text-slate-200">
                Diagnóstico con criterio estratégico
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <Zap className="h-5 w-5 text-cyan-400" />
              <p className="mt-3 text-sm font-medium text-slate-200">
                Aceleración de liderazgo y cultura
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
              <Compass className="h-5 w-5 text-sky-300" />
              <p className="mt-3 text-sm font-medium text-slate-200">
                Decisiones claras para crecimiento real
              </p>
            </div>
          </div>
        </div>
      </section>

      <section
        id="problema"
        className="relative border-t border-white/5 bg-slate-950 py-32"
      >
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-sm font-semibold tracking-wider text-cyan-400">
            EL DIAGNÓSTICO
          </p>
          <h2 className="mt-4 text-balance text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
            La mayoría de las empresas no tienen un problema de talento. Tienen
            un problema de sistema.
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-400">
            Contratan bien y aun así pierden a su mejor gente. Ascienden a sus
            mejores profesionales y los convierten en jefes desbordados.
            Invierten en formación que no cambia nada. El talento está; lo que
            falta es un sistema que lo convierta en rendimiento sostenido. Así
            es como se escapa el valor:
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 px-6 md:grid-cols-2">
          <article className="rounded-3xl border border-white/5 bg-slate-900/40 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/30">
            <BatteryWarning className="h-6 w-6 text-blue-400" />
            <h3 className="mt-5 text-xl font-semibold text-slate-50">
              Líderes desbordados
            </h3>
            <p className="mt-3 text-base leading-7 text-slate-400">
              Un liderazgo que no gestiona el contexto organizativo, generando
              incertidumbre, cuellos de botella y burnout crónico.
            </p>
          </article>

          <article className="rounded-3xl border border-white/5 bg-slate-900/40 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/30">
            <UserX className="h-6 w-6 text-cyan-400" />
            <h3 className="mt-5 text-xl font-semibold text-slate-50">
              Desconexión del talento
            </h3>
            <p className="mt-3 text-base leading-7 text-slate-400">
              Falta de adaptación a las realidades de las personas, lo que
              dispara la rotación silenciosa, el absentismo y la pérdida de
              compromiso.
            </p>
          </article>

          <article className="rounded-3xl border border-white/5 bg-slate-900/40 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/30">
            <MessageSquareOff className="h-6 w-6 text-slate-300" />
            <h3 className="mt-5 text-xl font-semibold text-slate-50">
              Normalización del bajo rendimiento
            </h3>
            <p className="mt-3 text-base leading-7 text-slate-400">
              Ausencia de sistemas de feedback efectivo y conversaciones
              difíciles, lo que congela el desarrollo y frustra a los que sí
              rinden.
            </p>
          </article>

          <article className="rounded-3xl border border-white/5 bg-slate-900/40 p-7 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/30">
            <TrendingDown className="h-6 w-6 text-violet-400" />
            <h3 className="mt-5 text-xl font-semibold text-slate-50">
              Pérdida de impacto
            </h3>
            <p className="mt-3 text-base leading-7 text-slate-400">
              Desconexión entre el liderazgo y los resultados operativos,
              erosionando de forma invisible la productividad, el clima y la
              rentabilidad.
            </p>
          </article>
        </div>
      </section>

      <section id="propuesta" className="relative bg-slate-950 py-32">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-balance text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
            Qué nos hace distintos
          </h2>
          <div className="mx-auto mt-6 h-0.5 w-1/5 rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" />
        </div>

        <div className="mx-auto mt-20 grid max-w-7xl grid-cols-1 gap-12 px-6 md:grid-cols-3">
          <article className="border-l border-blue-500/30 pl-6 opacity-80 transition-opacity duration-300 hover:opacity-100">
            <LineChart className="mb-6 h-10 w-10 text-blue-400" />
            <h3 className="mb-4 text-xl font-semibold text-slate-100">
              Rigor, no recetas
            </h3>
            <p className="leading-relaxed text-slate-400">
              Trabajamos con diagnóstico, datos y un marco probado, no con
              frases motivadoras. Cada decisión se puede justificar y medir.
            </p>
          </article>

          <article className="border-l border-cyan-500/30 pl-6 opacity-80 transition-opacity duration-300 hover:opacity-100">
            <Workflow className="mb-6 h-10 w-10 text-cyan-400" />
            <h3 className="mb-4 text-xl font-semibold text-slate-100">
              Del diseño a la ejecución
            </h3>
            <p className="leading-relaxed text-slate-400">
              No entregamos un PowerPoint y nos vamos. Acompañamos la
              implementación hasta que el cambio se nota en los resultados
              reales y en el clima.
            </p>
          </article>

          <article className="border-l border-violet-500/30 pl-6 opacity-80 transition-opacity duration-300 hover:opacity-100">
            <Zap className="mb-6 h-10 w-10 text-violet-400" />
            <h3 className="mb-4 text-xl font-semibold text-slate-100">
              El factor X
            </h3>
            <p className="leading-relaxed text-slate-400">
              Combinamos la experiencia de años trabajando el alto rendimiento
              con una energía nueva y una mirada vanguardista. Familiar y fresco
              a la vez.
            </p>
          </article>
        </div>
      </section>

      <section
        id="servicios"
        className="relative border-t border-white/5 bg-slate-950 py-32"
      >
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-balance text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
            Cómo trabajamos contigo
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-400">
            Tres líneas de servicio que se combinan según tu momento. Empezamos
            por donde más duele y escalamos desde ahí.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-8 px-6 md:grid-cols-3">
          <article className="rounded-2xl border border-white/5 bg-slate-900/30 p-8 transition-all duration-300 hover:-translate-y-2 hover:border-cyan-500/50 hover:bg-slate-900/60">
            <div className="mb-6 inline-flex rounded-lg bg-blue-400/10 p-3">
              <Search className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="mb-4 text-xl font-bold text-slate-100">
              Diagnóstico y Transformación
            </h3>
            <p className="text-slate-400">
              Auditamos cómo tu organización atrae, desarrolla y retiene el
              talento, y rediseñamos el sistema para que rinda. Ideal si sientes
              que pierdes gente o energía sin saber exactamente por qué.
            </p>
          </article>

          <article className="rounded-2xl border border-white/5 bg-slate-900/30 p-8 transition-all duration-300 hover:-translate-y-2 hover:border-cyan-500/50 hover:bg-slate-900/60">
            <div className="mb-6 inline-flex rounded-lg bg-cyan-400/10 p-3">
              <Users className="h-6 w-6 text-cyan-400" />
            </div>
            <h3 className="mb-4 text-xl font-bold text-slate-100">
              Desarrollo y Gestión del Talento
            </h3>
            <p className="text-slate-400">
              Convertimos a tus profesionales en líderes que multiplican, no que
              frenan. Programas de desarrollo, acompañamiento y herramientas de
              evaluación con criterio.
            </p>
          </article>

          <article className="rounded-2xl border border-white/5 bg-slate-900/30 p-8 transition-all duration-300 hover:-translate-y-2 hover:border-cyan-500/50 hover:bg-slate-900/60">
            <div className="mb-6 inline-flex rounded-lg bg-violet-400/10 p-3">
              <Target className="h-6 w-6 text-violet-400" />
            </div>
            <h3 className="mb-4 text-xl font-bold text-slate-100">
              Liderazgo Sistémico
            </h3>
            <p className="text-slate-400">
              Instalamos en tu equipo directivo una forma estable de fijar
              prioridades, decidir y medir. Liderazgo que no depende del héroe
              de turno, sino de un sistema replicable.
            </p>
          </article>
        </div>

        <div className="mt-16 flex justify-center px-6">
          <a
            href="#contacto"
            onClick={(event) => {
              event.preventDefault();
              scrollToContacto();
            }}
            className="group flex items-center gap-2 rounded-full border border-slate-700 px-8 py-3 text-slate-300 transition-all hover:border-cyan-400 hover:text-cyan-400"
          >
            <span>Ver propuestas y precios</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </a>
        </div>
      </section>

      <section
        id="metodologia"
        className="relative overflow-hidden border-t border-white/5 bg-slate-950 py-32"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 to-slate-950" />

        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-balance text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
            Un método, no una intuición
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-400">
            Nuestro trabajo se apoya en un marco propio que mide y mueve el
            rendimiento en tres dimensiones y doce palancas concretas. No
            improvisamos: diagnosticamos, diseñamos, ejecutamos y medimos. Cada
            intervención deja a tu organización más capaz de sostener el cambio
            por sí misma.
          </p>
        </div>

        <div className="relative mx-auto mt-24 grid max-w-7xl grid-cols-1 gap-12 px-6 md:grid-cols-3">
          <div className="absolute left-[15%] right-[15%] top-10 z-0 hidden h-[1px] bg-gradient-to-r from-blue-500/0 via-cyan-500/50 to-violet-500/0 md:block" />

          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-blue-500/30 bg-slate-950 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
              <Database className="h-8 w-8 text-blue-400" />
            </div>
            <p className="mb-2 mt-8 text-xs font-bold tracking-widest text-blue-400">
              PASO 1
            </p>
            <h3 className="text-xl font-semibold text-slate-100">
              Diagnóstico con datos
            </h3>
          </div>

          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-cyan-500/30 bg-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.15)]">
              <Layers className="h-8 w-8 text-cyan-400" />
            </div>
            <p className="mb-2 mt-8 text-xs font-bold tracking-widest text-cyan-400">
              PASO 2
            </p>
            <h3 className="text-xl font-semibold text-slate-100">
              Diseño del sistema
            </h3>
          </div>

          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-violet-500/30 bg-slate-950 shadow-[0_0_30px_rgba(139,92,246,0.15)]">
              <Rocket className="h-8 w-8 text-violet-400" />
            </div>
            <p className="mb-2 mt-8 text-xs font-bold tracking-widest text-violet-400">
              PASO 3
            </p>
            <h3 className="text-xl font-semibold text-slate-100">
              Ejecución acompañada
            </h3>
          </div>
        </div>
      </section>

      <section
        id="producto"
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

          <form
            onSubmit={handleWaitlistSubmit}
            className="mx-auto mt-10 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              type="email"
              value={waitlistEmail}
              onChange={(event) => {
                setWaitlistEmail(event.target.value);
                setWaitlistStatus("idle");
              }}
              placeholder="tu@empresa.com"
              className="w-full rounded-full border border-white/10 bg-slate-900 px-6 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:scale-105"
            >
              Unirme a la lista de espera
            </button>
          </form>

          {waitlistStatus === "success" && (
            <p className="mt-4 text-sm text-cyan-400">
              ¡Gracias! Te avisaremos cuando Vínculo esté disponible.
            </p>
          )}
          {waitlistStatus === "error" && (
            <p className="mt-4 text-sm text-red-400">
              Introduce un email corporativo válido.
            </p>
          )}
        </div>
      </section>

      <section
        id="contacto"
        className="relative border-t border-white/5 bg-slate-950 py-32"
      >
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-16 px-6 md:grid-cols-2">
          <div>
            <h2 className="text-balance text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
              ¿Hablamos de tu salto exponencial?
            </h2>
            <p className="mt-4 text-lg leading-8 text-slate-400">
              Una primera conversación, sin compromiso, para analizar las
              restricciones de tu sistema, ver si encajamos y diseñar por dónde
              empezaríamos a elevar el techo de tu organización.
            </p>
            <a
              href="mailto:hello@elevatex-up.com"
              className="mt-8 inline-flex items-center gap-2 font-medium text-cyan-400 transition-colors hover:text-cyan-300"
            >
              <Mail className="h-4 w-4" />
              hello@elevatex-up.com
            </a>
          </div>

          <form
            onSubmit={handleContactSubmit}
            className="rounded-2xl border border-white/5 bg-slate-900/50 p-8 shadow-[0_0_40px_rgba(8,145,178,0.08)] backdrop-blur-sm"
          >
            {contactStatus === "success" ? (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-6 text-center">
                <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">
                  Solicitud registrada
                </p>
                <p className="mt-4 text-base leading-relaxed text-slate-200">
                  {LEAD_SUCCESS_MESSAGE}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-5">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">
                      Nombre
                    </span>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={contactForm.name}
                        onChange={(event) => {
                          setContactForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }));
                          setContactStatus("idle");
                          setContactError(null);
                        }}
                        placeholder="Tu nombre"
                        className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-11 pr-4 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">
                      Correo Electrónico
                    </span>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="email"
                        value={contactForm.email}
                        onChange={(event) => {
                          setContactForm((current) => ({
                            ...current,
                            email: event.target.value,
                          }));
                          setContactStatus("idle");
                          setContactError(null);
                        }}
                        placeholder="tu@empresa.com"
                        className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-11 pr-4 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-300">
                      Nombre de la Empresa
                    </span>
                    <div className="relative">
                      <Building className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        value={contactForm.company}
                        onChange={(event) => {
                          setContactForm((current) => ({
                            ...current,
                            company: event.target.value,
                          }));
                          setContactStatus("idle");
                          setContactError(null);
                        }}
                        placeholder="Nombre de tu organización"
                        className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-11 pr-4 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/30"
                      />
                    </div>
                  </label>
                </div>

                {contactStatus === "error" && contactError && (
                  <p className="mt-4 text-sm text-red-400">{contactError}</p>
                )}

                <button
                  type="submit"
                  disabled={contactStatus === "submitting"}
                  className="group mt-6 w-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400 px-8 py-4 text-sm font-semibold text-white shadow-[0_0_40px_rgba(8,145,178,0.24)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_50px_rgba(34,211,238,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {contactStatus === "submitting" ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Enviando solicitud…
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center gap-2">
                      Solicitar Acceso Exclusivo
                      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  )}
                </button>
              </>
            )}
          </form>
        </div>
      </section>

      <footer className="border-t border-white/5 bg-slate-950 py-12 text-sm text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 md:flex-row">
          <p className="max-w-md text-center md:text-left">
            ELEVATEX<sup className="text-[0.55em] font-normal">®</sup> ·
            Estrategias exponenciales, ejecución impecable, transformación
            audaz.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link
              href="/aviso-legal"
              className="transition-colors hover:text-slate-300"
            >
              Aviso Legal
            </Link>
            <Link
              href="/privacidad"
              className="transition-colors hover:text-slate-300"
            >
              Política de Privacidad
            </Link>
            <Link
              href="/cookies"
              className="transition-colors hover:text-slate-300"
            >
              Política de Cookies
            </Link>
            <a
              href="https://www.linkedin.com/company/elevate-x-up/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 transition-colors hover:text-cyan-400"
            >
              LinkedIn
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        </div>
        <p className="mx-auto mt-8 max-w-7xl px-6 text-center text-xs text-slate-600">
          ElevateX<sup className="text-[0.65em]">®</sup> es una marca registrada.
        </p>
      </footer>
    </main>
  );
}
