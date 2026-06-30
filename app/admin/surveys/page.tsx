import type { Metadata } from "next";
import AdminSurveysPageClient from "./AdminSurveysPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Encuestas · Admin ElevateX | Vínculo",
  description:
    "Panel de administración de encuestas EDT para Managers con enlaces mágicos y métricas de participación.",
};

export default function AdminSurveysPage() {
  return <AdminSurveysPageClient />;
}
