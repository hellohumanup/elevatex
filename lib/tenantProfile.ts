import type { SupabaseClient } from "@supabase/supabase-js";

/** Tenant por defecto para desarrollo local cuando profiles.tenant_id es NULL. */
export const DEFAULT_DEV_TENANT_ID = "cbd62767-1644-477c-a496-e26ea31dc109";

export const DEFAULT_DEV_TENANT_NAME = "Local Dev Tenant";

async function ensureDefaultDevTenantExists(
  supabase: SupabaseClient,
): Promise<void> {
  const { error } = await supabase.from("tenants").upsert(
    {
      id: DEFAULT_DEV_TENANT_ID,
      name: DEFAULT_DEV_TENANT_NAME,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.warn(
      "[tenantProfile] No se pudo asegurar el tenant de desarrollo (puede existir ya):",
      error.message,
    );
  }
}

/**
 * Resuelve el tenant_id del perfil autenticado.
 * Si existe pero tenant_id es NULL, asigna el tenant de desarrollo por defecto.
 */
export async function resolveProfileTenantId(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ tenantId: string | null; error: string | null }> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return { tenantId: null, error: profileError.message };
  }

  if (!profile) {
    return {
      tenantId: null,
      error:
        "No se encontró tu perfil de usuario. Completa el registro antes de continuar.",
    };
  }

  if (profile.tenant_id) {
    return { tenantId: String(profile.tenant_id), error: null };
  }

  await ensureDefaultDevTenantExists(supabase);

  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update({
      tenant_id: DEFAULT_DEV_TENANT_ID,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("tenant_id")
    .maybeSingle();

  if (updateError) {
    console.error(
      "[tenantProfile] Error al asignar tenant_id por defecto:",
      updateError,
    );
    return {
      tenantId: null,
      error:
        "Tu perfil no tiene tenant asignado y no se pudo aplicar el tenant de desarrollo. Ejecuta la migración 009 en Supabase.",
    };
  }

  const tenantId = updatedProfile?.tenant_id
    ? String(updatedProfile.tenant_id)
    : DEFAULT_DEV_TENANT_ID;

  console.info(
    "[tenantProfile] tenant_id de desarrollo asignado al perfil:",
    userId,
    tenantId,
  );

  return { tenantId, error: null };
}

/**
 * Resuelve el tenant_id para inserts en entorno local.
 * Si no hay sesión, perfil o tenant asignado, usa DEFAULT_DEV_TENANT_ID.
 */
export async function resolveTenantIdForGroupInsert(
  supabase: SupabaseClient,
): Promise<string> {
  await ensureDefaultDevTenantExists(supabase);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.warn(
      "[tenantProfile] Sin sesión activa — usando tenant de desarrollo por defecto.",
    );
    return DEFAULT_DEV_TENANT_ID;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn(
      "[tenantProfile] Error al leer perfil — usando tenant de desarrollo:",
      profileError.message,
    );
    return DEFAULT_DEV_TENANT_ID;
  }

  if (!profile) {
    console.warn(
      "[tenantProfile] Perfil no encontrado — usando tenant de desarrollo por defecto.",
    );
    return DEFAULT_DEV_TENANT_ID;
  }

  if (profile.tenant_id) {
    return String(profile.tenant_id);
  }

  const resolved = await resolveProfileTenantId(supabase, user.id);

  if (resolved.tenantId) {
    return resolved.tenantId;
  }

  console.warn(
    "[tenantProfile] No se pudo asignar tenant al perfil — usando tenant de desarrollo por defecto.",
  );
  return DEFAULT_DEV_TENANT_ID;
}
