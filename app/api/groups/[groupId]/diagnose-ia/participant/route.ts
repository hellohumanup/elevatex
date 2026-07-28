import OpenAI from "openai";
import { NextResponse } from "next/server";
import { toSupabaseGroupId } from "@/lib/groupId";
import {
  FALLBACK_TEST_TENANT_ID,
  resolveDevActiveTenantId,
} from "@/lib/groups";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveProfileTenantId } from "@/lib/tenantProfile";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const IS_LOCAL_DEV = process.env.NODE_ENV === "development";

/** Tenant canónico local (cbd62767-1644-477c-a496-e26090532585). */
const DEV_ACTIVE_TENANT_ID = resolveDevActiveTenantId();

const TENANT_FORBIDDEN_MESSAGE =
  "Acceso denegado: este grupo pertenece a otra organización";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `Eres un psicólogo organizacional experto en People Analytics de ElevateX. Analiza la métrica ONA del colaborador en la dimensión dada (Información, Confianza o Innovación) y genera un diagnóstico muy breve y directo estructurado en formato JSON con dos campos:

'bondades': (1 o 2 frases sobre sus fortalezas de conexión, ej: si es muy buscado o tiene alta reciprocidad).

'retos': (1 o 2 frases sobre riesgos o áreas de mejora, ej: si está aislado, sobrecargado como cuello de botella o sin reciprocidad).
Mantén un tono profesional, constructivo y enfocado a desarrollo de talento.

REGLAS:
- Responde ÚNICAMENTE con JSON válido (sin markdown ni texto extra).
- Idioma: español.
- No inventes métricas distintas a las recibidas.
- Sé concreto y accionable para managers de talento.`;

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

type GroupTenantRow = {
  id: string | number;
  name: string | null;
  organization_id: string | null;
  tenant_id: string | null;
};

type ParticipantMetricsInput = {
  indegree: number;
  weightedIndegree: number;
  reciprocity: number;
};

type ParticipantDiagnoseBody = {
  participantName: string;
  metrics: ParticipantMetricsInput;
  dimension: string;
};

type BondadesRetosDiagnosis = {
  bondades: string;
  retos: string;
};

type SuccessResponse = {
  success: true;
  groupId: string;
  groupName: string | null;
  tenantId: string;
  participantName: string;
  dimension: string;
  dimensionLabel: string;
  model: string;
  usedFallback: boolean;
  bondades: string;
  retos: string;
};

type ErrorResponse = {
  success: false;
  error: string;
  details?: string;
};

const DIMENSION_LABELS: Record<string, string> = {
  informacion: "Información",
  confianza: "Confianza",
  innovacion: "Innovación",
  information: "Información",
  trust: "Confianza",
  innovation: "Innovación",
  influencia: "Influencia",
  comunicacion: "Comunicación",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function resolveOpenAiModel(): string {
  return (
    process.env.OPENAI_DIAGNOSE_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_OPENAI_MODEL
  );
}

function normalizeDimensionSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "");
}

function resolveDimensionLabel(dimension: string): string {
  const slug = normalizeDimensionSlug(dimension);
  return DIMENSION_LABELS[slug] ?? (dimension.trim() || "ONA");
}

/**
 * Reciprocidad puede llegar como % (0–100) o ratio (0–1).
 * Normalizamos a porcentaje 0–100 para el prompt y el mock.
 */
function normalizeReciprocityPercent(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  if (value <= 1) {
    return Math.round(value * 10000) / 100;
  }

  return Math.round(value * 100) / 100;
}

function bandFromMetric(
  value: number,
  thresholds: { low: number; high: number },
): "low" | "mid" | "high" {
  if (value < thresholds.low) {
    return "low";
  }
  if (value >= thresholds.high) {
    return "high";
  }
  return "mid";
}

async function resolveActiveTenantId(): Promise<
  | { ok: true; tenantId: string; source: "env" | "dev-fallback" | "session" }
  | { ok: false; status: number; error: string }
> {
  if (IS_LOCAL_DEV) {
    const tenantId = resolveDevActiveTenantId();
    console.warn(
      "[api/diagnose-ia/participant] Tenant activo (dev):",
      tenantId,
      tenantId === FALLBACK_TEST_TENANT_ID ? "(canónico)" : "",
    );
    return {
      ok: true,
      tenantId,
      source:
        process.env.ACTIVE_TENANT_ID?.trim() === FALLBACK_TEST_TENANT_ID
          ? "env"
          : "dev-fallback",
    };
  }

  try {
    const authClient = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return {
        ok: false,
        status: 401,
        error: "Sesión no válida. Inicia sesión para acceder a este recurso.",
      };
    }

    const { tenantId, error: tenantError } = await resolveProfileTenantId(
      authClient,
      user.id,
    );

    if (!tenantId) {
      return {
        ok: false,
        status: 403,
        error:
          tenantError ??
          "Tu usuario no tiene un tenant asignado. Contacta con soporte.",
      };
    }

    return { ok: true, tenantId, source: "session" };
  } catch (error) {
    console.error(
      "[api/diagnose-ia/participant] Error resolviendo tenant de sesión:",
      error,
    );
    return {
      ok: false,
      status: 401,
      error: "No se pudo validar la sesión del usuario.",
    };
  }
}

