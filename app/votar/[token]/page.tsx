import { notFound } from "next/navigation";
import { resolveParticipantByAccessToken } from "@/lib/magicLink";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import VotarLinkStatus from "./VotarLinkStatus";
import VotarPageClient from "./VotarPageClient";

export const dynamic = "force-dynamic";

type VotarPageProps = {
  params: Promise<{ token: string }>;
};

export default async function VotarPage({ params }: VotarPageProps) {
  const { token } = await params;
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return (
      <VotarLinkStatus
        title="Servicio no disponible"
        message="El servidor no puede validar tu enlace en este momento. Contacta con tu Manager o inténtalo más tarde."
      />
    );
  }

  const resolution = await resolveParticipantByAccessToken(supabase, token);

  if (!resolution.ok) {
    if (resolution.status === 410) {
      return (
        <VotarLinkStatus
          title="Enlace expirado"
          message={resolution.error}
        />
      );
    }

    if (resolution.status === 400) {
      return (
        <VotarLinkStatus
          title="Enlace no válido"
          message={resolution.error}
        />
      );
    }

    notFound();
  }

  if (resolution.data.alreadyCompleted) {
    return (
      <VotarLinkStatus
        title="Cuestionario ya completado"
        message={`Gracias, ${resolution.data.participantName}. Ya has enviado tu respuesta para el equipo ${resolution.data.groupName ?? "asignado"}. No es necesario que vuelvas a acceder a este enlace.`}
      />
    );
  }

  return <VotarPageClient bootstrap={resolution.data} />;
}
