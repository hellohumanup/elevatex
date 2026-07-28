import { NextResponse } from "next/server";
import { computeEdtMetrics } from "@/lib/edtMetrics";
import {
  computeElevateXOnaDiagnostics,
  type ElevateXOnaDiagnostics,
} from "@/lib/elevatexOnaEngine";
import { toSupabaseGroupId } from "@/lib/groupId";
import {
  FALLBACK_TEST_TENANT_ID,
  resolveDevActiveTenantId,
} from "@/lib/groups";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveProfileTenantId } from "@/lib/tenantProfile";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const IS_LOCAL_DEV = process.env.NODE_ENV === "development";
const DEV_FALLBACK_ORGANIZATION_ID = "11111111-1111-1111-1111-111111111111";
const DEV_FALLBACK_ORGANIZATION_NAME = "Human-Up Corp (Fallback Dev)";

/** cbd62767-1644-477c-a496-e26090532585 — ignora ACTIVE_TENANT_ID obsoleto. */
const DEV_ACTIVE_TENANT_ID = resolveDevActiveTenantId();

const TENANT_FORBIDDEN_MESSAGE =
  "Acceso no autorizado a este recurso de organización";

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

type GroupRow = {
  id: string | number;
  name: string;
  organization_id: string | null;
  manager_id: string | null;
  tenant_id: string | null;
};

type ParticipantRow = {
  id: string | number;
  name: string | null;
  group_id: string | number | null;
  email?: string | null;
  survey_status?: string | null;
};

type ResponseRow = {
  id: string | number | null;
  group_id: string | number | null;
  participant_id: string | number | null;
  respondent_name: string | null;
  answers: unknown;
  started_at: string | null;
  completed_at: string | null;
};

/** Payload crudo para hidratar el cliente sin pasar por RLS. */
export type ElevateXRawParticipant = {
  id: string;
  name: string;
  group_id: string;
  email?: string | null;
  survey_status?: "pending_send" | "sent" | "completed" | string | null;
};

export type ElevateXRawResponse = {
  id: string;
  group_id: string;
  participant_id: string | null;
  respondent_name: string | null;
  answers: unknown;
  started_at: string | null;
  completed_at: string | null;
};

type OrganizationContext = {
  organizationId: string;
  organizationName: string;
  usedDevFallback: boolean;
};

function devFallbackOrganization(reason: string): OrganizationContext {
  console.warn(
    `[api/groups/elevatex-metrics] Dev bypass (organización): ${reason}`,
    {
      organizationId: DEV_FALLBACK_ORGANIZATION_ID,
      organizationName: DEV_FALLBACK_ORGANIZATION_NAME,
    },
  );

  return {
    organizationId: DEV_FALLBACK_ORGANIZATION_ID,
    organizationName: DEV_FALLBACK_ORGANIZATION_NAME,
    usedDevFallback: true,
  };
}

async function resolveOrganizationContext(
  supabase: SupabaseClient,
  group: GroupRow,
  routeGroupId: string,
): Promise<
  | { ok: true; context: OrganizationContext }
  | { ok: false; status: number; error: string; details?: string }
> {
  if (!group.organization_id) {
    if (IS_LOCAL_DEV) {
      return {
        ok: true,
        context: devFallbackOrganization(
          `equipo ${routeGroupId} sin organization_id`,
        ),
      };
    }

    console.warn(
      "[api/groups/elevatex-metrics] Equipo sin organization_id:",
      routeGroupId,
    );
    return {
      ok: false,
      status: 404,
      error:
        "El equipo no tiene una organización asignada. Ejecuta el backfill multi-tenant.",
    };
  }

  const organizationResult = await fetchOrganizationName(
    supabase,
    group.organization_id,
  );

  if (!organizationResult.ok) {
    if (IS_LOCAL_DEV) {
      return {
        ok: true,
        context: devFallbackOrganization(
          organizationResult.error +
            (organizationResult.details
              ? ` (${organizationResult.details})`
              : ""),
        ),
      };
    }

    return {
      ok: false,
      status: organizationResult.status,
      error: organizationResult.error,
      details: organizationResult.details,
    };
  }

  return {
    ok: true,
    context: {
      organizationId: group.organization_id,
      organizationName: organizationResult.name,
      usedDevFallback: false,
    },
  };
}

