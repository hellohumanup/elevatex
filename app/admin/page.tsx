import type { Metadata } from "next";
import AdminNetworkPageClient from "./AdminNetworkPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Admin · ONA | Vínculo",
  description:
    "Panel de administración con análisis de redes organizacionales en tiempo real.",
};

export default function AdminPage() {
  return <AdminNetworkPageClient />;
}
