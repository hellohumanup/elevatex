import {
  FALLBACK_ORGANIZATION_NAME,
  LOCAL_DEV_ORGANIZATION_ID,
  normalizeOrganizationId,
} from "@/lib/organizations";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type EnsureOrganizationInput = {
  id?: string | null;
  name?: string | null;
};

type EnsureOrganizationResult =
  | { id: string; error: null }
  | { id: null; error: string };

/**
 * Asegura que exista una fila en organizations usando service_role (bypass RLS).
 * Solo para rutas API / entorno servidor.
 */
export async function ensureOrganizationWithServiceRole(
  input: EnsureOrganizationInput = {},
): Promise<EnsureOrganizationResult> {
  const admin = createSupabaseServiceRoleClient();

  if (!admin) {
    return {
      id: null,
      error:
        "SUPABASE_SERVICE_ROLE_KEY no configurada. Añade la clave en .env.local.",
    };
  }

  const explicitId = normalizeOrganizationId(input.id);
  const name =
    typeof input.name === "string" && input.name.trim().length > 0
      ? input.name.trim()
      : FALLBACK_ORGANIZATION_NAME;

  if (explicitId) {
    const { data: existing, error: lookupError } = await admin
      .from("organizations")
      .select("id")
      .eq("id", explicitId)
      .maybeSingle();

    if (lookupError) {
      return { id: null, error: lookupError.message };
    }

    if (existing?.id) {
      return { id: String(existing.id), error: null };
    }

    const { data: created, error: insertError } = await admin
      .from("organizations")
      .insert({ id: explicitId, name })
      .select("id")
      .single();

    if (insertError) {
      return { id: null, error: insertError.message };
    }

    const createdId = normalizeOrganizationId(created?.id);
    if (!createdId) {
      return {
        id: null,
        error: "No se pudo confirmar la organización creada.",
      };
    }

    return { id: createdId, error: null };
  }

  const { data: firstOrganization, error: firstOrgError } = await admin
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstOrgError) {
    return { id: null, error: firstOrgError.message };
  }

  const firstId = normalizeOrganizationId(firstOrganization?.id);
  if (firstId) {
    return { id: firstId, error: null };
  }

  const { data: created, error: createError } = await admin
    .from("organizations")
    .insert({ name })
    .select("id")
    .single();

  if (!createError) {
    const createdId = normalizeOrganizationId(created?.id);
    if (createdId) {
      return { id: createdId, error: null };
    }
  }

  const localDevResult = await ensureOrganizationWithServiceRole({
    id: LOCAL_DEV_ORGANIZATION_ID,
    name: FALLBACK_ORGANIZATION_NAME,
  });

  if (localDevResult.error) {
    return {
      id: null,
      error: createError?.message ?? localDevResult.error,
    };
  }

  return localDevResult;
}
