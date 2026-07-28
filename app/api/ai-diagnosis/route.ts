import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  type TeamDiagnosisPromptInput,
  type TeamFragmentationMetric,
  type TeamInfluenceLeader,
  type TeamIsolatedParticipant,
  type TeamTopInfluencer,
} from "@/lib/services/aiDiagnosis";
import type {
  NetworkDensity,
} from "@/lib/mathEngine";

export const dynamic = "force-dynamic";

const OPENAI_MODEL = "gpt-4o-mini";

/** Diagnóstico ejecutivo estructurado (contrato JSON para la UI). */
export type ExecutiveDiagnosisReport = {
  resumen_ejecutivo: string;
  puntos_fuertes: string[];
  riesgos_detectados: string[];
  recomendaciones_accionables: string[];
};

const HR_SYSTEM_PROMPT = `Eres un Consultor Senior de HR especializado en People Analytics, Organizational Network Analysis (ONA) y clima laboral corporativo.

Tu audiencia son directivos de RR.HH. y líderes de negocio. Debes analizar:
- Densidad de la red (cohesión relacional)
- Reciprocidad (confianza mutua)
- Nodos aislados (riesgo de desconexión / silos humanos)
- Nodos puente / betweenness (conectores informales críticos)

Responde ÚNICAMENTE con un JSON válido en español, sin markdown ni texto adicional, con esta estructura exacta:
{
  "resumen_ejecutivo": "string (1 párrafo, máximo 120 palabras)",
  "puntos_fuertes": ["string", "..."],
  "riesgos_detectados": ["string", "..."],
  "recomendaciones_accionables": ["string", "..."]
}`;

type AiDiagnosisSuccessResponse = {
  success: true;
  groupId?: string;
  report: ExecutiveDiagnosisReport;
  /** Markdown derivado del JSON para compatibilidad con render legacy. */
  diagnosis: string;
  usedFallback: boolean;
  model: string | null;
};