function errorResponse(
  error: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    { success: false, error, ...extra },
    {
      status,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    },
  );
}

function successResponse(payload: Record<string, unknown>) {
  return NextResponse.json(
    { success: true, ...payload },
    {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    },
  );
}

/**
 * Resuelve el tenant activo de la petición.
 * - Local: FALLBACK_TEST_TENANT_ID canónico (cbd62767-…-e26090532585).
 * - Producción: profiles.tenant_id del usuario autenticado.
 */
async function resolveActiveTenantId(): Promise<
  | { ok: true; tenantId: string; source: "env" | "dev-fallback" | "session" }
  | { ok: false; status: number; error: string }
> {
  if (IS_LOCAL_DEV) {
    const tenantId = resolveDevActiveTenantId();
    console.warn(
      "[api/groups/elevatex-metrics] Tenant activo (dev):",
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
      "[api/groups/elevatex-metrics] Error resolviendo tenant de sesión:",
      error,
    );
    return {
      ok: false,
      status: 401,
      error: "No se pudo validar la sesión del usuario.",
    };
  }
}

/**
 * Gate multi-tenant temprano: solo lee tenant_id + organization_id del grupo.
 * Debe ejecutarse ANTES de participants/responses/ONA.
 */
async function assertGroupTenantAccess(
  supabase: SupabaseClient,
  supabaseGroupId: string | number,
  routeGroupId: string,
  activeTenantId: string,
): Promise<
  | {
      ok: true;
      group: GroupRow;
      organizationId: string | null;
      tenantId: string;
    }
  | { ok: false; status: number; error: string; details?: string }
