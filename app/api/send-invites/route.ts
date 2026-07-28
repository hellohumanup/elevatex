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

export const dynamic = "force-dynamic";

const IS_LOCAL_DEV = process.env.NODE_ENV === "development";

type ParticipantInviteRow = {
  id: string | number;
  name: string | null;
  email: string | null;
  magic_token: string | null;
  access_token: string | null;
  survey_completed_at: string | null;
  survey_status: string | null;
};

type SendResult = {
  participantId: string;
  email: string;
  status: "sent" | "simulated" | "skipped" | "failed";
  magicUrl?: string;
  error?: string;
};

type SendInvitesRequestBody = {
  groupId?: string;
  participants?: Array<{
    id?: string;
    name?: string | null;
    email?: string | null;
  }>;
};

function isValidEmail(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().includes("@");
}

function sanitizeEmail(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return sanitizeEmail(match?.[1] ?? value);
}

function isResendSandboxOwnEmailError(message: string): boolean {
  return message.toLowerCase().includes("can only send to your own email address");
}

/**
 * Garantiza un token UUID usable como enlace mágico.
 * Preferencia: magic_token → access_token → generar y persistir.
 */
async function ensureParticipantMagicToken(
  supabaseAdmin: NonNullable<
    ReturnType<typeof createSupabaseServiceRoleClient>
  >,
  participant: ParticipantInviteRow,
): Promise<string | null> {
  const existing = normalizeAccessToken(
    participant.magic_token ?? participant.access_token ?? "",
  );

  if (isValidAccessTokenFormat(existing)) {
    return existing;
  }

  const freshToken = crypto.randomUUID();

  const { data, error } = await supabaseAdmin
    .from("participants")
    .update({
      magic_token: freshToken,
      access_token: freshToken,
    })
    .eq("id", participant.id)
    .select("magic_token")
    .maybeSingle<{ magic_token: string | null }>();

  if (error) {
    console.error(
      "[api/send-invites] No se pudo generar magic_token:",
      error.message,
      { participantId: participant.id },
    );
    return null;
  }

  const persisted = normalizeAccessToken(
    typeof data?.magic_token === "string" ? data.magic_token : freshToken,
  );

  return isValidAccessTokenFormat(persisted) ? persisted : null;
}