async function assertGroupTenantAccess(
  supabase: SupabaseClient,
  supabaseGroupId: string | number,
  routeGroupId: string,
  activeTenantId: string,
): Promise<
  | {
      ok: true;
      tenantId: string;
      organizationId: string | null;
      groupName: string | null;
    }
  | { ok: false; status: number; error: string; details?: string }
> {
  console.log(
    "[api/diagnose-ia/participant] 🔐 Gate multi-tenant — comprobando tenant_id…",
    { routeGroupId, supabaseGroupId, activeTenantId },
  );

  const { data, error } = await supabase
    .from("groups")
    .select("id, name, organization_id, tenant_id")
    .eq("id", supabaseGroupId)
    .maybeSingle<GroupTenantRow>();

  if (error) {
    console.error(
      "[api/diagnose-ia/participant] Error en gate multi-tenant:",
      error.message,
    );
    return {
      ok: false,
      status: 400,
      error: "Datos insuficientes o error de base de datos",
      details: error.message,
    };
  }

  if (!data) {
    return {
      ok: false,
      status: 404,
      error: `No se encontró el equipo con id ${routeGroupId}.`,
    };
  }

  const rawTenantId =
    typeof data.tenant_id === "string" && data.tenant_id.trim().length > 0
      ? data.tenant_id.trim()
      : null;

  const effectiveGroupTenantId =
    rawTenantId ?? (IS_LOCAL_DEV ? DEV_ACTIVE_TENANT_ID : null);

  if (!effectiveGroupTenantId) {
    return {
      ok: false,
      status: 403,
      error: TENANT_FORBIDDEN_MESSAGE,
      details: "El equipo no tiene tenant_id asignado.",
    };
  }

  if (effectiveGroupTenantId !== activeTenantId) {
    console.warn("[api/diagnose-ia/participant] ⛔ Tenant mismatch — 403", {
      routeGroupId,
      groupTenantId: effectiveGroupTenantId,
      activeTenantId,
    });
    return {
      ok: false,
      status: 403,
      error: TENANT_FORBIDDEN_MESSAGE,
      details: `tenant_id del grupo (${effectiveGroupTenantId}) ≠ activeTenantId (${activeTenantId}).`,
    };
  }

  console.log("[api/diagnose-ia/participant] ✓ Gate multi-tenant OK", {
    routeGroupId,
    tenantId: effectiveGroupTenantId,
  });

  return {
    ok: true,
    tenantId: effectiveGroupTenantId,
    organizationId: data.organization_id,
    groupName:
      typeof data.name === "string" && data.name.trim().length > 0
        ? data.name.trim()
        : null,
  };
}

function parseRequestBody(body: unknown): ParticipantDiagnoseBody | null {
  if (!isRecord(body)) {
    return null;
  }

  const participantName =
    typeof body.participantName === "string"
      ? body.participantName.trim()
      : typeof body.name === "string"
        ? body.name.trim()
        : "";

  const dimension =
    typeof body.dimension === "string" ? body.dimension.trim() : "";

  const metricsRaw = isRecord(body.metrics) ? body.metrics : null;

  if (!participantName || !dimension || !metricsRaw) {
    return null;
  }

  return {
    participantName,
    dimension,
    metrics: {
      indegree: asFiniteNumber(metricsRaw.indegree, 0),
      weightedIndegree: asFiniteNumber(
        metricsRaw.weightedIndegree ?? metricsRaw.weightedVotes,
        0,
      ),
      reciprocity: asFiniteNumber(
        metricsRaw.reciprocity ?? metricsRaw.reciprocityPercent,
        0,
      ),
    },
  };
}

function buildUserPrompt(
  groupName: string,
  payload: ParticipantDiagnoseBody,
  dimensionLabel: string,
): string {
  const reciprocityPercent = normalizeReciprocityPercent(
    payload.metrics.reciprocity,
  );

  return `Equipo: ${groupName}
Colaborador: ${payload.participantName}
Dimensión ONA de la campaña: ${dimensionLabel} (${payload.dimension})

Métricas individuales:
- Indegree (votos/nominaciones recibidas): ${payload.metrics.indegree}
- Weighted Indegree (influencia ponderada 1.0/0.7/0.4): ${payload.metrics.weightedIndegree}
- Reciprocidad: ${reciprocityPercent}%

Devuelve solo JSON: {"bondades":"...","retos":"..."}`;
}

