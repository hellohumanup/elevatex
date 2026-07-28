import { Resend } from "resend";
import { NextResponse } from "next/server";
import { toSupabaseGroupId } from "@/lib/groupId";
import {
  FALLBACK_TEST_TENANT_ID,
  resolveDevActiveTenantId,
} from "@/lib/groups";
import { resolveAppBaseUrl } from "@/lib/invitationEmail";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveProfileTenantId } from "@/lib/tenantProfile";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/groups/[groupId]/send-invites
 *
 * Envío masivo de invitaciones ElevateX vía Resend.
 * Dependencia: `resend` (ya en package.json). Si faltara: `npm i resend`.
 */

const IS_LOCAL_DEV = process.env.NODE_ENV === "development";

/** Tenant canónico local: cbd62767-1644-477c-a496-e26090532585 */
const DEV_ACTIVE_TENANT_ID = resolveDevActiveTenantId();

const TENANT_FORBIDDEN_MESSAGE =
  "Acceso no autorizado a este recurso de organización";

const DEFAULT_FROM =
  process.env.RESEND_FROM_EMAIL?.trim() ||
  "Vínculo <onboarding@resend.dev>";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

type GroupTenantRow = {
  id: string | number;
  name: string | null;
  organization_id: string | null;
  tenant_id: string | null;
};

type ParticipantInviteRow = {
  id: string | number;
  name: string | null;
  email: string | null;
  magic_token: string | null;
  access_token: string | null;
  survey_status: string | null;
};

type SendResult = {
  participantId: string;
  email: string;
  status: "sent" | "simulated" | "failed";
  magicUrl?: string;
  error?: string;
};

function isValidEmail(value: string | null | undefined): value is string {
  return typeof value === "string" && EMAIL_REGEX.test(value.trim());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildParticipateMagicUrl(magicToken: string): string {
  const baseUrl = resolveAppBaseUrl();
  return `${baseUrl}/survey/participar?token=${encodeURIComponent(magicToken)}`;
}

function buildDarkPremiumInviteHtml(input: {
  participantName: string;
  groupName: string;
  magicUrl: string;
}): string {
  const name = escapeHtml(input.participantName.trim() || "Colaborador");
  const group = escapeHtml(input.groupName.trim() || "tu equipo");
  const url = escapeHtml(input.magicUrl);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ElevateX — Invitación</title>
</head>
<body style="margin:0;padding:0;background:#020617;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#020617;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0f172a;border:1px solid rgba(139,92,246,0.28);border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#a78bfa;font-weight:700;">
                ElevateX · People Analytics
              </p>
              <h1 style="margin:16px 0 0;font-size:26px;line-height:1.25;color:#f8fafc;font-weight:700;">
                Hola, ${name}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 0;">
              <p style="margin:0;font-size:15px;line-height:1.65;color:#cbd5e1;">
                El equipo <strong style="color:#e2e8f0;">${group}</strong> te invita a participar
                en el diagnóstico de dinámicas de trabajo y análisis de red organizacional (ONA).
              </p>
              <p style="margin:16px 0 0;font-size:15px;line-height:1.65;color:#94a3b8;">
                Tu respuesta es confidencial y tarda unos 10–15 minutos. El enlace es personal
                y de un solo uso.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 32px;">
              <a href="${url}"
                 style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6366f1);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 28px;border-radius:12px;box-shadow:0 0 24px rgba(139,92,246,0.35);">
                Acceder a mi cuestionario
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;word-break:break-all;">
                Si el botón no funciona, copia este enlace:<br />
                <a href="${url}" style="color:#a78bfa;text-decoration:underline;">${url}</a>
              </p>
              <p style="margin:20px 0 0;font-size:12px;color:#475569;">
                ElevateX® · Human-Up · invitaciones@human-up.eu
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

async function resolveActiveTenantId(): Promise<
  | { ok: true; tenantId: string; source: "env" | "dev-fallback" | "session" }
  | { ok: false; status: number; error: string }
> {
  if (IS_LOCAL_DEV) {
    const tenantId = resolveDevActiveTenantId();
    console.warn(
      "[api/groups/send-invites] Tenant activo (dev):",
      tenantId,
      tenantId === FALLBACK_TEST_TENANT_ID ? "(canónico)" : "",
    );
    return {
      ok: true,
      tenantId,
      source:
        process.env.ACTIVE_TENANT_ID?.trim() === FALLBACK_TEST_TENANT_ID
          ? "env"
          : "dev-fallback",
    };
  }

  try {
    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return {
        ok: false,
        status: 401,
        error: "Sesión no válida. Inicia sesión para acceder a este recurso.",
      };
    }

    const { tenantId, error: tenantError } = await resolveProfileTenantId(
      authClient,
      user.id,
    );

    if (!tenantId) {
      return {
        ok: false,
        status: 403,
        error:
          tenantError ??
          "Tu usuario no tiene un tenant asignado. Contacta con soporte.",
      };
    }

    return { ok: true, tenantId, source: "session" };
  } catch (error) {
    console.error(
      "[api/groups/send-invites] Error resolviendo tenant de sesión:",
      error,
    );
    return {
      ok: false,
      status: 401,
      error: "No se pudo validar la sesión del usuario.",
    };
  }
}