export async function POST(request: Request) {
  try {
    let body: SendInvitesRequestBody;

    try {
      body = (await request.json()) as SendInvitesRequestBody;
    } catch {
      return NextResponse.json(
        { success: false, error: "Petición no válida." },
        { status: 400 },
      );
    }

    const groupId =
      typeof body.groupId === "string" ? body.groupId.trim() : "";
    const requestedParticipantIds = Array.isArray(body.participants)
      ? body.participants
          .map((participant) =>
            typeof participant?.id === "string" ? participant.id.trim() : "",
          )
          .filter(Boolean)
      : [];

    if (!groupId) {
      return NextResponse.json(
        {
          success: false,
          error: "groupId es obligatorio en el cuerpo de la petición.",
        },
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

    const supabaseGroupId = toSupabaseGroupId(groupId);

    const { data: group, error: groupError } = await supabaseAdmin
      .from("groups")
      .select("id, name")
      .eq("id", supabaseGroupId)
      .maybeSingle<{ id: string | number; name: string | null }>();

    if (groupError) {
      throw new Error(groupError.message);
    }

    if (!group?.id) {
      return NextResponse.json(
        { success: false, error: "Equipo no encontrado." },
        { status: 404 },
      );
    }

    const { data: participantRows, error: participantsError } =
      await supabaseAdmin
        .from("participants")
        .select(
          "id, name, email, magic_token, access_token, survey_completed_at, survey_status",
        )
        .eq("group_id", group.id)
        .not("email", "is", null)
        .order("name", { ascending: true })
        .returns<ParticipantInviteRow[]>();

    if (participantsError) {
      throw new Error(participantsError.message);
    }

    const participants =
      requestedParticipantIds.length > 0
        ? (participantRows ?? []).filter((participant) =>
            requestedParticipantIds.includes(String(participant.id)),
          )
        : (participantRows ?? []);
    const groupName =
      typeof group.name === "string" && group.name.trim().length > 0
        ? group.name.trim()
        : "tu equipo";

    const resendApiKey = process.env.RESEND_API_KEY?.trim() ?? "";
    const hasResendApiKey = resendApiKey.length > 0;
    // Sin clave o en desarrollo: simular envíos (200 OK) para no bloquear la UI.
    const simulateOnly = !hasResendApiKey || IS_LOCAL_DEV;
    const resend = simulateOnly ? null : new Resend(resendApiKey);
    const fromAddress =
      process.env.RESEND_FROM_EMAIL?.trim() ||
      "Vínculo <onboarding@resend.dev>";
    const sandboxAllowedEmail = sanitizeEmail(
      process.env.RESEND_SANDBOX_EMAIL?.trim() ||
        extractEmailAddress(fromAddress),
    );

    if (simulateOnly) {
      console.warn(
        "[api/send-invites] Modo simulación activo.",
        {
          reason: !hasResendApiKey
            ? "RESEND_API_KEY ausente o vacía en .env.local"
            : "NODE_ENV=development",
          groupId,
        },
      );
    } else {
      console.log(
        "[api/send-invites] RESEND_API_KEY detectada — envío real con Resend.",
        { groupId },
      );
    }

    const results: SendResult[] = [];
    let sent = 0;
    let simulated = 0;
    let skipped = 0;
    let failed = 0;

    for (const participant of participants) {
      const rawEmail =
        typeof participant.email === "string" ? participant.email : "";

      if (!isValidEmail(rawEmail)) {
        skipped += 1;
        results.push({
          participantId: String(participant.id),
          email: rawEmail.trim(),
          status: "skipped",
          error: "Email inválido o ausente.",
        });
        continue;
      }

      if (
        participant.survey_completed_at ||
        participant.survey_status === "completed"
      ) {
        skipped += 1;
        results.push({
          participantId: String(participant.id),
          email: sanitizeEmail(rawEmail),
          status: "skipped",
          error: "Cuestionario ya completado.",
        });
        continue;
      }

      const email = sanitizeEmail(rawEmail);
      const participantName =
        typeof participant.name === "string" && participant.name.trim()
          ? participant.name.trim()
          : "Colaborador";

      const magicToken = await ensureParticipantMagicToken(
        supabaseAdmin,
        participant,
      );

      if (!magicToken) {
        failed += 1;
        results.push({
          participantId: String(participant.id),
          email,
          status: "failed",
          error: "No se pudo generar el token de enlace mágico.",
        });
        continue;
      }

      let magicUrl: string;
      try {
        magicUrl = buildMagicLinkUrl(magicToken);
      } catch (urlError) {
        failed += 1;
        results.push({
          participantId: String(participant.id),
          email,
          status: "failed",
          error:
            urlError instanceof Error
              ? urlError.message
              : "No se pudo construir el magic link.",
        });
        continue;
      }

      const { subject, html } = await renderQuestionnaireInviteEmail({
        participantName,
        groupName,
        magicUrl,
      });

      try {
        if (simulateOnly) {
          console.log(
            `[api/send-invites] ✉ SIMULADO → ${email} | ${participantName}`,
          );
          console.log(`[api/send-invites]    asunto: ${subject}`);
          console.log(`[api/send-invites]    enlace: ${magicUrl}`);
          simulated += 1;
          results.push({
            participantId: String(participant.id),
            email,
            status: "simulated",
            magicUrl,
          });
        } else {
          if (email !== sandboxAllowedEmail) {
            const sandboxErrorMessage =
              `Sandbox de Resend activo: solo puedes enviar a ${sandboxAllowedEmail}. Destino recibido: ${email}.`;
            console.error("❌ [Resend Error]:", {
              message: sandboxErrorMessage,
              email,
              sandboxAllowedEmail,
            });
            return NextResponse.json(
              {
                success: false,
                error: sandboxErrorMessage,
              },
              { status: 400 },
            );
          }

          const { data, error: sendError } = await resend!.emails.send({
            from: fromAddress,
            to: email,
            subject,
            html,
          });

          if (sendError) {
            const resendErrorMessage = isResendSandboxOwnEmailError(
              sendError.message,
            )
              ? `Sandbox de Resend activo: solo puedes enviar a ${sandboxAllowedEmail}. ${sendError.message}`
              : sendError.message;
            console.error("❌ [Resend Error]:", sendError);
            return NextResponse.json(
              {
                success: false,
                error: resendErrorMessage,
              },
              { status: 400 },
            );
          }

          if (data) {
            console.log("✅ [Resend Success]:", data);
          }

          sent += 1;
          results.push({
            participantId: String(participant.id),
            email,
            status: "sent",
            magicUrl,
          });
        }

        const { error: statusError } = await supabaseAdmin
          .from("participants")
          .update({ survey_status: "sent" })
          .eq("id", participant.id)
          .neq("survey_status", "completed");

        if (statusError) {
          console.warn(
            "[api/send-invites] Envío OK pero no se actualizó survey_status=sent:",
            statusError.message,
            { participantId: participant.id },
          );
        }
      } catch (sendCaught) {
        failed += 1;
        results.push({
          participantId: String(participant.id),
          email,
          status: "failed",
          error:
            sendCaught instanceof Error
              ? sendCaught.message
              : String(sendCaught),
          magicUrl,
        });
      }
    }

    const processed = sent + simulated;

    console.log("📧 [Invitaciones Enviadas]:", {
      count: participants.length,
      status: "success",
    });

    return NextResponse.json(
      {
        success: true,
        message: simulateOnly
          ? `Simuladas ${simulated} invitaciones (modo desarrollo / sin RESEND_API_KEY).`
          : `Enviadas ${sent} invitaciones correctamente.`,
        groupId,
        processed,
        sent,
        simulated,
        skipped,
        failed,
        total: participants.length,
        requestedParticipants: requestedParticipantIds.length,
        usedSimulation: simulateOnly,
        results,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/send-invites]", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processed: 0,
      },
      { status: 500 },
    );
  }
}
