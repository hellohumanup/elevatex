import { getSupabase } from "@/lib/supabase";

const IS_LOCAL_DEV = process.env.NODE_ENV === "development";

const FALLBACK_ORGANIZATION_NAME = "Vínculo · Organización principal";

export { FALLBACK_ORGANIZATION_NAME };

/** Acepta UUIDs de prueba (p. ej. all-zero) además de UUIDs RFC estándar. */
const ORGANIZATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeOrganizationId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return ORGANIZATION_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * UUID de tenant para pruebas en localhost.
 * Override con NEXT_PUBLIC_DEFAULT_ORGANIZATION_ID en .env.local.
 */
export const LOCAL_DEV_ORGANIZATION_ID =
  process.env.NEXT_PUBLIC_DEFAULT_ORGANIZATION_ID?.trim() ||
  "00000000-0000-0000-0000-000000000001";

function isRlsPolicyError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("row-level security") ||
    normalized.includes("violates row-level security policy")
  );
}

async function ensureOrganizationViaDevApi(input: {
  id?: string;
  name?: string;
}): Promise<{ id: string | null; error: string | null }> {
  try {
    const response = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const result = (await response.json()) as {
      data?: { id?: string };
      error?: string;
    };

    if (!response.ok || result.error) {
      return {
        id: null,
        error: result.error ?? "No se pudo asegurar la organización vía API.",
      };
    }

    const id = normalizeOrganizationId(result.data?.id);
    if (!id) {
      return {
        id: null,
        error: "La API no devolvió un organization_id válido.",
      };
    }

    return { id, error: null };
  } catch (fetchError) {
    return {
      id: null,
      error:
        fetchError instanceof Error
          ? fetchError.message
          : "No se pudo contactar /api/organizations.",
    };
  }
}

export async function ensureOrganizationExists(
  organizationId: string,
  name = "Organización de prueba (local)",
): Promise<void> {
  const normalizedId = normalizeOrganizationId(organizationId);
  if (!normalizedId) {
    throw new Error("organization_id no es un UUID válido.");
  }

  const supabase = getSupabase();

  const { data: existing, error: lookupError } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", normalizedId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  if (existing?.id) {
    return;
  }

  const { error: insertError } = await supabase
    .from("organizations")
    .insert({ id: normalizedId, name });

  if (!insertError) {
    return;
  }

  if (IS_LOCAL_DEV || isRlsPolicyError(insertError.message)) {
    const fallback = await ensureOrganizationViaDevApi({
      id: normalizedId,
      name,
    });

    if (fallback.error || !fallback.id) {
      throw new Error(fallback.error ?? insertError.message);
    }

    return;
  }

  throw new Error(insertError.message);
}

/**
 * Devuelve el id de la primera organización existente o null si la tabla está vacía.
 */
export async function fetchFirstOrganizationId(): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[fetchFirstOrganizationId] Supabase error:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw new Error(error.message);
  }

  return normalizeOrganizationId(data?.id);
}

async function ensureLocalDevOrganization(): Promise<string> {
  const supabase = getSupabase();
  const localId = LOCAL_DEV_ORGANIZATION_ID;

  const { data: existing, error: lookupError } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", localId)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  const existingId = normalizeOrganizationId(existing?.id);
  if (existingId) {
    return existingId;
  }

  const { data: created, error: createError } = await supabase
    .from("organizations")
    .insert({ id: localId, name: FALLBACK_ORGANIZATION_NAME })
    .select("id")
    .single();

  if (!createError) {
    const createdId = normalizeOrganizationId(created?.id);
    if (createdId) {
      return createdId;
    }
  } else {
    console.warn(
      "[ensureLocalDevOrganization] insert con cliente anónimo falló:",
      createError.message,
    );
  }

  const fallback = await ensureOrganizationViaDevApi({
    id: localId,
    name: FALLBACK_ORGANIZATION_NAME,
  });

  if (fallback.error || !fallback.id) {
    throw new Error(
      fallback.error ??
        createError?.message ??
        "No se pudo crear la organización de prueba en localhost.",
    );
  }

  return fallback.id;
}

/**
 * Resuelve un organization_id (UUID) válido antes de insertar en groups.
 *
 * 1. preferredId si es UUID válido
 * 2. Primera fila existente en organizations
 * 3. Crear organización por defecto (UUID autogenerado)
 * 4. Tenant fijo de localhost (LOCAL_DEV_ORGANIZATION_ID) como último recurso
 */
export async function resolveOrganizationIdForInsert(
  preferredId?: string | null,
): Promise<string> {
  const preferred = normalizeOrganizationId(preferredId);
  if (preferred) {
    return preferred;
  }

  const supabase = getSupabase();

  const { data: firstOrganization, error: firstOrgError } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstOrgError) {
    console.error("[resolveOrganizationIdForInsert] lookup organizations:", {
      message: firstOrgError.message,
      code: firstOrgError.code,
      details: firstOrgError.details,
      hint: firstOrgError.hint,
    });
    throw new Error(firstOrgError.message);
  }

  const firstId = normalizeOrganizationId(firstOrganization?.id);
  if (firstId) {
    console.log(
      "[resolveOrganizationIdForInsert] Usando organization_id existente:",
      firstId,
    );
    return firstId;
  }

  console.warn(
    "[resolveOrganizationIdForInsert] Tabla organizations vacía — creando tenant por defecto.",
  );

  const { data: created, error: createError } = await supabase
    .from("organizations")
    .insert({ name: FALLBACK_ORGANIZATION_NAME })
    .select("id")
    .single();

  if (!createError) {
    const createdId = normalizeOrganizationId(created?.id);
    if (createdId) {
      console.log(
        "[resolveOrganizationIdForInsert] Organización creada con id:",
        createdId,
      );
      return createdId;
    }
  } else {
    console.warn("[resolveOrganizationIdForInsert] create organization failed:", {
      message: createError.message,
      code: createError.code,
      details: createError.details,
      hint: createError.hint,
    });
  }

  if (IS_LOCAL_DEV || isRlsPolicyError(createError?.message ?? "")) {
    const fallback = await ensureOrganizationViaDevApi({
      name: FALLBACK_ORGANIZATION_NAME,
    });

    if (fallback.id) {
      console.log(
        "[resolveOrganizationIdForInsert] Organización asegurada vía service_role:",
        fallback.id,
      );
      return fallback.id;
    }

    console.warn(
      "[resolveOrganizationIdForInsert] Fallback API falló:",
      fallback.error,
    );
  }

  console.warn(
    "[resolveOrganizationIdForInsert] Usando tenant fijo de localhost:",
    LOCAL_DEV_ORGANIZATION_ID,
  );

  return ensureLocalDevOrganization();
}
