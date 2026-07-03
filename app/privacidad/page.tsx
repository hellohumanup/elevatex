import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidad | ElevateX",
  description:
    "Política de privacidad y tratamiento de datos personales de ElevateX.",
};

export default function PrivacidadPage() {
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
          Política de Privacidad
        </h1>

        <section className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Responsable del tratamiento
            </h2>
            <p className="mt-2 leading-relaxed">
              ElevateX, con domicilio en España y correo de contacto{" "}
              <a
                href="mailto:hola@elevatex.com"
                className="text-cyan-400 transition-colors hover:text-cyan-300"
              >
                hola@elevatex.com
              </a>
              , es responsable del tratamiento de los datos personales recogidos
              a través de este sitio.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Datos que recogemos
            </h2>
            <p className="mt-2 leading-relaxed">
              Recogemos los datos que el usuario facilita voluntariamente a
              través de los formularios de contacto y de registro en la lista de
              espera: nombre, correo electrónico y empresa.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-100">Finalidad</h2>
            <p className="mt-2 leading-relaxed">
              Utilizamos los datos para responder a las consultas, gestionar la
              lista de espera del producto y enviar comunicaciones relacionadas
              con los servicios solicitados.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Legitimación
            </h2>
            <p className="mt-2 leading-relaxed">
              La base legal del tratamiento es el consentimiento del usuario, que
              se otorga al enviar el formulario, y el interés legítimo en
              responder a las solicitudes recibidas.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Conservación
            </h2>
            <p className="mt-2 leading-relaxed">
              Conservamos los datos durante el tiempo necesario para atender la
              finalidad para la que se recogieron y, posteriormente, durante los
              plazos legales aplicables.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-100">Derechos</h2>
            <p className="mt-2 leading-relaxed">
              El usuario puede ejercer sus derechos de acceso, rectificación,
              supresión, oposición, limitación y portabilidad escribiendo a{" "}
              <a
                href="mailto:hola@elevatex.com"
                className="text-cyan-400 transition-colors hover:text-cyan-300"
              >
                hola@elevatex.com
              </a>
              . También tiene derecho a presentar una reclamación ante la
              autoridad de control competente.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
