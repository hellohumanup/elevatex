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

/** cbd62767-1644-477c-a496-e26090532585 — ignora ACTIVE_TENANT_ID obsoleto. */
const DEV_ACTIVE_TENANT_ID = resolveDevActiveTenantId();

const TENANT_FORBIDDEN_MESSAGE =
  "Acceso denegado: este grupo pertenece a otra organización";

type RouteContext = {
  params: Promise<{ groupId: string }>;
};

type GroupTenantRow = {
  id: string | number;
  name: string | null;
  organization_id: string | null;
  tenant_id: string | null;
};

type NamedPerson = {
  id?: string;
  name: string;
  votes?: number;
  nominationsReceived?: number;
};

type NetworkSiloInput = {
  id?: string;
  memberNames?: string[];
  memberIds?: string[];
  size?: number;
};

type NetworkDensityInput = {
  nodeCount?: number;
  linkCount?: number;
  maxPossibleLinks?: number;
  density?: number;
  densityPercent?: number;
};

export type DiagnoseIaRequestBody = {
  groupName?: string;
  /** Siempre objeto: los porcentajes planos se normalizan en parseRequestBody. */
  networkDensity?: NetworkDensityInput;
  silos?: NetworkSiloInput[];
  influenceLeaders?: NamedPerson[];
  isolatedParticipants?: NamedPerson[];
};

type DiagnoseIaSuccessResponse = {
  success: true;
  groupId: string;
  groupName: string;
  tenantId: string;
  model: string;
  usedFallback: boolean;
  diagnosticoMarkdown: string;
  diagnosticoHtml: string;
};

type DiagnoseIaErrorResponse = {
  success: false;
  error: string;
  details?: string;
};

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

/**
 * Resuelve el tenant activo de la petición.
 * - Local: FALLBACK_TEST_TENANT_ID canónico (cbd62767-…-e26090532585).
 * - Producción: profiles.tenant_id del usuario autenticado.
 */
async function resolveActiveTenantId(): Promise<
  | { ok: true; tenantId: string; source: "env" | "dev-fallback" | "session" }
  | { ok: false; status: number; error: string }
> {
  if (IS_LOCAL_DEV) {
    const tenantId = resolveDevActiveTenantId();
    console.warn(
      "[api/groups/diagnose-ia] Tenant activo (dev):",
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
      "[api/groups/diagnose-ia] Error resolviendo tenant de sesión:",
      error,
    );
    return {
      ok: false,
      status: 401,
      error: "No se pudo validar la sesión del usuario.",
    };
  }
}