async function assertGroupTenantAccess(
  supabase: SupabaseClient,
  supabaseGroupId: string | number,
  routeGroupId: string,
  activeTenantId: string,
): Promise<
  | {
      ok: true;
      tenantId: string;
      organizationId: string | null;
      groupName: string | null;
    }
  | { ok: false; status: number; error: string; details?: string }
> {
  console.log(
    "[api/groups/send-invites] 🔐 Gate multi-tenant — comprobando tenant_id…",
    { routeGroupId, supabaseGroupId, activeTenantId },
  );

  const { data, error } = await supabase
    .from("groups")
    .select("id, name, organization_id, tenant_id")
    .eq("id", supabaseGroupId)
    .maybeSingle<GroupTenantRow>();

  if (error) {
    console.error(
      "[api/groups/send-invites] Error en gate multi-tenant:",
      error.message,
    );
    return {
      ok: false,
      status: 400,
      error: "Datos insuficientes o error de base de datos",
      details: error.message,
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      error: `No se encontró el equipo con id ${routeGroupId}.`,
    };
  }

  const rawTenantId =
    typeof data.tenant_id === "string" && data.tenant_id.trim().length > 0
      ? data.tenant_id.trim()
      : null;

  const effectiveGroupTenantId =
    rawTenantId ?? (IS_LOCAL_DEV ? DEV_ACTIVE_TENANT_ID : null);

  if (!effectiveGroupTenantId) {
    return {
      ok: false,
      status: 403,
      error: TENANT_FORBIDDEN_MESSAGE,
      details: "El equipo no tiene tenant_id asignado.",
    };
  }

  if (effectiveGroupTenantId !== activeTenantId) {
    console.warn("[api/groups/send-invites] ⛔ Tenant mismatch — 403", {
      routeGroupId,
      groupTenantId: effectiveGroupTenantId,
      activeTenantId,
    });
    return {
      ok: false,
      status: 403,
      error: TENANT_FORBIDDEN_MESSAGE,
      details: `tenant_id del grupo (${effectiveGroupTenantId}) ≠ activeTenantId (${activeTenantId}).`,
    };
  }

  console.log("[api/groups/send-invites] ✓ Gate multi-tenant OK", {
    routeGroupId,
    tenantId: effectiveGroupTenantId,
  });

  return {
    ok: true,
    tenantId: effectiveGroupTenantId,
    organizationId: data.organization_id,
    groupName:
      typeof data.name === "string" && data.name.trim().length > 0
        ? data.name.trim()
        : null,
  };
}

function resolveMagicToken(participant: ParticipantInviteRow): string | null {
  const magic =
    typeof participant.magic_token === "string"
      ? participant.magic_token.trim()
      : "";
  if (magic) {
    return magic;
  }

  const access =
    typeof participant.access_token === "string"
      ? participant.access_token.trim()
      : "";
  return access || null;
}

