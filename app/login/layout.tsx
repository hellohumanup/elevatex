import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Iniciar sesión | Vínculo",
  description:
    "Acceso seguro al panel B2B de People Analytics y Organizational Network Analysis.",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
