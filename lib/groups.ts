import { toSupabaseGroupId } from "@/lib/groupId";
import {
  ensureOrganizationExists,
  fetchFirstOrganizationId,
  normalizeOrganizationId,
  resolveOrganizationIdForInsert,
} from "@/lib/organizations";
import { getSupabase } from "@/lib/supabase";

/** Tenant de pruebas inyectado cuando no hay perfil o tenant_id es NULL. */
export const FALLBACK_TEST_TENANT_ID = "cbd62767-1644-477c-a496-e26ea31dc109";

/** @deprecated Usar FALLBACK_TEST_TENANT_ID */
export const LOCAL_DEV_TENANT_ID = FALLBACK_TEST_TENANT_ID;

export type GroupRecord = {
  id: string;
  name: string;
  age_band: string;
  created_at: string;
  organization_id: string | null;
  manager_id: string | null;
  tenant_id: string | null;
};

const GROUP_COLUMNS =
  "id, name, age_band, created_at, organization_id, manager_id, tenant_id";

/** Tenant fijo para el dashboard en localhost (pruebas multi-tenant). */
export const DEMO_DASHBOARD_ORGANIZATION_ID =
  "00000000-0000-0000-0000-000000000000";

export type GroupWithParticipantCount = GroupRecord & {
  participant_count: number;
};

type SupabaseErrorShape = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function normalizeInsertError(error: SupabaseErrorShape | null) {
  if (!error) {
    return {
      message: "Error desconocido al crear el equipo.",
      details: "",
      hint: "",
      code: "UNKNOWN",
    };
  }

  return {
    message: error.message || "No se pudo crear el equipo (RLS o permisos).",
    details: error.details ?? "",
    hint: error.hint ?? "",
    code: error.code ?? "INSERT_FAILED",
  };
}

/**
 * Obtiene tenant_id del perfil; si el perfil es nulo o sin tenant, devuelve el UUID fijo de pruebas.
 */
async function resolveTenantIdForInsert(
  supabase: ReturnType<typeof getSupabase>,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return FALLBACK_TEST_TENANT_ID;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.tenant_id) {
    return FALLBACK_TEST_TENANT_ID;
  }

  return String(profile.tenant_id);
}

async function insertGroupViaDevApi(payload: {
  name: string;
  age_band: string;
  organization_id: string;
  manager_id: string | null;
  tenant_id: string;
}): Promise<{ data: GroupRecord | null; error: SupabaseErrorShape | null }> {
  try {
    const response = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as {
      data?: GroupRecord;
      error?: string;
      code?: string;
    };

    if (!response.ok || result.error) {
      return {
        data: null,
        error: {
          message: result.error ?? "Fallback server-side falló.",
          code: result.code,
        },
      };
    }

    return { data: result.data ?? null, error: null };
  } catch (fetchError) {
    return {
      data: null,
      error: {
        message:
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudo contactar /api/groups.",
      },
    };
  }
}

export async function fetchGroupsForOrganization(organizationId: string) {
  return getSupabase()
    .from("groups")
    .select(GROUP_COLUMNS)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
}

export async function fetchGroupsWithParticipantCounts(
  organizationId: string,
): Promise<{
  data: GroupWithParticipantCount[];
  error: { message: string } | null;
}> {
  const { data: groups, error: groupsError } =
    await fetchGroupsForOrganization(organizationId);

  if (groupsError) {
    return { data: [], error: { message: groupsError.message } };
  }

  if (!groups || groups.length === 0) {
    return { data: [], error: null };
  }

  const groupIds = groups.map((group) => toSupabaseGroupId(String(group.id)));

  const { data: participants, error: participantsError } = await getSupabase()
    .from("participants")
    .select("group_id")
    .in("group_id", groupIds);

  if (participantsError) {
    return { data: [], error: { message: participantsError.message } };
  }

  const countsByGroup = new Map<string, number>();

  for (const participant of participants ?? []) {
    const groupId = String(participant.group_id);
    countsByGroup.set(groupId, (countsByGroup.get(groupId) ?? 0) + 1);
  }

  return {
    data: groups.map((group) => ({
      ...group,
      participant_count: countsByGroup.get(String(group.id)) ?? 0,
    })),
    error: null,
  };
}

