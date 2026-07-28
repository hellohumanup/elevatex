import { Resend } from "resend";
import { NextResponse } from "next/server";
import { renderQuestionnaireInviteEmail } from "@/lib/emails/renderInviteEmail";
import { toSupabaseGroupId } from "@/lib/groupId";
import {
  buildMagicLinkUrl,
  isValidAccessTokenFormat,
  normalizeAccessToken,
} from "@/lib/magicLink";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParticipantInviteRow = {
  id: string | number;
  name: string | null;
  email: string | null;
  magic_token: string | null;
  access_token: string | null;
  survey_completed_at: string | null;
  survey_status: string | null;
};

function isValidEmail(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().includes("@");
}

function isDevelopmentBypassEnabled(): boolean {
  // TODO(producción): eliminar este bypass antes del despliegue a staging/producción.
  // En desarrollo local permitimos enviar invitaciones sin sesión de manager activa.
  return process.env.NODE_ENV === "development";
}

/** TODO(producción): eliminar — Resend sandbox en local solo entrega a este buzón. */
const DEV_RESEND_SANDBOX_RECIPIENT = "hello@human-up.eu";

export async function POST(request: Request) {
  try {
    if (!process.env.RESEND_API_KEY?.trim()) {
      return NextResponse.json(
        { success: false, error: "RESEND_API_KEY no configurada." },
        { status: 503 },
      );
    }

    let body: { groupId?: string };

    try {
      body = (await request.json()) as { groupId?: string };
    } catch {
      return NextResponse.json(
        { success: false, error: "Petición no válida." },
        { status: 400 },
      );
    }

    const groupId =
      typeof body.groupId === "string" ? body.groupId.trim() : "";

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: "groupId es obligatorio en el cuerpo de la petición." },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseServiceRoleClient();

    if (!supabaseAdmin) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY no configurada. Añádela en .env.local y reinicia el servidor.",
        },
        { status: 503 },
      );
    }

    const devBypass = isDevelopmentBypassEnabled();

    if (!devBypass) {
      const supabaseAuth = await createSupabaseServerClient();
      const {
        data: { user },
        error: authError,
      } = await supabaseAuth.auth.getUser();

      if (authError || !user) {
        return NextResponse.json(
          { success: false, error: "Debes iniciar sesión para enviar invitaciones." },
          { status: 401 },
        );
      }

      const supabaseGroupId = toSupabaseGroupId(groupId);

      const { data: group, error: groupError } = await supabaseAdmin
        .from("groups")
        .select("id, name, organization_id")
        .eq("id", supabaseGroupId)
        .maybeSingle();

      if (groupError) {
        throw new Error(groupError.message);
      }

      if (!group?.id) {
        return NextResponse.json(
          { success: false, error: "Equipo no encontrado." },
          { status: 404 },
        );
      }

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        throw new Error(profileError.message);
      }

      if (profile?.organization_id !== group.organization_id) {
        return NextResponse.json(
          {
            success: false,
            error: "No tienes permiso para enviar invitaciones de este equipo.",
          },
          { status: 403 },
        );
      }

      return await sendInvitesForGroup({
        supabaseAdmin,
        group,
        resendApiKey: process.env.RESEND_API_KEY,
      });
    }

    // TODO(producción): bloque de desarrollo — solo groupId + service_role, sin auth ni tenant.
    if (devBypass) {
      console.warn(
        "[api/send-invites] Bypass de desarrollo activo: sin validación de sesión ni tenant.",
      );
    }

    const supabaseGroupId = toSupabaseGroupId(groupId);

    const { data: group, error: groupError } = await supabaseAdmin
      .from("groups")
      .select("id, name, organization_id")
      .eq("id", supabaseGroupId)
      .maybeSingle();

    if (groupError) {
      throw new Error(groupError.message);
    }

    if (!group?.id) {
      return NextResponse.json(
        { success: false, error: "Equipo no encontrado." },
        { status: 404 },
      );
    }

    return await sendInvitesForGroup({
      supabaseAdmin,
      group,
      resendApiKey: process.env.RESEND_API_KEY,
    });
  } catch (error) {
    console.error("[api/send-invites]", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

type GroupInviteRow = {
  id: string | number;
  name: string | null;
  organization_id?: string | null;
};

async function sendInvitesForGroup({
  supabaseAdmin,
  group,
  resendApiKey,
}: {
  supabaseAdmin: NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>;
  group: GroupInviteRow;
  resendApiKey: string;
}) {
  const { data: participantRows, error: participantsError } =
    await supabaseAdmin
      .from("participants")
      .select(
        "id, name, email, magic_token, access_token, survey_completed_at, survey_status",
      )
      .eq("group_id", group.id)
      .not("email", "is", null)
      .order("name", { ascending: true });

  if (participantsError) {
    throw new Error(participantsError.message);
  }

  const participants = (participantRows ?? []) as ParticipantInviteRow[];
  const groupName =
    typeof group.name === "string" && group.name.trim()
      ? group.name.trim()
      : "tu equipo";

  const fromAddress =
    process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";

  const resend = new Resend(resendApiKey);
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const participant of participants) {
    if (!isValidEmail(participant.email)) {
      skipped += 1;
      continue;
    }

    if (
      participant.survey_completed_at ||
      participant.survey_status === "completed"
    ) {
      skipped += 1;
      continue;
    }

    const accessToken = normalizeAccessToken(
      participant.magic_token ?? participant.access_token ?? "",
    );

    if (!isValidAccessTokenFormat(accessToken)) {
      errors.push(
        `Participante ${String(participant.id)}: magic_token inválido o ausente.`,
      );
      continue;
    }

    const participantName =
      typeof participant.name === "string" && participant.name.trim()
        ? participant.name.trim()
        : "Colaborador";

    const magicUrl = buildMagicLinkUrl(accessToken);
    const { subject, html } = await renderQuestionnaireInviteEmail({
      participantName,
      groupName,
      magicUrl,
    });

    const recipientEmail = participant.email.trim();
    const isDev = isDevelopmentBypassEnabled();

    // TODO(producción): en desarrollo redirigimos todos los correos al buzón sandbox de Resend.
    const toAddress = isDev ? DEV_RESEND_SANDBOX_RECIPIENT : recipientEmail;
    const emailSubject = isDev
      ? `[DEV - Para: ${recipientEmail}] Tu equipo te necesita — cuestionario ElevateX`
      : subject;

    const { error: sendError } = await resend.emails.send({
      from: fromAddress,
      to: toAddress,
      subject: emailSubject,
      html,
    });

    if (sendError) {
      errors.push(`${participant.email}: ${sendError.message}`);
      continue;
    }

    const { error: statusError } = await supabaseAdmin
      .from("participants")
      .update({ survey_status: "sent" })
      .eq("id", participant.id)
      .neq("survey_status", "completed");

    if (statusError) {
      console.warn(
        "[api/send-invites] Enviado OK pero no se pudo marcar survey_status=sent:",
        statusError.message,
      );
    }

    sent += 1;
  }

  if (sent === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          errors[0] ??
          "No hay colaboradores con correo válido pendientes de invitar.",
        sent,
        skipped,
        errors,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Invitaciones enviadas correctamente.",
    sent,
    skipped,
    errors,
  });
}
