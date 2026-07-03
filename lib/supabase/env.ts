export function getSupabaseEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

/** Log temporal para verificar en consola del navegador que las env vars están presentes. */
export function logSupabaseEnvDebug(source: string): void {
  if (typeof window === "undefined") {
    return;
  }

  console.log(`[Supabase] Debug env (${source})`);
  console.log("Supabase URL cargada:", !!process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log(
    "Supabase ANON KEY cargada:",
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function assertSupabaseEnv() {
  const env = getSupabaseEnv();

  if (!env) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return env;
}
