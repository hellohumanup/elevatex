/**
 * Tenant por defecto en desarrollo local (sin auth todavía).
 * Override con NEXT_PUBLIC_DEFAULT_ORGANIZATION_ID en .env.local.
 */
export function getDefaultOrganizationId(): number {
  const raw = process.env.NEXT_PUBLIC_DEFAULT_ORGANIZATION_ID;
  const parsed = raw ? Number(raw) : 1;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/**
 * Filtro PostgREST para listar equipos del tenant activo más registros
 * legacy del MVP con organization_id NULL.
 */
export function groupsTenantOrFilter(): string {
  const organizationId = getDefaultOrganizationId();
  return `organization_id.eq.${organizationId},organization_id.is.null`;
}
