import { normalizeOrganizationId } from "@/lib/organizations";
import { getSupabase } from "@/lib/supabase";
import type { ManagerRecord } from "@/lib/supabase/database.types";

export type { ManagerRecord } from "@/lib/supabase/database.types";

/**
 * Normaliza un UUID de `managers.id`.
 * No acepta `auth.users.id` implícitamente: manager_id ≠ user_id.
 */
export function normalizeManagerId(value: unknown): string | null {
  return normalizeOrganizationId(value);
}

/**
 * Busca el manager de negocio asociado al usuario Auth en una organización.
 * Devuelve null si aún no hay fila en `managers` (caso habitual en tests locales).
 */
export async function fetchManagerByUserAndOrganization(
  userId: string,
  organizationId: string,
): Promise<ManagerRecord | null> {
  const normalizedUserId = normalizeManagerId(userId);
  const normalizedOrgId = normalizeOrganizationId(organizationId);

  if (!normalizedUserId || !normalizedOrgId) {
    return null;
  }

  const { data, error } = await getSupabase()
    .from("managers")
    .select("id, user_id, organization_id, name, email")
    .eq("user_id", normalizedUserId)
    .eq("organization_id", normalizedOrgId)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(
      "[managers] No se pudo resolver managers por user/org:",
      error.message,
    );
    return null;
  }

  return data;
}

/**
 * Resuelve `manager_id` opcional para inserts de groups.
 * - Si el caller pasa un UUID válido → se usa.
 * - Si no → null (retrocompatibilidad local, sin forzar FK a managers).
 */
export function resolveOptionalManagerId(
  managerId: unknown,
): string | null {
  return normalizeManagerId(managerId);
}
