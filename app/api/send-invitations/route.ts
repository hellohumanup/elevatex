import { Resend } from "resend";
import { NextResponse } from "next/server";
import { toSupabaseGroupId } from "@/lib/groupId";
import {
  buildInvitationEmailContent,
  buildQuestionnaireInvitationUrl,
  INVITATION_SUBJECT,
} from "@/lib/invitationEmail";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const IS_LOCAL_DEV = process.env.NODE_ENV === "development";

type Collaborator = {
  id: string;
  name: string;
  email: string;
};

type SendInvitationsBody = {
  groupId?: string;
  collaborators?: Array<{
    id?: string;
    name?: string;
    email?: string;
  }>;
};

function normalizeCollaborators(
  rows: Array<Record<string, unknown>>,
): Collaborator[] {
  return rows
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      name: typeof row.name === "string" ? row.name.trim() : "",
      email: typeof row.email === "string" ? row.email.trim().toLowerCase() : "",
    }))
    .filter(
      (collaborator) =>
        collaborator.id.length > 0 &&
        collaborator.name.length > 0 &&
        collaborator.email.length > 0 &&
        collaborator.email.includes("@"),
    );
}

function parseCollaboratorsFromBody(
  collaborators: SendInvitationsBody["collaborators"],
): Collaborator[] {
  if (!Array.isArray(collaborators)) {
    return [];
  }

  return normalizeCollaborators(
    collaborators as Array<Record<string, unknown>>,
  );
}

function resolveFromAddress(): string {
  if (IS_LOCAL_DEV) {
    return "ElevateX <onboarding@resend.dev>";
  }

  return (
    process.env.RESEND_FROM_EMAIL?.trim() || "ElevateX <onboarding@resend.dev>"
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendInvitationsBody;
    const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: "groupId es obligatorio en el cuerpo de la petición." },
        { status: 400 },
      );
    }

    let collaborators = parseCollaboratorsFromBody(body.collaborators);

    if (collaborators.length === 0) {
      const admin = createSupabaseServiceRoleClient();

      if (!admin) {
        throw new Error(
          "SUPABASE_SERVICE_ROLE_KEY no configurada. Añade la clave en .env.local.",
        );
      }

      const { data: participantRows, error: participantsError } = await admin
        .from("participants")
        .select("id, name, email")
        .eq("group_id", toSupabaseGroupId(groupId))
        .is("survey_completed_at", null)
        .order("name", { ascending: true });

      if (participantsError) {
        throw new Error(participantsError.message);
      }

      collaborators = normalizeCollaborators(
        (participantRows ?? []) as Array<Record<string, unknown>>,
      );
    }

    if (collaborators.length === 0) {
      return NextResponse.json({ success: true, sent: 0 });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddress = resolveFromAddress();

    for (const collaborator of collaborators) {
      const magicLink = buildQuestionnaireInvitationUrl(groupId, collaborator.id);

      if (IS_LOCAL_DEV) {
        console.log(
          `[API_SEND_INVITATIONS] Enlace mágico · ${collaborator.name} <${collaborator.email}>:`,
          magicLink,
        );
      }

      const { html } = buildInvitationEmailContent({
        participantName: collaborator.name,
        groupId,
        participantId: collaborator.id,
      });

      const { error: sendError } = await resend.emails.send({
        from: fromAddress,
        to: collaborator.email,
        subject: INVITATION_SUBJECT,
        html,
      });

      if (sendError) {
        throw new Error(sendError.message);
      }
    }

    return NextResponse.json({ success: true, sent: collaborators.length });
  } catch (error) {
    console.error("[API_SEND_INVITATIONS] Fault:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 200 },
    );
  }
}