> {
  console.log(
    "[api/groups/elevatex-metrics] 🔐 Gate multi-tenant — comprobando tenant_id…",
    { routeGroupId, supabaseGroupId, activeTenantId },
  );

  const { data, error } = await supabase
    .from("groups")
    .select("id, name, organization_id, manager_id, tenant_id")
    .eq("id", supabaseGroupId)
    .maybeSingle<GroupRow>();

  if (error) {
    console.error(
      "[api/groups/elevatex-metrics] Error en gate multi-tenant:",
      error.message,
      error.code,
    );
    return {
      ok: false,
      status: 400,
      error: "Datos insuficientes o error de base de datos",
      details: error.message,
    };
  }

  if (!data) {
    console.warn(
      "[api/groups/elevatex-metrics] Grupo no encontrado (404):",
      routeGroupId,
    );
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

  // En local, grupos legacy sin tenant_id se asimilan al tenant de desarrollo
  // para no bloquear el MVP; en producción la ausencia es denegación.
  const effectiveGroupTenantId =
    rawTenantId ?? (IS_LOCAL_DEV ? DEV_ACTIVE_TENANT_ID : null);

  if (!effectiveGroupTenantId) {
    console.warn(
      "[api/groups/elevatex-metrics] Grupo sin tenant_id — acceso denegado:",
      routeGroupId,
    );
    return {
      ok: false,
      status: 403,
      error: TENANT_FORBIDDEN_MESSAGE,
      details: "El equipo no tiene tenant_id asignado.",
    };
  }

  if (effectiveGroupTenantId !== activeTenantId) {
    console.warn(
      "[api/groups/elevatex-metrics] ⛔ Tenant mismatch — 403 Forbidden",
      {
        routeGroupId,
        groupTenantId: effectiveGroupTenantId,
        activeTenantId,
        organizationId: data.organization_id,
      },
    );
    return {
      ok: false,
      status: 403,
      error: TENANT_FORBIDDEN_MESSAGE,
      details: `tenant_id del grupo (${effectiveGroupTenantId}) ≠ activeTenantId (${activeTenantId}).`,
    };
  }

  console.log(
    "[api/groups/elevatex-metrics] ✓ Gate multi-tenant OK",
    {
      routeGroupId,
      tenantId: effectiveGroupTenantId,
      organizationId: data.organization_id,
      tenantIdWasNull: rawTenantId === null,
    },
  );

  return {
    ok: true,
    group: {
      ...data,
      tenant_id: effectiveGroupTenantId,
    },
    organizationId: data.organization_id,
    tenantId: effectiveGroupTenantId,
  };
}

async function fetchOrganizationName(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<
  | { ok: true; name: string }
  | { ok: false; status: number; error: string; details?: string }
> {
  try {
    console.log(
      "[api/groups/elevatex-metrics] Consultando organizations…",
      { organizationId },
    );

    const { data, error } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle<{ id: string; name: string }>();

    if (error) {
      console.error(
        "[api/groups/elevatex-metrics] Error Supabase en organizations:",
        error.message,
        error.code,
        error.details,
      );
      return {
        ok: false,
        status: 400,
        error: "Datos insuficientes o error de base de datos",
        details: error.message,
      };
    }

    if (!data) {
      console.warn(
        "[api/groups/elevatex-metrics] Organización no encontrada:",
        organizationId,
      );
      return {
        ok: false,
        status: 404,
        error: "La organización asociada al equipo no existe.",
      };
    }

    return { ok: true, name: data.name };
  } catch (caughtError) {
    console.error(
      "[api/groups/elevatex-metrics] Excepción consultando organizations:",
      caughtError,
    );
    return {
      ok: false,
      status: 400,
      error: "Datos insuficientes o error de base de datos",
      details:
        caughtError instanceof Error ? caughtError.message : String(caughtError),
    };
  }
}

async function fetchManagerRecord(
  supabase: SupabaseClient,
  managerId: string,
): Promise<
  | { ok: true; id: string }
  | { ok: false; status: number; error: string; details?: string }
> {
  try {
    console.log(
      "[api/groups/elevatex-metrics] Consultando managers…",
      { managerId },
    );

    const { data, error } = await supabase
      .from("managers")
      .select("id, name, organization_id")
      .eq("id", managerId)
      .maybeSingle<{ id: string; name: string; organization_id: string }>();

    if (error) {
      console.error(
        "[api/groups/elevatex-metrics] Error Supabase en managers:",
        error.message,
        error.code,
        error.details,
      );
      return {
        ok: false,
        status: 400,
        error: "Datos insuficientes o error de base de datos",
        details: error.message,
      };
    }

    if (!data) {
      console.warn(
        "[api/groups/elevatex-metrics] Manager no encontrado:",
        managerId,
      );
      return {
        ok: false,
        status: 404,
        error: "El manager asociado al equipo no existe.",
      };
    }

    return { ok: true, id: data.id };
  } catch (caughtError) {
    console.error(
      "[api/groups/elevatex-metrics] Excepción consultando managers:",
      caughtError,
    );
    return {
      ok: false,
      status: 400,
      error: "Datos insuficientes o error de base de datos",
      details:
        caughtError instanceof Error ? caughtError.message : String(caughtError),
    };
  }
}

async function fetchParticipants(
  supabase: SupabaseClient,
  supabaseGroupId: string | number,
  routeGroupId: string,
): Promise<
  | { ok: true; participants: ElevateXRawParticipant[] }
  | { ok: false; status: number; error: string; details?: string }
> {
  try {
    console.log(
      "[api/groups/elevatex-metrics] Consultando participants…",
      { routeGroupId, supabaseGroupId },
    );

    const { data, error } = await supabase
      .from("participants")
      .select("id, name, group_id, email, survey_status")
      .eq("group_id", supabaseGroupId)
      .order("name", { ascending: true })
      .returns<ParticipantRow[]>();

    if (error) {
      console.error(
        "[api/groups/elevatex-metrics] Error Supabase en participants:",
        error.message,
        error.code,
        error.details,
      );
      return {
        ok: false,
        status: 400,
        error: "Datos insuficientes o error de base de datos",
        details: error.message,
      };
    }

    const participants: ElevateXRawParticipant[] = (data ?? []).map((row) => ({
      id: String(row.id),
      name:
        typeof row.name === "string" && row.name.trim().length > 0
          ? row.name.trim()
          : String(row.id),
      group_id:
        row.group_id === null || row.group_id === undefined
          ? String(supabaseGroupId)
          : String(row.group_id),
      email:
        typeof row.email === "string" && row.email.trim().length > 0
          ? row.email.trim()
          : null,
      survey_status:
        row.survey_status === "sent" ||
        row.survey_status === "completed" ||
        row.survey_status === "pending_send"
          ? row.survey_status
          : "pending_send",
    }));

    console.log(
      "[api/groups/elevatex-metrics] participants cargados:",
      participants.length,
    );

    return { ok: true, participants };
  } catch (caughtError) {
    console.error(
      "[api/groups/elevatex-metrics] Excepción consultando participants:",
      caughtError,
    );
    return {
      ok: false,
      status: 400,
      error: "Datos insuficientes o error de base de datos",
      details:
        caughtError instanceof Error ? caughtError.message : String(caughtError),
    };
  }
}

async function fetchResponses(
  supabase: SupabaseClient,
  supabaseGroupId: string | number,
  routeGroupId: string,
): Promise<
  | { ok: true; responses: ElevateXRawResponse[] }
  | { ok: false; status: number; error: string; details?: string }
> {
  try {
    console.log(
      "[api/groups/elevatex-metrics] Consultando responses…",
      { routeGroupId, supabaseGroupId },
    );

    const { data, error } = await supabase
      .from("responses")
      .select(
        "id, group_id, participant_id, respondent_name, answers, started_at, completed_at",
      )
      .eq("group_id", supabaseGroupId)
      .returns<ResponseRow[]>();

    if (error) {
      console.error(
        "[api/groups/elevatex-metrics] Error Supabase en responses:",
        error.message,
        error.code,
        error.details,
      );
      return {
        ok: false,
        status: 400,
        error: "Datos insuficientes o error de base de datos",
        details: error.message,
      };
    }

    const responses: ElevateXRawResponse[] = (data ?? []).map((row, index) => ({
      id:
        row.id === null || row.id === undefined
          ? `response-${index}`
          : String(row.id),
      group_id:
        row.group_id === null || row.group_id === undefined
          ? String(supabaseGroupId)
          : String(row.group_id),
      participant_id:
        row.participant_id === null || row.participant_id === undefined
          ? null
          : String(row.participant_id),
      respondent_name:
        typeof row.respondent_name === "string" ? row.respondent_name : null,
      answers: row.answers,
      started_at:
        typeof row.started_at === "string" ? row.started_at : null,
      completed_at:
        typeof row.completed_at === "string" ? row.completed_at : null,
    }));

    console.log(
      "[api/groups/elevatex-metrics] responses cargadas:",
      responses.length,
    );

    return { ok: true, responses };
  } catch (caughtError) {
    console.error(
      "[api/groups/elevatex-metrics] Excepción consultando responses:",
      caughtError,
    );
    return {
      ok: false,
      status: 400,
      error: "Datos insuficientes o error de base de datos",
      details:
        caughtError instanceof Error ? caughtError.message : String(caughtError),
    };
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { groupId } = await context.params;
  const normalizedGroupId = groupId?.trim();

  console.log("============================================================");
  console.log(
    "[api/groups/elevatex-metrics] ▶ INICIO petición GET — groupId consultado:",
    normalizedGroupId ?? "(vacío)",
  );
  console.log("============================================================");

  if (!normalizedGroupId) {
    return errorResponse("groupId es obligatorio.", 400);
  }

  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    console.error(
      "[api/groups/elevatex-metrics] SUPABASE_SERVICE_ROLE_KEY no configurada.",
    );
    return errorResponse(
      "SUPABASE_SERVICE_ROLE_KEY no configurada. Añádela en .env.local y reinicia el servidor.",
      503,
    );
  }

  const supabaseGroupId = toSupabaseGroupId(normalizedGroupId);
  console.log(
    "[api/groups/elevatex-metrics] groupId normalizado para PostgREST:",
    supabaseGroupId,
  );

  // 1) Resolver tenant activo (dev simulado / sesión real)
  const activeTenantResult = await resolveActiveTenantId();
  if (!activeTenantResult.ok) {
    return errorResponse(activeTenantResult.error, activeTenantResult.status);
  }

  // 2) Gate multi-tenant ligero (ANTES de participants/responses/ONA)
  const tenantGate = await assertGroupTenantAccess(
    supabase,
    supabaseGroupId,
    normalizedGroupId,
    activeTenantResult.tenantId,
  );

  if (!tenantGate.ok) {
    return errorResponse(tenantGate.error, tenantGate.status, {
      details: tenantGate.details,
    });
  }

  const group = tenantGate.group;

  const organizationContextResult = await resolveOrganizationContext(
    supabase,
    group,
    normalizedGroupId,
  );

  if (!organizationContextResult.ok) {
    return errorResponse(
      organizationContextResult.error,
      organizationContextResult.status,
      { details: organizationContextResult.details },
    );
  }

  const organizationContext = organizationContextResult.context;

  if (group.manager_id) {
    const managerResult = await fetchManagerRecord(supabase, group.manager_id);

    if (!managerResult.ok) {
      if (IS_LOCAL_DEV) {
        console.warn(
          "[api/groups/elevatex-metrics] Dev bypass (manager):",
          managerResult.error,
          managerResult.details ?? "",
        );
      } else {
        return errorResponse(managerResult.error, managerResult.status, {
          details: managerResult.details,
        });
      }
    }
  } else {
    console.warn(
      "[api/groups/elevatex-metrics] Equipo sin manager_id (se continúa con métricas):",
      normalizedGroupId,
    );
  }

  const participantsResult = await fetchParticipants(
    supabase,
    supabaseGroupId,
    normalizedGroupId,
  );

  if (!participantsResult.ok) {
    return errorResponse(participantsResult.error, participantsResult.status, {
      details: participantsResult.details,
    });
  }

  if (participantsResult.participants.length === 0) {
    console.warn(
      "[api/groups/elevatex-metrics] Sin participantes para el equipo:",
      normalizedGroupId,
    );
    return errorResponse(
      "Datos insuficientes: el equipo no tiene participantes registrados.",
      400,
    );
  }

  const responsesResult = await fetchResponses(
    supabase,
    supabaseGroupId,
    normalizedGroupId,
  );

  if (!responsesResult.ok) {
    return errorResponse(responsesResult.error, responsesResult.status, {
      details: responsesResult.details,
    });
  }

  try {
    console.log(
      "[api/groups/elevatex-metrics] Calculando métricas EDT + ONA en memoria…",
    );

    let edt;
    try {
      edt = computeEdtMetrics(
        responsesResult.responses.map((response) => ({
          answers: response.answers,
        })),
      );
    } catch (edtError) {
      console.error(
        "[api/groups/elevatex-metrics] Error en computeEdtMetrics:",
        edtError,
      );
      throw edtError;
    }

    let ona: ElevateXOnaDiagnostics;
    try {
      ona = computeElevateXOnaDiagnostics(
        participantsResult.participants,
        responsesResult.responses,
      );
    } catch (onaError) {
      console.error(
        "[api/groups/elevatex-metrics] Error en computeElevateXOnaDiagnostics:",
        onaError,
      );
      throw onaError;
    }

    console.log(
      "[api/groups/elevatex-metrics] ✓ Métricas calculadas correctamente para groupId:",
      normalizedGroupId,
      {
        participantCount: participantsResult.participants.length,
        responseCount: responsesResult.responses.length,
        organization: organizationContext.organizationName,
        usedDevFallback: organizationContext.usedDevFallback,
      },
    );

    return successResponse({
      groupId: normalizedGroupId,
      groupName: group.name,
      tenantId: tenantGate.tenantId,
      organizationId: organizationContext.organizationId,
      organizationName: organizationContext.organizationName,
      usedDevFallback: organizationContext.usedDevFallback,
      participantCount: participantsResult.participants.length,
      responseCount: responsesResult.responses.length,
      rawParticipants: participantsResult.participants,
      rawResponses: responsesResult.responses,
      edt,
      ona,
    });
  } catch (caughtError) {
    console.error(
      "[api/groups/elevatex-metrics] Error calculando métricas:",
      caughtError,
    );

    return errorResponse(
      "Datos insuficientes o error de base de datos",
      400,
      {
        details:
          caughtError instanceof Error
            ? caughtError.message
            : String(caughtError),
      },
    );
  }
}