/**
 * Gate multi-tenant temprano: lee tenant_id del grupo con service_role
 * ANTES de invocar OpenAI.
 */
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
    "[api/groups/diagnose-ia] 🔐 Gate multi-tenant — comprobando tenant_id…",
    { routeGroupId, supabaseGroupId, activeTenantId },
  );

  const { data, error } = await supabase
    .from("groups")
    .select("id, name, organization_id, tenant_id")
    .eq("id", supabaseGroupId)
    .maybeSingle<GroupTenantRow>();

  if (error) {
    console.error(
      "[api/groups/diagnose-ia] Error en gate multi-tenant:",
      error.message,
      error.code,
    );
    return {
      ok: false,
      status: 400,
      error: "Datos insuficientes o error de base de datos",
      details: error.message,
    };
  }

  if (!data) {
    console.warn(
      "[api/groups/diagnose-ia] Grupo no encontrado (404):",
      routeGroupId,
    );
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

  // En local, grupos legacy sin tenant_id se asimilan al tenant de desarrollo.
  const effectiveGroupTenantId =
    rawTenantId ?? (IS_LOCAL_DEV ? DEV_ACTIVE_TENANT_ID : null);

  if (!effectiveGroupTenantId) {
    console.warn(
      "[api/groups/diagnose-ia] Grupo sin tenant_id — acceso denegado:",
      routeGroupId,
    );
    return {
      ok: false,
      status: 403,
      error: TENANT_FORBIDDEN_MESSAGE,
      details: "El equipo no tiene tenant_id asignado.",
    };
  }

  if (effectiveGroupTenantId !== activeTenantId) {
    console.warn(
      "[api/groups/diagnose-ia] ⛔ Tenant mismatch — 403 Forbidden",
      {
        routeGroupId,
        groupTenantId: effectiveGroupTenantId,
        activeTenantId,
        organizationId: data.organization_id,
      },
    );
    return {
      ok: false,
      status: 403,
      error: TENANT_FORBIDDEN_MESSAGE,
      details: `tenant_id del grupo (${effectiveGroupTenantId}) ≠ activeTenantId (${activeTenantId}).`,
    };
  }

  console.log("[api/groups/diagnose-ia] ✓ Gate multi-tenant OK", {
    routeGroupId,
    tenantId: effectiveGroupTenantId,
    organizationId: data.organization_id,
    tenantIdWasNull: rawTenantId === null,
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

const SYSTEM_PROMPT = `Eres un psicólogo organizacional y experto en People Analytics de ElevateX.
Analiza las métricas ONA (Organizational Network Analysis) provistas y genera un diagnóstico ejecutivo estructurado exactamente en 3 secciones:

1) Diagnóstico de Cohesión
2) Puntos de Dolor y Riesgo de Silos (mencionando nombres de líderes y aislados de forma constructiva, nunca punitiva)
3) Plan de Acción de 3 pasos

REGLAS:
- Responde SIEMPRE en español, tono ejecutivo y accionable para RR.HH. y dirección.
- No inventes personas ni métricas que no figuren en los datos.
- Usa markdown limpio con encabezados ## para las 3 secciones.
- Sé específico, breve y profesional (máximo ~450 palabras).
- Si los datos son limitados, decláralo con prudencia.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveOpenAiModel(): string {
  return (
    process.env.OPENAI_DIAGNOSE_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    DEFAULT_OPENAI_MODEL
  );
}

function asFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseNamedPeople(value: unknown): NamedPerson[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const people: NamedPerson[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const name =
      typeof item.name === "string"
        ? item.name.trim()
        : typeof item.participant_name === "string"
          ? item.participant_name.trim()
          : "";

    if (!name) {
      continue;
    }

    const votes = asFiniteNumber(
      item.votes ?? item.nominationsReceived ?? item.inDegree,
    );

    people.push({
      name,
      ...(typeof item.id === "string" || typeof item.id === "number"
        ? { id: String(item.id) }
        : {}),
      ...(votes !== null
        ? { votes, nominationsReceived: votes }
        : {}),
    });
  }

  return people;
}

function parseSilos(value: unknown): NetworkSiloInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((silo) => {
      const memberNames = Array.isArray(silo.memberNames)
        ? silo.memberNames
            .filter((name): name is string => typeof name === "string")
            .map((name) => name.trim())
            .filter(Boolean)
        : [];

      const memberIds = Array.isArray(silo.memberIds)
        ? silo.memberIds.map((id) => String(id))
        : [];

      const size =
        asFiniteNumber(silo.size) ??
        (memberNames.length > 0 ? memberNames.length : memberIds.length);

      return {
        ...(typeof silo.id === "string" ? { id: silo.id } : {}),
        memberNames,
        memberIds,
        ...(size !== null ? { size } : {}),
      };
    })
    .filter(
      (silo) =>
        (silo.memberNames?.length ?? 0) > 0 ||
        (silo.memberIds?.length ?? 0) > 0 ||
        (silo.size ?? 0) > 0,
    );
}

function parseNetworkDensity(value: unknown): NetworkDensityInput {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { densityPercent: value };
  }

  if (!isRecord(value)) {
    return {};
  }

  return {
    ...(asFiniteNumber(value.nodeCount) !== null
      ? { nodeCount: asFiniteNumber(value.nodeCount)! }
      : {}),
    ...(asFiniteNumber(value.linkCount) !== null
      ? { linkCount: asFiniteNumber(value.linkCount)! }
      : {}),
    ...(asFiniteNumber(value.maxPossibleLinks) !== null
      ? { maxPossibleLinks: asFiniteNumber(value.maxPossibleLinks)! }
      : {}),
    ...(asFiniteNumber(value.density) !== null
      ? { density: asFiniteNumber(value.density)! }
      : {}),
    ...(asFiniteNumber(value.densityPercent) !== null
      ? { densityPercent: asFiniteNumber(value.densityPercent)! }
      : {}),
  };
}

function parseRequestBody(body: unknown): DiagnoseIaRequestBody | null {
  if (!isRecord(body)) {
    return null;
  }

  return {
    groupName:
      typeof body.groupName === "string" && body.groupName.trim().length > 0
        ? body.groupName.trim()
        : typeof body.teamName === "string" && body.teamName.trim().length > 0
          ? body.teamName.trim()
          : undefined,
    networkDensity: parseNetworkDensity(
      body.networkDensity ?? body.density,
    ),
    silos: parseSilos(body.silos),
    influenceLeaders: parseNamedPeople(
      body.influenceLeaders ?? body.leaders,
    ),
    isolatedParticipants: parseNamedPeople(
      body.isolatedParticipants ?? body.isolated,
    ),
  };
}

function formatDensityLabel(density: NetworkDensityInput): string {
  const percent =
    density.densityPercent ??
    (typeof density.density === "number" ? density.density * 100 : null);

  if (percent === null) {
    return "Densidad no disponible";
  }

  const rounded = Math.round(percent * 100) / 100;
  const band =
    rounded < 10
      ? "muy baja"
      : rounded < 20
        ? "baja"
        : rounded < 35
          ? "moderada"
          : rounded < 50
            ? "alta"
            : "muy alta";

  return `${rounded}% (${band})`;
}

function buildUserPrompt(
  groupId: string,
  payload: DiagnoseIaRequestBody,
): string {
  const groupName = payload.groupName ?? `Equipo ${groupId}`;
  const density = payload.networkDensity ?? {};
  const leaders = payload.influenceLeaders ?? [];
  const isolated = payload.isolatedParticipants ?? [];
  const silos = payload.silos ?? [];

  const leadersBlock =
    leaders.length === 0
      ? "- Sin líderes de influencia identificados todavía."
      : leaders
          .map(
            (leader, index) =>
              `- #${index + 1} ${leader.name}${
                leader.votes !== undefined
                  ? ` (${leader.votes} nombramientos recibidos)`
                  : ""
              }`,
          )
          .join("\n");

  const isolatedBlock =
    isolated.length === 0
      ? "- No se detectan perfiles aislados relevantes."
      : isolated.map((person) => `- ${person.name}`).join("\n");

  const silosBlock =
    silos.length === 0
      ? "- No se detectan silos significativos."
      : silos
          .map((silo, index) => {
            const names =
              (silo.memberNames?.length ?? 0) > 0
                ? silo.memberNames!.join(", ")
                : "miembros no nominados";
            return `- Silo ${silo.id ?? index + 1}: ${names} (n=${silo.size ?? silo.memberNames?.length ?? "?"})`;
          })
          .join("\n");

  return `Analiza el siguiente equipo y genera el diagnóstico ElevateX en las 3 secciones pedidas.

Equipo: ${groupName}
groupId: ${groupId}

Densidad de red: ${formatDensityLabel(density)}
Nodos: ${density.nodeCount ?? "N/D"}
Enlaces: ${density.linkCount ?? "N/D"}
Enlaces máximos posibles: ${density.maxPossibleLinks ?? "N/D"}

Líderes de influencia:
${leadersBlock}

Participantes aislados:
${isolatedBlock}

Silos detectados:
${silosBlock}`;
}

function markdownToSimpleHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withHeadings = escaped
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>");

  const withLists = withHeadings.replace(
    /(?:^|\n)((?:- .+(?:\n|$))+)/g,
    (block) => {
      const items = block
        .trim()
        .split("\n")
        .map((line) => line.replace(/^- /, "").trim())
        .filter(Boolean)
        .map((item) => `<li>${item}</li>`)
        .join("");
      return `\n<ul>${items}</ul>\n`;
    },
  );

  const paragraphs = withLists
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      if (
        chunk.startsWith("<h2>") ||
        chunk.startsWith("<h3>") ||
        chunk.startsWith("<ul>")
      ) {
        return chunk;
      }
      return `<p>${chunk.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");

  return paragraphs;
}

function buildFallbackDiagnosis(
  groupId: string,
  payload: DiagnoseIaRequestBody,
): string {
  const groupName = payload.groupName ?? `Equipo ${groupId}`;
  const density = payload.networkDensity ?? {};
  const densityLabel = formatDensityLabel(density);
  const leaders = payload.influenceLeaders ?? [];
  const isolated = payload.isolatedParticipants ?? [];
  const silos = payload.silos ?? [];

  const topLeader = leaders[0]?.name ?? "los nodos más centrales";
  const secondLeader = leaders[1]?.name;
  const isolatedNames =
    isolated.length > 0
      ? isolated.map((person) => person.name).join(", ")
      : "ningún perfil claramente aislado";
  const siloCount = silos.length;

  const cohesionReading =
    (density.densityPercent ?? 0) < 20
      ? `La red de ${groupName} muestra una cohesión aún frágil (${densityLabel}). La colaboración real parece concentrarse en pocos canales informales, lo que eleva la dependencia de intermediarios.`
      : (density.densityPercent ?? 0) < 35
        ? `La red de ${groupName} presenta una cohesión moderada (${densityLabel}). Existen puentes funcionales, pero la circulación de información no es homogénea en todo el equipo.`
        : `La red de ${groupName} muestra una cohesión relativamente sólida (${densityLabel}). El flujo relacional es activo, aunque conviene vigilar sobrecargas en los nodos centrales.`;

  const leadersSentence = secondLeader
    ? `${topLeader} y ${secondLeader} concentran buena parte de la influencia informal.`
    : `${topLeader} concentra una porción relevante de la influencia informal.`;

  const siloSentence =
    siloCount === 0
      ? "No se observan silos estructurales evidentes en esta muestra; el riesgo principal está más en la integración de perfiles periféricos que en la fragmentación dura."
      : `Se detectan ${siloCount} subgrupo${siloCount === 1 ? "" : "s"} con acoplamiento interno fuerte. Esto puede ralentizar decisiones transversales si no se activan puentes entre clusters.`;

  return `## 1) Diagnóstico de Cohesión

${cohesionReading} ${leadersSentence} En clave de People Analytics, el equipo no carece de energía relacional: el reto es redistribuirla para que la coordinación no dependa de demasiados cuellos de botella.

## 2) Puntos de Dolor y Riesgo de Silos

${siloSentence} Conviene acompañar de forma constructiva a ${isolatedNames}: su menor centralidad no implica bajo desempeño, sino menor visibilidad en la red de ayuda y comunicación. El riesgo operativo es claro: si ${topLeader} satura o se ausenta, la velocidad de respuesta del equipo puede caer de forma desproporcionada.

## 3) Plan de Acción de 3 pasos

1. Activar un ritual bisemanal de "puentes" donde ${topLeader}${secondLeader ? ` y ${secondLeader}` : ""} faciliten una decisión transversal con al menos un perfil periférico (${isolated[0]?.name ?? "un colaborador menos conectado"}).
2. Diseñar un mapa de mentores cruzados (30 días) para elevar la reciprocidad y reducir dependencia de los mismos nodos de influencia.
3. Medir en 60-90 días la evolución de densidad y aislamiento: objetivo mínimo de +5 pp en densidad útil y reducción de perfiles con indegree 0, sin forzar popularidad artificial.

> Informe simulado ElevateX (fallback local). Activa OPENAI_API_KEY para diagnóstico generativo en vivo.`;
}

async function generateDiagnosisWithOpenAI(
  userPrompt: string,
): Promise<{ markdown: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = resolveOpenAiModel();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model,
    temperature: 0.35,
    max_tokens: 1100,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const markdown = completion.choices[0]?.message?.content?.trim();

  if (!markdown) {
    throw new Error("OpenAI devolvió una respuesta vacía.");
  }

  return { markdown, model };
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) {
      return "La clave OPENAI_API_KEY no es válida o ha expirado.";
    }
    if (error.status === 429) {
      return "OpenAI ha limitado la petición (cuota o rate limit). Inténtalo de nuevo en unos minutos.";
    }
    return error.message || "Error en la API de OpenAI.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "No se pudo generar el diagnóstico IA.";
}

export async function POST(request: Request, context: RouteContext) {
  const { groupId: rawGroupId } = await context.params;
  const groupId = rawGroupId?.trim();

  if (!groupId) {
    return NextResponse.json(
      {
        success: false,
        error: "groupId es obligatorio en la ruta.",
      } satisfies DiagnoseIaErrorResponse,
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
      } satisfies DiagnoseIaErrorResponse,
      { status: 503 },
    );
  }

  const supabaseGroupId = toSupabaseGroupId(groupId);

  // 1) Resolver tenant activo (dev simulado / sesión real)
  const activeTenantResult = await resolveActiveTenantId();
  if (!activeTenantResult.ok) {
    return NextResponse.json(
      {
        success: false,
        error: activeTenantResult.error,
      } satisfies DiagnoseIaErrorResponse,
      { status: activeTenantResult.status },
    );
  }

  // 2) Gate multi-tenant ligero ANTES de OpenAI
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
      } satisfies DiagnoseIaErrorResponse,
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
      } satisfies DiagnoseIaErrorResponse,
      { status: 400 },
    );
  }

  const payload = parseRequestBody(body);

  if (!payload) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Cuerpo inválido. Se espera { groupName?, networkDensity, silos[], influenceLeaders[], isolatedParticipants[] }.",
      } satisfies DiagnoseIaErrorResponse,
      { status: 400 },
    );
  }

  const groupName =
    payload.groupName ?? tenantGate.groupName ?? `Equipo ${groupId}`;
  const userPrompt = buildUserPrompt(groupId, {
    ...payload,
    groupName,
  });
  const configuredModel = resolveOpenAiModel();

  try {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      console.warn(
        `[api/groups/${groupId}/diagnose-ia] OPENAI_API_KEY ausente — devolviendo diagnóstico fallback realista.`,
      );

      const diagnosticoMarkdown = buildFallbackDiagnosis(groupId, {
        ...payload,
        groupName,
      });

      return NextResponse.json({
        success: true,
        groupId,
        groupName,
        tenantId: tenantGate.tenantId,
        model: "elevatex-fallback-mock",
        usedFallback: true,
        diagnosticoMarkdown,
        diagnosticoHtml: markdownToSimpleHtml(diagnosticoMarkdown),
      } satisfies DiagnoseIaSuccessResponse);
    }

    const { markdown, model } = await generateDiagnosisWithOpenAI(userPrompt);

    return NextResponse.json({
      success: true,
      groupId,
      groupName,
      tenantId: tenantGate.tenantId,
      model,
      usedFallback: false,
      diagnosticoMarkdown: markdown,
      diagnosticoHtml: markdownToSimpleHtml(markdown),
    } satisfies DiagnoseIaSuccessResponse);
  } catch (error) {
    console.error(`[api/groups/${groupId}/diagnose-ia]`, error);

    // Si falla OpenAI en local/dev, no bloquear el botón: degradar a mock.
    if (
      process.env.NODE_ENV === "development" ||
      (error instanceof Error && error.message === "OPENAI_API_KEY_MISSING")
    ) {
      const diagnosticoMarkdown = buildFallbackDiagnosis(groupId, {
        ...payload,
        groupName,
      });

      return NextResponse.json({
        success: true,
        groupId,
        groupName,
        tenantId: tenantGate.tenantId,
        model: "elevatex-fallback-mock",
        usedFallback: true,
        diagnosticoMarkdown,
        diagnosticoHtml: markdownToSimpleHtml(diagnosticoMarkdown),
      } satisfies DiagnoseIaSuccessResponse);
    }

    const status =
      error instanceof OpenAI.APIError && error.status === 429 ? 429 : 500;

    return NextResponse.json(
      {
        success: false,
        error: resolveErrorMessage(error),
        details: `model=${configuredModel}`,
      } satisfies DiagnoseIaErrorResponse,
      { status },
    );
  }
}
