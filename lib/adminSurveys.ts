import type { SupabaseClient } from "@supabase/supabase-js";
import { createClientComponentClient } from "@/lib/supabase/auth-helpers-nextjs-shim";
import { resolveProfileTenantId } from "@/lib/tenantProfile";

export type ManagerSurveyRow = {
  id: string;
  title: string;
  created_at: string;
  tenant_id: string;
  responseCount: number;
};

export type ManagerSurveysLoadResult = {
  tenantId: string | null;
  surveys: ManagerSurveyRow[];
  error: string | null;
};

type SurveyRow = {
  id: string;
  title: string;
  created_at: string;
  tenant_id: string;
};

function countResponsesBySurveyId(
  rows: Array<{ survey_id: string | null }> | null,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const row of rows ?? []) {
    if (!row.survey_id) {
      continue;
    }

    const surveyId = String(row.survey_id);
    counts.set(surveyId, (counts.get(surveyId) ?? 0) + 1);
  }

  return counts;
}

function mapSurveyRows(
  rows: SurveyRow[],
  responseCounts: Map<string, number>,
): ManagerSurveyRow[] {
  return rows.map((survey) => ({
    id: String(survey.id),
    title: String(survey.title),
    created_at: String(survey.created_at),
    tenant_id: String(survey.tenant_id),
    responseCount: responseCounts.get(String(survey.id)) ?? 0,
  }));
}

export async function fetchManagerSurveys(
  supabase: SupabaseClient,
): Promise<ManagerSurveysLoadResult> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    return { tenantId: null, surveys: [], error: authError.message };
  }

  if (!user) {
    return {
      tenantId: null,
      surveys: [],
      error: "Debes iniciar sesión para acceder a las encuestas.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { tenantId: null, surveys: [], error: profileError.message };
  }

  if (!profile) {
    return {
      tenantId: null,
      surveys: [],
      error: "No se encontró tu perfil de Manager.",
    };
  }

  let tenantId = profile.tenant_id ? String(profile.tenant_id) : null;

  if (!tenantId) {
    const resolved = await resolveProfileTenantId(supabase, user.id);
    tenantId = resolved.tenantId;

    if (resolved.error || !tenantId) {
      return {
        tenantId: null,
        surveys: [],
        error: resolved.error ?? "Tu perfil de Manager no tiene un tenant asignado.",
      };
    }
  }

  const { data: surveyRows, error: surveysError } = await supabase
    .from("surveys")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (surveysError) {
    console.error("[adminSurveys] Error al leer surveys:", surveysError);
    return { tenantId, surveys: [], error: surveysError.message };
  }

  const surveys = (surveyRows ?? []) as SurveyRow[];

  if (surveys.length === 0) {
    return { tenantId, surveys: [], error: null };
  }

  const surveyIds = surveys.map((survey) => String(survey.id));

  const { data: responseRows, error: responsesError } = await supabase
    .from("responses")
    .select("survey_id")
    .in("survey_id", surveyIds);

  if (responsesError) {
    console.warn("[adminSurveys] Error al contar responses:", responsesError);
  }

  const responseCounts = countResponsesBySurveyId(responseRows);

  return {
    tenantId,
    surveys: mapSurveyRows(surveys, responseCounts),
    error: null,
  };
}

/** Carga segura con cliente del navegador (sin await en la creación del cliente). */
export async function fetchManagerSurveysFromBrowser(): Promise<ManagerSurveysLoadResult> {
  const supabase = createClientComponentClient();
  return fetchManagerSurveys(supabase);
}

export function formatSurveyCreatedAt(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

export function formatResponseCountLabel(count: number): string {
  if (count === 1) {
    return "1 Respuesta recibida";
  }

  return `${count} Respuestas recibidas`;
}

export function buildSurveyMagicLink(surveyId: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/survey/${surveyId}`;
}
