function decodeRouteSegment(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

/**
 * Normaliza el ID de equipo desde useParams() / params de Next.js.
 */
export function parseRouteGroupId(
  params: Readonly<{ id?: string | string[] }>,
): string {
  const raw = params.id;
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("No se encontró el ID del equipo en la URL.");
  }

  return decodeRouteSegment(value);
}

/**
 * Resuelve el segmento dinámico `id` de la ruta para consultas Supabase (bigint).
 * Devuelve `paramsReady: false` mientras useParams() aún no expone el id.
 */
export function resolveRouteGroupId(
  params: Readonly<{ id?: string | string[] }>,
): {
  routeGroupId: string;
  numericGroupId: number | null;
  paramsReady: boolean;
} {
  const raw = params.id;

  if (raw === undefined) {
    return { routeGroupId: "", numericGroupId: null, paramsReady: false };
  }

  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== "string" || !value.trim()) {
    return { routeGroupId: "", numericGroupId: null, paramsReady: true };
  }

  const routeGroupId = decodeRouteSegment(value);

  return {
    routeGroupId,
    numericGroupId: toNumericSupabaseGroupId(routeGroupId),
    paramsReady: true,
  };
}

/** bigint en PostgREST: solo acepta enteros positivos válidos. */
export function toNumericSupabaseGroupId(groupId: string): number | null {
  const converted = toSupabaseGroupId(groupId);

  if (typeof converted === "number" && Number.isFinite(converted) && converted > 0) {
    return converted;
  }

  return null;
}

/**
 * Convierte el ID de ruta al tipo que espera PostgREST/Supabase.
 * IDs numéricos (int8) se envían como number; UUIDs permanecen como string.
 */
export function toSupabaseGroupId(groupId: string): string | number {
  const trimmed = groupId.trim();

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}

export function toSupabaseOrganizationId(
  organizationId: number | string | null | undefined,
): string | null {
  if (organizationId === null || organizationId === undefined) {
    return null;
  }

  if (typeof organizationId === "string") {
    const trimmed = organizationId.trim();
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trimmed,
      )
    ) {
      return trimmed;
    }

    if (/^\d+$/.test(trimmed)) {
      return trimmed;
    }

    return null;
  }

  return Number.isFinite(organizationId) && organizationId > 0
    ? String(organizationId)
    : null;
}