export async function fetchGroupsForTenant() {
  try {
    const organizationId = await fetchFirstOrganizationId();

    const query = getSupabase()
      .from("groups")
      .select(GROUP_COLUMNS)
      .order("created_at", { ascending: false });

    if (organizationId) {
      return query.or(
        `organization_id.eq.${organizationId},organization_id.is.null`,
      );
    }

    return query;
  } catch (error) {
    console.error("[fetchGroupsForTenant] Error al listar equipos:", error);
    return getSupabase()
      .from("groups")
      .select(GROUP_COLUMNS)
      .order("created_at", { ascending: false });
  }
}

export async function fetchGroupById(groupId: string) {
  return getSupabase()
    .from("groups")
    .select(GROUP_COLUMNS)
    .eq("id", toSupabaseGroupId(groupId))
    .single();
}

export type CreateGroupInput = {
  name: string;
  age_band: string;
  /** UUID de la organización tenant. Si se omite, se resuelve desde sesión o demo. */
  organization_id?: string | null;
  /** UUID del manager (profiles.id = auth.users.id). Si se omite, se usa el usuario autenticado. */
  manager_id?: string | null;
};

function normalizeManagerId(value: unknown): string | null {
  return normalizeOrganizationId(value);
}

export async function insertGroup(input: CreateGroupInput) {
  const supabase = getSupabase();

  const name = input.name.trim();
  const ageBand = input.age_band.trim();

  if (!name || !ageBand) {
    return {
      data: null,
      error: {
        message: "El nombre y la franja de edad son obligatorios.",
        details: "",
        hint: "",
        code: "VALIDATION",
      },
    };
  }

  const tenantId = await resolveTenantIdForInsert(supabase);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  let organizationId =
    normalizeOrganizationId(input.organization_id) ??
    DEMO_DASHBOARD_ORGANIZATION_ID;

  if (session?.user) {
    try {
      if (input.organization_id) {
        await ensureOrganizationExists(organizationId);
      } else {
        organizationId = await resolveOrganizationIdForInsert(
          DEMO_DASHBOARD_ORGANIZATION_ID,
        );
      }
    } catch (error) {
      console.error("[insertGroup] No se pudo resolver organization_id:", error);
      organizationId =
        normalizeOrganizationId(input.organization_id) ??
        DEMO_DASHBOARD_ORGANIZATION_ID;
    }
  }

  const managerId =
    normalizeManagerId(input.manager_id) ??
    (session?.user?.id ? normalizeManagerId(session.user.id) : null);

  const payload = {
    name,
    age_band: ageBand,
    organization_id: organizationId,
    manager_id: managerId,
    tenant_id: tenantId,
  };

  console.log("[BACKEND MULTI-TENANT] Insertando grupo con tenant:", {
    organization_id: organizationId,
    manager_id: managerId,
  });

  console.log("[insertGroup] Insertando en groups:", payload);

  const { data, error } = await supabase
    .from("groups")
    .insert(payload)
    .select(GROUP_COLUMNS)
    .single();

  if (!error && data) {
    console.log("[insertGroup] Equipo creado correctamente:", data);
    return { data, error: null };
  }

  if (error) {
    console.error("[insertGroup] Supabase insert en groups falló:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      payload,
    });
  } else {
    console.warn(
      "[insertGroup] Insert sin fila devuelta — posible bloqueo RLS, probando /api/groups.",
      payload,
    );
  }

  const fallback = await insertGroupViaDevApi(payload);

  if (fallback.data) {
    console.log("[insertGroup] Equipo creado vía API (service_role):", fallback.data);
    return { data: fallback.data, error: null };
  }

  return {
    data: null,
    error: normalizeInsertError(fallback.error ?? error),
  };
}
