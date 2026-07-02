import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Aviso Legal | ElevateX",
  description: "Aviso legal y condiciones de uso del sitio web de ElevateX.",
};

export default function AvisoLegalPage() {
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
          Aviso Legal
        </h1>

        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Identificación
            </h2>
            <p className="mt-2 leading-relaxed">
              En cumplimiento de la normativa aplicable, se informa de que este
              sitio web es titularidad de [Razón social / nombre del titular],
              con domicilio en [dirección], y datos de contacto en{" "}
              <a
                href="mailto:hola@elevatex.com"
                className="text-cyan-400 transition-colors hover:text-cyan-300"
              >
                hola@elevatex.com
              </a>
              .
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-100">Objeto</h2>
            <p className="mt-2 leading-relaxed">
              Este sitio tiene como finalidad presentar los servicios de
              consultoría y la propuesta de valor de ElevateX, así como permitir
              el contacto y el registro voluntario en la lista de espera de
              nuestro producto en desarrollo.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Condiciones de uso
            </h2>
            <p className="mt-2 leading-relaxed">
              El acceso y la navegación por el sitio implican la aceptación de
              las presentes condiciones. El usuario se compromete a hacer un uso
              lícito de los contenidos y a no emplearlos para fines contrarios a
              la ley o a los derechos de terceros.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Propiedad intelectual
            </h2>
            <p className="mt-2 leading-relaxed">
              Todos los contenidos del sitio (textos, marca, logotipo, diseño y
              materiales) son propiedad de ElevateX o se utilizan con
              autorización, y quedan protegidos por la normativa de propiedad
              intelectual e industrial. Queda prohibida su reproducción sin
              autorización expresa.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Responsabilidad
            </h2>
            <p className="mt-2 leading-relaxed">
              ElevateX no se hace responsable del uso indebido de los contenidos
              ni de las interrupciones del servicio ajenas a su control. Los
              enlaces a sitios de terceros se ofrecen únicamente a título
              informativo.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Legislación aplicable
            </h2>
            <p className="mt-2 leading-relaxed">
              Las presentes condiciones se rigen por la legislación vigente,
              sometiéndose las partes a los tribunales que correspondan según la
              normativa.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