export async function POST(_request: Request, context: RouteContext) {
  const { groupId: rawGroupId } = await context.params;
  const groupId = rawGroupId?.trim();

  if (!groupId) {
    return NextResponse.json(
      { success: false, error: "groupId es obligatorio en la ruta." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
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

  const activeTenantResult = await resolveActiveTenantId();
  if (!activeTenantResult.ok) {
    return NextResponse.json(
      { success: false, error: activeTenantResult.error },
      { status: activeTenantResult.status },
    );
  }

  const tenantGate = await assertGroupTenantAccess(
    supabase,
    supabaseGroupId,
    groupId,
    activeTenantResult.tenantId,
  );

  if (!tenantGate.ok) {
    return NextResponse.json(
      {
        success: false,
        error: tenantGate.error,
        ...(tenantGate.details ? { details: tenantGate.details } : {}),
      },
      { status: tenantGate.status },
    );
  }

  const groupName = tenantGate.groupName ?? `Equipo ${groupId}`;

  const { data: participantRows, error: participantsError } = await supabase
    .from("participants")
    .select("id, name, email, magic_token, access_token, survey_status")
    .eq("group_id", supabaseGroupId)
    .eq("survey_status", "pending_send")
    .not("email", "is", null)
    .order("name", { ascending: true });

  if (participantsError) {
    console.error(
      "[api/groups/send-invites] Error cargando participantes:",
      participantsError.message,
    );
    return NextResponse.json(
      {
        success: false,
        error: "No se pudieron cargar los colaboradores pendientes.",
        details: participantsError.message,
      },
      { status: 400 },
    );
  }

  const pending = ((participantRows ?? []) as ParticipantInviteRow[]).filter(
    (participant) => isValidEmail(participant.email),
  );

  if (pending.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No hay colaboradores con email válido en estado pending_send para este equipo.",
        sent: 0,
        simulated: 0,
        failed: 0,
        skipped: 0,
      },
      { status: 400 },
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim() || "";
  const simulateOnly = !resendApiKey;
  const resend = simulateOnly ? null : new Resend(resendApiKey);

  if (simulateOnly) {
    console.warn(
      "[api/groups/send-invites] RESEND_API_KEY ausente — simulando envíos locales (sin bloquear desarrollo).",
    );
  }

  const results: SendResult[] = [];
  let sent = 0;
  let simulated = 0;
  let failed = 0;

  for (const participant of pending) {
    const email = participant
      .email!.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x00-\x7F]/g, "")
      .replace(/\s+/g, "")
      .toLowerCase()
      .trim();
    const participantName =
      typeof participant.name === "string" && participant.name.trim()
        ? participant.name.trim()
        : "Colaborador";

    let magicToken = resolveMagicToken(participant);

    if (!magicToken) {
      const { data: refreshed, error: tokenError } = await supabase
        .from("participants")
        .update({
          magic_token: crypto.randomUUID(),
        })
        .eq("id", participant.id)
        .select("magic_token")
        .maybeSingle();

      if (tokenError || !refreshed?.magic_token) {
        failed += 1;
        results.push({
          participantId: String(participant.id),
          email,
          status: "failed",
          error:
            tokenError?.message ??
            "No se pudo generar magic_token para el colaborador.",
        });
        continue;
      }

      magicToken = String(refreshed.magic_token);
    }

    const magicUrl = buildParticipateMagicUrl(magicToken);
    const html = buildDarkPremiumInviteHtml({
      participantName,
      groupName,
      magicUrl,
    });
    const subject = `ElevateX — Invitación al diagnóstico de ${groupName}`;

    // En local, o fuera del dominio verificado de Resend, simular sin llamar a la API.
    const simulateThisSend =
      simulateOnly ||
      IS_LOCAL_DEV ||
      email !== "hello@human-up.eu";

    try {
      if (simulateThisSend) {
        console.log(
          `[api/groups/send-invites] ✉ SIMULADO → ${email} | ${participantName}`,
        );
        console.log(`[api/groups/send-invites]    enlace: ${magicUrl}`);
        simulated += 1;
        results.push({
          participantId: String(participant.id),
          email,
          status: "simulated",
          magicUrl,
        });
      } else {
        const { data, error: sendError } = await resend!.emails.send({
          from: DEFAULT_FROM,
          to: email,
          subject,
          html,
        });

        if (sendError) {
          console.error("❌ [Resend Error]:", sendError);
          return NextResponse.json(
            {
              success: false,
              error: sendError.message,
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

      const { error: statusError } = await supabase
        .from("participants")
        .update({ survey_status: "sent" })
        .eq("id", participant.id)
        .eq("survey_status", "pending_send");

      if (statusError) {
        console.warn(
          "[api/groups/send-invites] Correo OK pero no se actualizó survey_status=sent:",
          statusError.message,
          { participantId: participant.id },
        );
      }
    } catch (error) {
      failed += 1;
      results.push({
        participantId: String(participant.id),
        email,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        magicUrl,
      });
    }
  }

  const successCount = sent + simulated;

  if (successCount === 0) {
    return NextResponse.json(
      {
        success: false,
        error: results[0]?.error ?? "No se pudo enviar ninguna invitación.",
        sent,
        simulated,
        failed,
        results,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    message: simulateOnly
      ? `Simulados ${simulated} envíos locales (sin RESEND_API_KEY).`
      : `Enviadas ${sent} invitaciones correctamente.`,
    groupId,
    groupName,
    tenantId: tenantGate.tenantId,
    sent,
    simulated,
    failed,
    totalPending: pending.length,
    usedSimulation: simulateOnly,
    results,
  });
}
