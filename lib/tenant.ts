/**
 * Tenant por defecto en desarrollo local (UUID).
 * Override con NEXT_PUBLIC_DEFAULT_ORGANIZATION_ID en .env.local.
 */
export function getDefaultOrganizationId(): string {
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_ORGANIZATION_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  return "00000000-0000-0000-0000-000000000001";
}

/**
 * Filtro PostgREST para listar equipos del tenant activo más registros
 * legacy del MVP con organization_id NULL.
 */
export function groupsTenantOrFilter(): string {
  const organizationId = getDefaultOrganizationId();
  return `organization_id.eq.${organizationId},organization_id.is.null`;
}