type AiDiagnosisErrorResponse = {
  success: false;
  error: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseNetworkDensity(value: unknown): NetworkDensity | null {
  // Permite density como porcentaje plano (mathEngine.calculateNetworkMetrics).
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    const densityPercent = Math.min(100, value);
    return {
      nodeCount: 0,
      linkCount: 0,
      maxPossibleLinks: 0,
      density: densityPercent / 100,
      densityPercent,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  const nodeCount = Number(value.nodeCount ?? 0);
  const linkCount = Number(value.linkCount ?? 0);
  const maxPossibleLinks = Number(value.maxPossibleLinks ?? 0);
  const density = Number(
    value.density ??
      (Number.isFinite(Number(value.densityPercent))
        ? Number(value.densityPercent) / 100
        : NaN),
  );
  const densityPercent = Number(
    value.densityPercent ??
      (Number.isFinite(density) ? density * 100 : NaN),
  );

  if (
    !Number.isFinite(nodeCount) ||
    !Number.isFinite(linkCount) ||
    !Number.isFinite(maxPossibleLinks) ||
    !Number.isFinite(density) ||
    !Number.isFinite(densityPercent)
  ) {
    return null;
  }

  return {
    nodeCount,
    linkCount,
    maxPossibleLinks,
    density,
    densityPercent,
  };
}

function parseLeaders(value: unknown): TeamInfluenceLeader[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const leaders: TeamInfluenceLeader[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return null;
    }

    const id = typeof item.id === "string" ? item.id.trim() : String(item.id ?? "");
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const nominationsReceived = Number(
      item.nominationsReceived ?? item.votes ?? item.inDegree,
    );

    if (!id || !name || !Number.isFinite(nominationsReceived)) {
      return null;
    }

    leaders.push({
      id,
      name,
      nominationsReceived,
    });
  }

  return leaders;
}

function parseFragmentation(value: unknown): TeamFragmentationMetric | null {
  if (!isRecord(value)) {
    return null;
  }

  const index = Number(value.index ?? value.fragmentationIndex);

  if (!Number.isFinite(index)) {
    return null;
  }

  const siloCountRaw = value.siloCount ?? value.silosCount;
  const siloCount =
    siloCountRaw === undefined ? undefined : Number(siloCountRaw);

  if (
    siloCount !== undefined &&
    (!Number.isInteger(siloCount) || siloCount < 0)
  ) {
    return null;
  }

  return {
    index: Math.min(1, Math.max(0, index)),
    ...(siloCount !== undefined ? { siloCount } : {}),
  };
}

function parseIsolatedParticipants(
  value: unknown,
): TeamIsolatedParticipant[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const isolated: TeamIsolatedParticipant[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const id =
      typeof item.id === "string" ? item.id.trim() : String(item.id ?? "");
    const name = typeof item.name === "string" ? item.name.trim() : "";

    if (!id || !name) {
      continue;
    }

    isolated.push({ id, name });
  }

  return isolated;
}

function parseTopInfluencers(value: unknown): TeamTopInfluencer[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const influencers: TeamTopInfluencer[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const id =
      typeof item.id === "string" ? item.id.trim() : String(item.id ?? "");
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const inDegree = Number(item.inDegree ?? item.votes ?? item.nominationsReceived);

    if (!id || !name || !Number.isFinite(inDegree)) {
      continue;
    }

    influencers.push({ id, name, inDegree });
  }

  return influencers;
}

/**
 * Valida campos básicos del payload tipado `toAiDiagnosisMetricsPayload`.
 * No exige betweenness/degreeCentrality (pueden venir vacíos en redes pequeñas).
 */
function validateAiDiagnosisMetricsPayload(
  body: Record<string, unknown>,
): { ok: true } | { ok: false; error: string } {
  if (body.density === undefined || body.density === null) {
    return { ok: false, error: "Falta `density` (número 0–100)." };
  }

  if (
    typeof body.density !== "number" &&
    !isRecord(body.density) &&
    Number.isNaN(Number(body.density))
  ) {
    return { ok: false, error: "`density` debe ser un número o un objeto NetworkDensity." };
  }

  if (
    body.reciprocityRate !== undefined &&
    !Number.isFinite(Number(body.reciprocityRate))
  ) {
    return { ok: false, error: "`reciprocityRate` debe ser un número finito." };
  }

  if (
    body.isolatedParticipants !== undefined &&
    !Array.isArray(body.isolatedParticipants)
  ) {
    return { ok: false, error: "`isolatedParticipants` debe ser un array." };
  }

  if (
    body.topInfluencers !== undefined &&
    !Array.isArray(body.topInfluencers)
  ) {
    return { ok: false, error: "`topInfluencers` debe ser un array." };
  }

  if (
    body.rosterSize !== undefined &&
    !Number.isFinite(Number(body.rosterSize))
  ) {
    return { ok: false, error: "`rosterSize` debe ser un número finito." };
  }

  return { ok: true };
}

/**
 * Acepta el payload de `toAiDiagnosisMetricsPayload` y el contrato legacy
 * `{ density, leaders, fragmentation }`.
 */
function parseAiDiagnosisRequestBody(
  body: unknown,
): TeamDiagnosisPromptInput | null {
  if (!isRecord(body)) {
    return null;
  }

  const validation = validateAiDiagnosisMetricsPayload(body);
  if (!validation.ok) {
    return null;
  }

  const parsedDensity = parseNetworkDensity(body.density);
  if (!parsedDensity) {
    return null;
  }

  const density: NetworkDensity = { ...parsedDensity };

  const topInfluencers = parseTopInfluencers(body.topInfluencers);
  const isolatedParticipants = parseIsolatedParticipants(
    body.isolatedParticipants,
  );

  const leadersFromTop =
    topInfluencers?.map((influencer) => ({
      id: influencer.id,
      name: influencer.name,
      nominationsReceived: influencer.inDegree,
    })) ?? null;

  const leaders = parseLeaders(body.leaders) ?? leadersFromTop ?? [];

  const reciprocityRateRaw = Number(body.reciprocityRate);
  const reciprocityRate = Number.isFinite(reciprocityRateRaw)
    ? Math.min(100, Math.max(0, reciprocityRateRaw))
    : undefined;

  // Fragmentación legacy opcional; si falta, se estima desde aislados / roster.
  const fragmentation =
    parseFragmentation(body.fragmentation) ??
    ({
      index:
        density.nodeCount > 0 && isolatedParticipants
          ? Math.min(
              1,
              isolatedParticipants.length / Math.max(density.nodeCount, 1),
            )
          : isolatedParticipants && isolatedParticipants.length > 0
            ? Math.min(1, isolatedParticipants.length * 0.15)
            : 0,
      siloCount: undefined,
    } satisfies TeamFragmentationMetric);

  const teamName =
    typeof body.teamName === "string" && body.teamName.trim().length > 0
      ? body.teamName.trim()
      : undefined;

  // Enriquecer nodeCount si el cliente envió rosterSize.
  const rosterSize = Number(body.rosterSize ?? body.nodeCount);
  if (
    Number.isFinite(rosterSize) &&
    rosterSize > 0 &&
    density.nodeCount === 0
  ) {
    density.nodeCount = Math.floor(rosterSize);
    density.maxPossibleLinks =
      density.nodeCount > 1
        ? density.nodeCount * (density.nodeCount - 1)
        : 0;
  }

  return {
    density,
    leaders,
    fragmentation,
    ...(teamName ? { teamName } : {}),
    ...(reciprocityRate !== undefined ? { reciprocityRate } : {}),
    ...(isolatedParticipants ? { isolatedParticipants } : {}),
    ...(topInfluencers ? { topInfluencers } : {}),
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function parseExecutiveDiagnosisReport(raw: string): ExecutiveDiagnosisReport {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OpenAI devolvió JSON inválido.");
  }

  if (!isRecord(parsed)) {
    throw new Error("OpenAI devolvió un objeto JSON inválido.");
  }

  const resumen_ejecutivo =
    typeof parsed.resumen_ejecutivo === "string"
      ? parsed.resumen_ejecutivo.trim()
      : "";

  if (!resumen_ejecutivo) {
    throw new Error("OpenAI devolvió un informe sin resumen_ejecutivo.");
  }

  return {
    resumen_ejecutivo,
    puntos_fuertes: parseStringArray(parsed.puntos_fuertes),
    riesgos_detectados: parseStringArray(parsed.riesgos_detectados),
    recomendaciones_accionables: parseStringArray(
      parsed.recomendaciones_accionables,
    ),
  };
}

function formatExecutiveReportToMarkdown(
  report: ExecutiveDiagnosisReport,
): string {
  const list = (title: string, items: string[]) =>
    items.length > 0
      ? `## ${title}\n${items.map((item) => `- ${item}`).join("\n")}`
      : `## ${title}\n- Sin hallazgos destacados en esta categoría.`;

  return [
    "## Resumen ejecutivo",
    report.resumen_ejecutivo,
    list("Puntos fuertes", report.puntos_fuertes),
    list("Riesgos detectados", report.riesgos_detectados),
    list("Recomendaciones accionables", report.recomendaciones_accionables),
  ].join("\n\n");
}

function buildMetricsContextForOpenAI(
  payload: TeamDiagnosisPromptInput,
  body: Record<string, unknown>,
): string {
  const betweennessLeaders = Array.isArray(body.betweennessLeaders)
    ? body.betweennessLeaders
    : [];

  return JSON.stringify(
    {
      groupId:
        typeof body.groupId === "string" ? body.groupId.trim() : undefined,
      teamName: payload.teamName ?? undefined,
      metrics: {
        densityPercent: payload.density.densityPercent,
        reciprocityRate: payload.reciprocityRate ?? 0,
        rosterSize: Number(body.rosterSize ?? payload.density.nodeCount ?? 0),
        isolatedParticipants: payload.isolatedParticipants ?? [],
        topInfluencers: payload.topInfluencers ?? [],
        betweennessLeaders,
        fragmentationIndex: payload.fragmentation.index,
      },
    },
    null,
    2,
  );
}

function buildFallbackExecutiveReport(
  payload: TeamDiagnosisPromptInput,
  body: Record<string, unknown>,
): ExecutiveDiagnosisReport {
  const densityPercent = payload.density.densityPercent;
  const reciprocityRate = payload.reciprocityRate ?? 0;
  const isolated = payload.isolatedParticipants ?? [];
  const influencers = payload.topInfluencers ?? [];
  const bridges = Array.isArray(body.betweennessLeaders)
    ? body.betweennessLeaders
    : [];

  const bridgeNames = bridges
    .slice(0, 3)
    .map((item) =>
      isRecord(item) && typeof item.name === "string" ? item.name : null,
    )
    .filter(Boolean) as string[];

  return {
    resumen_ejecutivo: `El equipo presenta una densidad del ${densityPercent.toFixed(1)}% y una reciprocidad del ${reciprocityRate.toFixed(1)}%. Este informe de prueba resume la lectura relacional del grupo para apoyar decisiones de clima laboral y ONA.`,
    puntos_fuertes: [
      reciprocityRate >= 40
        ? "La reciprocidad sugiere vínculos bidireccionales activos en parte de la red."
        : "Existen referentes informales identificables que pueden anclar iniciativas de equipo.",
      influencers.length > 0
        ? `Referentes de influencia detectados: ${influencers
            .slice(0, 3)
            .map((person) => person.name)
            .join(", ")}.`
        : "La red conserva margen para reforzar conectores informales.",
    ],
    riesgos_detectados: [
      isolated.length > 0
        ? `${isolated.length} colaborador(es) aislado(s): ${isolated
            .slice(0, 4)
            .map((person) => person.name)
            .join(", ")}.`
        : "No se detectaron aislados severos en esta muestra.",
      densityPercent < 35
        ? "Densidad baja: riesgo de fragmentación y silos informales."
        : "Monitorizar cohesión si crece la rotación o el trabajo remoto.",
    ],
    recomendaciones_accionables: [
      bridgeNames.length > 0
        ? `Involucrar a nodos puente (${bridgeNames.join(", ")}) en rituales de alineación cross-funcional.`
        : "Identificar y empoderar conectores informales en talleres de colaboración.",
      isolated.length > 0
        ? "Diseñar onboarding relacional y buddy system para perfiles aislados."
        : "Mantener pulse checks trimestrales de clima y red.",
      "Revisar este diagnóstico con el comité de People Analytics antes de acciones estructurales.",
    ],
  };
}

async function generateExecutiveDiagnosisWithOpenAI(
  metricsContext: string,
): Promise<ExecutiveDiagnosisReport> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY no configurada. Añádela en .env.local y reinicia el servidor.",
    );
  }

  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.4,
    max_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: HR_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analiza estas métricas ONA del equipo y genera el diagnóstico ejecutivo en JSON:\n${metricsContext}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();

  if (!raw) {
    throw new Error("OpenAI devolvió una respuesta vacía.");
  }

  return parseExecutiveDiagnosisReport(raw);
}