/**
 * Mock local realista según bandas altas / medias / bajas.
 */
function buildFallbackBondadesRetos(
  payload: ParticipantDiagnoseBody,
  dimensionLabel: string,
): BondadesRetosDiagnosis {
  const { participantName, metrics } = payload;
  const reciprocityPercent = normalizeReciprocityPercent(metrics.reciprocity);
  const indegreeBand = bandFromMetric(metrics.indegree, { low: 1, high: 4 });
  const weightedBand = bandFromMetric(metrics.weightedIndegree, {
    low: 1.2,
    high: 3.5,
  });
  const reciprocityBand = bandFromMetric(reciprocityPercent, {
    low: 25,
    high: 60,
  });

  const soughtAfter =
    indegreeBand === "high" || weightedBand === "high";
  const peripheral =
    indegreeBand === "low" && weightedBand === "low";
  const mutualTrust = reciprocityBand === "high";
  const oneWay = reciprocityBand === "low";

  let bondades: string;
  let retos: string;

  if (soughtAfter && mutualTrust) {
    bondades = `${participantName} es un referente claro en ${dimensionLabel}: concentra nominaciones de calidad y mantiene reciprocidad alta, lo que refuerza vínculos de confianza sostenibles.`;
    retos = `Su centralidad puede convertirlo en cuello de botella. Conviene distribuir parte de las demandas de ${dimensionLabel} hacia otros nodos para proteger su capacidad y desarrollar al resto del equipo.`;
  } else if (soughtAfter && oneWay) {
    bondades = `${participantName} es muy buscado en ${dimensionLabel} (indegree ${metrics.indegree}, influencia ponderada ${metrics.weightedIndegree}), señal de expertise o acceso crítico para el equipo.`;
    retos = `La reciprocidad baja (${reciprocityPercent}%) indica relaciones mayormente unidireccionales. El riesgo es saturación y dependencia: hay que activar intercambio mutuo y mentoria cruzada.`;
  } else if (peripheral && mutualTrust) {
    bondades = `${participantName} muestra reciprocidad sólida (${reciprocityPercent}%) en ${dimensionLabel}: cuando conecta, genera confianza auténtica y calidad relacional.`;
    retos = `Su baja visibilidad en la red (indegree ${metrics.indegree}) limita el impacto. Un plan de exposición selectiva en foros de ${dimensionLabel} potenciaría su talento sin forzarlo a popularidad artificial.`;
  } else if (peripheral) {
    bondades = `${participantName} puede aportar perspectivas frescas en ${dimensionLabel} precisamente por no estar atrapado en los mismos circuitos de influencia del equipo.`;
    retos = `El aislamiento relativo (pocas nominaciones recibidas y reciprocidad ${reciprocityPercent}%) es un riesgo de desconexión. Prioriza un puente con un conector informal y un ritual breve de integración.`;
  } else if (mutualTrust) {
    bondades = `${participantName} equilibra presencia en la red de ${dimensionLabel} con reciprocidad saludable: es un perfil de colaboración confiable y sostenible.`;
    retos = `Para crecer como talento clave, puede asumir un rol de puente entre subgrupos, elevando su weighted indegree sin perder la calidad bidireccional de sus vínculos.`;
  } else {
    bondades = `${participantName} mantiene una posición intermedia en ${dimensionLabel} (indegree ${metrics.indegree}, influencia ${metrics.weightedIndegree}): hay base para consolidar un rol de conector.`;
    retos = `La reciprocidad moderada/baja (${reciprocityPercent}%) sugiere que parte de sus vínculos aún no se corresponden. Enfoca 1:1 de desarrollo para convertir nominaciones en alianzas mutuas.`;
  }

  return { bondades, retos };
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        const parsed = JSON.parse(fenced[1].trim()) as unknown;
        return isRecord(parsed) ? parsed : null;
      } catch {
        // continue
      }
    }

    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
        return isRecord(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }

    return null;
  }
}

function parseBondadesRetosPayload(
  raw: string,
): BondadesRetosDiagnosis | null {
  const json = extractJsonObject(raw);
  if (!json) {
    return null;
  }

  const bondades =
    typeof json.bondades === "string" ? json.bondades.trim() : "";
  const retos = typeof json.retos === "string" ? json.retos.trim() : "";

  if (!bondades || !retos) {
    return null;
  }

  return { bondades, retos };
}

