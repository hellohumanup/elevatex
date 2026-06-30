const INVITATION_SUBJECT =
  "Diagnóstico Sistémico ElevateX - Tu participación es clave";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function resolveAppBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

export function buildQuestionnaireInvitationUrl(
  groupId: string,
  participantId: string,
): string {
  const baseUrl = resolveAppBaseUrl();
  const encodedGroupId = encodeURIComponent(groupId);
  const encodedToken = encodeURIComponent(participantId);
  return `${baseUrl}/cuestionario/${encodedGroupId}?token=${encodedToken}`;
}

export function buildInvitationEmailContent(input: {
  participantName: string;
  groupId: string;
  participantId: string;
}): { subject: string; html: string; questionnaireUrl: string } {
  const safeName = escapeHtml(input.participantName.trim() || "Colaborador");
  const questionnaireUrl = buildQuestionnaireInvitationUrl(
    input.groupId,
    input.participantId,
  );
  const safeUrl = escapeHtml(questionnaireUrl);

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${INVITATION_SUBJECT}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#020617;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:linear-gradient(180deg,#0f172a 0%,#020617 100%);border:1px solid #312e81;border-radius:20px;overflow:hidden;box-shadow:0 0 32px rgba(139,92,246,0.18);">
            <tr>
              <td style="padding:28px 32px 12px 32px;">
                <p style="margin:0 0 12px 0;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#a78bfa;">
                  ElevateX · Diagnóstico Sistémico
                </p>
                <h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:600;color:#f8fafc;">
                  Hola ${safeName}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px 32px;">
                <p style="margin:0;font-size:15px;line-height:1.7;color:#cbd5e1;">
                  Tu equipo ha iniciado el Diagnóstico de Dinámicas de Trabajo de ElevateX.
                  Haz clic en este enlace único y seguro para completar tu cuestionario:
                </p>
                <p style="margin:24px 0 0 0;text-align:center;">
                  <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:linear-gradient(90deg,#7c3aed,#8b5cf6);color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;box-shadow:0 0 20px rgba(139,92,246,0.35);">
                    Completar cuestionario
                  </a>
                </p>
                <p style="margin:20px 0 0 0;font-size:12px;line-height:1.6;color:#64748b;word-break:break-all;">
                  ${safeUrl}
                </p>
                <p style="margin:24px 0 0 0;font-size:13px;line-height:1.6;color:#94a3b8;">
                  Recuerda que este enlace es de un solo uso.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    subject: INVITATION_SUBJECT,
    html,
    questionnaireUrl,
  };
}

export { INVITATION_SUBJECT };
