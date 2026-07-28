const FALLBACK_SUPABASE_URL = "https://vazfbsxamlkupymkcvla.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "sb_publishable_HeQedoe8BqxDZDMnR5tVLw_mFjradzZ";

/** Limpia corchetes, comillas y espacios de valores de entorno. */
function sanitizeEnvValue(value: string | undefined | null): string {
  if (typeof value !== "string") {
    return "";
  }

  let cleaned = value.trim().replace(/^['"`]+|['"`]+$/g, "");

  // Soporta formato markdown: [https://...](https://...)
  const markdownMatch = cleaned.match(/\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) {
    cleaned = markdownMatch[1];
  } else {
    cleaned = cleaned.replace(/[\[\]]/g, "");
  }

  return cleaned.trim();
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveSupabaseUrl(
  rawValue: string | undefined | null = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  const cleaned = sanitizeEnvValue(rawValue);

  if (cleaned && isValidHttpUrl(cleaned)) {
    return cleaned;
  }

  return FALLBACK_SUPABASE_URL;
}

export function resolveSupabaseAnonKey(
  rawValue: string | undefined | null = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): string {
  const cleaned = sanitizeEnvValue(rawValue);

  if (cleaned.length > 0) {
    return cleaned;
  }

  return FALLBACK_SUPABASE_ANON_KEY;
}

export function getSupabaseEnv() {
  const supabaseUrl = resolveSupabaseUrl();
  const supabaseAnonKey = resolveSupabaseAnonKey();

  return { supabaseUrl, supabaseAnonKey };
}

/** Log temporal para verificar en consola del navegador que las env vars están presentes. */
export function logSupabaseEnvDebug(source: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const env = getSupabaseEnv();

  console.log(`[Supabase] Debug env (${source})`);
  console.log("Supabase URL cargada:", Boolean(env.supabaseUrl));
  console.log("Supabase ANON KEY cargada:", Boolean(env.supabaseAnonKey));
}

export function assertSupabaseEnv() {
  return getSupabaseEnv();
}
