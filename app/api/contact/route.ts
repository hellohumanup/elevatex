import { Resend } from "resend";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const resend = new Resend(
  process.env.RESEND_API_KEY || "re_dummy_key_para_pasar_el_build",
);

const DEFAULT_LEAD_RECIPIENT = "hola@elevatex.com";

type ContactPayload = {
  name?: string;
  email?: string;
  company?: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildLeadEmailHtml(input: {
  name: string;
  email: string;
  company: string;
}): string {
  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.email);
  const safeCompany = escapeHtml(input.company);

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Nuevo Lead ElevateX</title>
  </head>
  <body style="margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#0f172a;border:1px solid #1e293b;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 8px 0;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#22d3ee;">
                  ElevateX · Nuevo Lead
                </p>
                <h1 style="margin:0 0 24px 0;font-size:22px;line-height:1.35;font-weight:600;color:#f8fafc;">
                  ${safeCompany}
                </h1>
                <p style="margin:0 0 12px 0;font-size:15px;line-height:1.7;color:#94a3b8;">
                  <strong style="color:#e2e8f0;">Nombre:</strong> ${safeName}
                </p>
                <p style="margin:0 0 12px 0;font-size:15px;line-height:1.7;color:#94a3b8;">
                  <strong style="color:#e2e8f0;">Email:</strong>
                  <a href="mailto:${safeEmail}" style="color:#22d3ee;text-decoration:none;">${safeEmail}</a>
                </p>
                <p style="margin:0;font-size:15px;line-height:1.7;color:#94a3b8;">
                  <strong style="color:#e2e8f0;">Empresa:</strong> ${safeCompany}
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
        {
          success: false,
          error:
            "El servicio de contacto no está disponible temporalmente. Escríbenos a hola@elevatex.com.",
        },
        { status: 503 },
      );
    }

    let body: ContactPayload;

    try {
      body = (await request.json()) as ContactPayload;
    } catch {
      return NextResponse.json(
        { success: false, error: "Petición no válida." },
        { status: 400 },
      );
    }

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const company = typeof body.company === "string" ? body.company.trim() : "";

    if (!name || !email || !company) {
      return NextResponse.json(
        { success: false, error: "Nombre, email y empresa son obligatorios." },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { success: false, error: "Introduce un correo electrónico válido." },
        { status: 400 },
      );
    }

    const toAddress =
      process.env.CONTACT_LEAD_EMAIL?.trim() || DEFAULT_LEAD_RECIPIENT;
    const fromAddress =
      process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";

    const { error: sendError } = await resend.emails.send({
      from: fromAddress,
      to: [toAddress],
      replyTo: email,
      subject: `Nuevo Lead: ${company} - ElevateX`,
      html: buildLeadEmailHtml({ name, email, company }),
    });

    if (sendError) {
      console.error("[api/contact] Error enviando lead:", sendError);
      return NextResponse.json(
        {
          success: false,
          error:
            "No pudimos registrar tu solicitud en este momento. Inténtalo de nuevo en unos instantes.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/contact] Error inesperado:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          "Error de conexión con el servidor. Por favor, inténtalo de nuevo en unos instantes.",
      },
      { status: 500 },
    );
  }
}