function resolveOpenAiErrorMessage(error: unknown): string {
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

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Cuerpo JSON inválido.",
      } satisfies AiDiagnosisErrorResponse,
      { status: 400 },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Cuerpo inválido. Se espera el payload de toAiDiagnosisMetricsPayload (density, reciprocityRate, …).",
      } satisfies AiDiagnosisErrorResponse,
      { status: 400 },
    );
  }

  const basicValidation = validateAiDiagnosisMetricsPayload(body);
  if (!basicValidation.ok) {
    return NextResponse.json(
      {
        success: false,
        error: basicValidation.error,
      } satisfies AiDiagnosisErrorResponse,
      { status: 400 },
    );
  }

  const payload = parseAiDiagnosisRequestBody(body);

  if (!payload) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Cuerpo inválido. Se requiere AiDiagnosisMetricsPayload: { density, reciprocityRate, isolatedParticipants, topInfluencers, rosterSize, … }.",
      } satisfies AiDiagnosisErrorResponse,
      { status: 400 },
    );
  }

  const requestGroupId =
    typeof body.groupId === "string" ? body.groupId.trim() : undefined;

  const metricsContext = buildMetricsContextForOpenAI(payload, body);

  console.log("[api/ai-diagnosis] Métricas recibidas:", {
    groupId: requestGroupId,
    density: payload.density.densityPercent,
    reciprocityRate: payload.reciprocityRate,
    isolatedCount: payload.isolatedParticipants?.length ?? 0,
    betweennessCount: Array.isArray(body.betweennessLeaders)
      ? body.betweennessLeaders.length
      : 0,
  });

  try {
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());

    // Sin clave: mock/fallback estructurado para no romper la UI en tests/local.
    if (!hasOpenAiKey) {
      const report = buildFallbackExecutiveReport(payload, body);
      const diagnosis = formatExecutiveReportToMarkdown(report);

      console.warn(
        "[api/ai-diagnosis] OPENAI_API_KEY ausente — devolviendo informe de prueba.",
        { groupId: requestGroupId },
      );

      return NextResponse.json({
        success: true,
        report,
        diagnosis,
        usedFallback: true,
        model: null,
        ...(requestGroupId ? { groupId: requestGroupId } : {}),
      } satisfies AiDiagnosisSuccessResponse);
    }

    try {
      const report = await generateExecutiveDiagnosisWithOpenAI(metricsContext);
      const diagnosis = formatExecutiveReportToMarkdown(report);

      return NextResponse.json({
        success: true,
        report,
        diagnosis,
        usedFallback: false,
        model: OPENAI_MODEL,
        ...(requestGroupId ? { groupId: requestGroupId } : {}),
      } satisfies AiDiagnosisSuccessResponse);
    } catch (openAiError) {
      console.error("[api/ai-diagnosis] OpenAI error:", openAiError, {
        groupId: requestGroupId,
      });

      const report = buildFallbackExecutiveReport(payload, body);
      const diagnosis = `${formatExecutiveReportToMarkdown(report)}\n\n> *Nota: se usó informe de prueba tras error de OpenAI (${resolveOpenAiErrorMessage(openAiError)}).*`;

      return NextResponse.json({
        success: true,
        report,
        diagnosis,
        usedFallback: true,
        model: null,
        ...(requestGroupId ? { groupId: requestGroupId } : {}),
      } satisfies AiDiagnosisSuccessResponse);
    }
  } catch (error) {
    console.error("[api/ai-diagnosis]", error, { groupId: requestGroupId });

    const status =
      error instanceof OpenAI.APIError && error.status === 429 ? 429 : 500;

    return NextResponse.json(
      {
        success: false,
        error: resolveOpenAiErrorMessage(error),
      } satisfies AiDiagnosisErrorResponse,
      { status },
    );
  }
}