async function generateWithOpenAI(
  userPrompt: string,
): Promise<{ diagnosis: BondadesRetosDiagnosis; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = resolveOpenAiModel();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.4,
    max_tokens: 450,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const content = completion.choices[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("OpenAI devolvió una respuesta vacía.");
  }

  const diagnosis = parseBondadesRetosPayload(content);

  if (!diagnosis) {
    throw new Error("OpenAI no devolvió JSON con bondades/retos válidos.");
  }

  return { diagnosis, model };
}

export async function POST(request: Request, context: RouteContext) {
  const { groupId: rawGroupId } = await context.params;
  const groupId = rawGroupId?.trim();

  if (!groupId) {
    return NextResponse.json(
      {
        success: false,
        error: "groupId es obligatorio en la ruta.",
      } satisfies ErrorResponse,
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY no configurada. Añádela en .env.local y reinicia el servidor.",
      } satisfies ErrorResponse,
      { status: 503 },
    );
  }

  const supabaseGroupId = toSupabaseGroupId(groupId);

  const activeTenantResult = await resolveActiveTenantId();
  if (!activeTenantResult.ok) {
    return NextResponse.json(
      {
        success: false,
        error: activeTenantResult.error,
      } satisfies ErrorResponse,
      { status: activeTenantResult.status },
    );
  }

  const tenantGate = await assertGroupTenantAccess(
    supabase,
    supabaseGroupId,
    groupId,
    activeTenantResult.tenantId,
  );

  if (!tenantGate.ok) {
    return NextResponse.json(
      {
        success: false,
        error: tenantGate.error,
        ...(tenantGate.details ? { details: tenantGate.details } : {}),
      } satisfies ErrorResponse,
      { status: tenantGate.status },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Cuerpo JSON inválido.",
      } satisfies ErrorResponse,
      { status: 400 },
    );
  }

  const payload = parseRequestBody(body);

  if (!payload) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Cuerpo inválido. Se espera { participantName, metrics: { indegree, weightedIndegree, reciprocity }, dimension }.",
      } satisfies ErrorResponse,
      { status: 400 },
    );
  }

  const groupName = tenantGate.groupName ?? `Equipo ${groupId}`;
  const dimensionLabel = resolveDimensionLabel(payload.dimension);
  const userPrompt = buildUserPrompt(groupName, payload, dimensionLabel);
  const model = resolveOpenAiModel();

  const buildSuccess = (
    diagnosis: BondadesRetosDiagnosis,
    usedFallback: boolean,
    resolvedModel: string,
  ): SuccessResponse => ({
    success: true,
    groupId,
    groupName: tenantGate.groupName,
    tenantId: tenantGate.tenantId,
    participantName: payload.participantName,
    dimension: payload.dimension,
    dimensionLabel,
    model: resolvedModel,
    usedFallback,
    bondades: diagnosis.bondades,
    retos: diagnosis.retos,
  });

  try {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      console.warn(
        `[api/diagnose-ia/participant] OPENAI_API_KEY ausente — mock local para ${payload.participantName}.`,
      );

      return NextResponse.json(
        buildSuccess(
          buildFallbackBondadesRetos(payload, dimensionLabel),
          true,
          "fallback-local",
        ),
      );
    }

    const { diagnosis, model: usedModel } = await generateWithOpenAI(userPrompt);

    return NextResponse.json(buildSuccess(diagnosis, false, usedModel));
  } catch (error) {
    console.error(
      "[api/diagnose-ia/participant] Error generando diagnóstico:",
      error,
    );

    if (
      error instanceof Error &&
      error.message === "OPENAI_API_KEY_MISSING"
    ) {
      return NextResponse.json(
        buildSuccess(
          buildFallbackBondadesRetos(payload, dimensionLabel),
          true,
          "fallback-local",
        ),
      );
    }

    // Fallback defensivo: no tumbar la ficha si OpenAI falla.
    if (IS_LOCAL_DEV) {
      console.warn(
        "[api/diagnose-ia/participant] Fallback local tras error OpenAI:",
        error instanceof Error ? error.message : error,
      );
      return NextResponse.json(
        buildSuccess(
          buildFallbackBondadesRetos(payload, dimensionLabel),
          true,
          model,
        ),
      );
    }

    const message =
      error instanceof OpenAI.APIError
        ? error.status === 401
          ? "La clave OPENAI_API_KEY no es válida o ha expirado."
          : error.status === 429
            ? "OpenAI ha limitado la petición (cuota o rate limit)."
            : error.message || "Error en la API de OpenAI."
        : error instanceof Error
          ? error.message
          : "No se pudo generar el diagnóstico individual.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      } satisfies ErrorResponse,
      { status: 502 },
    );
  }
}
