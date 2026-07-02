import { Resend } from "resend";
import { NextResponse } from "next/server";
import { toSupabaseGroupId } from "@/lib/groupId";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_key_para_pasar_el_build");

const INVITATION_SUBJECT =
  "¡Tu equipo te necesita! Participa en la dinámica de Vínculo";

type ParticipantRow = {
  id: string;
  name: string;
  email: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildInvitationUrl(groupId: string, participantId: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "http://localhost:3000";

  return `${baseUrl}/cuestionario/${encodeURIComponent(groupId)}?user=${encodeURIComponent(participantId)}`;
}

function buildInvitationHtml(
  participantName: string,
  invitationUrl: string,
): string {
  const safeName = escapeHtml(participantName.trim() || "Colaborador");
  const safeUrl = escapeHtml(invitationUrl);

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(INVITATION_SUBJECT)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:32px 32px 16px 32px;">
                <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6366f1;">
                  Vínculo · ElevateX
                </p>
                <h1 style="margin:0;font-size:22px;line-height:1.35;font-weight:600;color:#0f172a;">
                  Hola, ${safeName}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px 32px;">
                <p style="margin:0;font-size:15px;line-height:1.7;color:#475569;">
                  Tu equipo ha iniciado una dinámica de diagnóstico. Tu participación
                  es clave para construir el sociograma y el informe del equipo.
                </p>
                <p style="margin:28px 0 0 0;text-align:center;">
                  <a href="${safeUrl}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:linear-gradient(90deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;box-shadow:0 8px 20px rgba(79,70,229,0.28);">
                    Acceder al cuestionario
                  </a>
                </p>
                <p style="margin:20px 0 0 0;font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all;">
                  ${safeUrl}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function POST(request: Request) {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { success: false, error: "RESEND_API_KEY no configurada." },
        { status: 503 },
      );
    }

    const body = (await request.json()) as { groupId?: string };
    const groupId =
      typeof body.groupId === "string" ? body.groupId.trim() : "";

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: "groupId es obligatorio en el cuerpo de la petición." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServiceRoleClient();

    if (!supabase) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY no configurada. Añade la clave en .env.local.",
      );
    }

    const { data: participantRows, error: participantsError } = await supabase
      .from("participants")
      .select("id, name, email")
      .eq("group_id", toSupabaseGroupId(groupId))
      .order("name", { ascending: true });

    if (participantsError) {
      throw new Error(participantsError.message);
    }

    const participants: ParticipantRow[] = (participantRows ?? []).map(
      (row) => ({
        id: String(row.id),
        name: typeof row.name === "string" ? row.name.trim() : "",
        email:
          typeof row.email === "string" && row.email.trim()
            ? row.email.trim()
            : null,
      }),
    );

    const fromAddress =
      process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";

    let sentCount = 0;

    for (const participant of participants) {
      if (!participant.email || !participant.email.includes("@")) {
        continue;
      }

      const invitationUrl = buildInvitationUrl(groupId, participant.id);
      const html = buildInvitationHtml(participant.name, invitationUrl);

      const { error: sendError } = await resend.emails.send({
        from: fromAddress,
        to: participant.email,
        subject: INVITATION_SUBJECT,
        html,
      });

      if (sendError) {
        throw new Error(sendError.message);
      }

      sentCount += 1;
    }

    if (sentCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No hay colaboradores con correo electrónico válido para enviar invitaciones.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Invitaciones enviadas correctamente",
      sent: sentCount,
    });
  } catch (error) {
    console.error("[API_SEND_INVITATIONS] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
