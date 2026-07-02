import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildGraphLinksFromResponses,
  calculateIndegree,
  calculateNetworkDensity,
  calculateReciprocity,
  detectNetworkSilos,
  normalizeParticipantId,
  type NetworkDensity,
  type NetworkSilo,
} from "@/lib/mathEngine";

export const dynamic = "force-dynamic";

/** Tipos alineados con lib/mathEngine.ts para métricas enviadas desde el cliente. */
type IndegreeMap = Readonly<Record<string, number>>;

type ReciprocityMap = Readonly<Record<string, number>>;

const SYSTEM_PROMPT =
  "Eres un consultor experto en People Analytics y Organizational Network Analysis (ONA). Vas a recibir métricas de un equipo. Tu objetivo es redactar un análisis ejecutivo breve (2-3 párrafos) destacando la cohesión del equipo, posibles líderes ocultos y riesgos de silos o desconexión, usando un tono profesional y orientado a negocio.";

const INDIVIDUAL_SYSTEM_PROMPT =
  "Eres un Coach Ejecutivo y experto en People Analytics y Organizational Network Analysis (ONA). Recibirás métricas cuantitativas calculadas por el motor matemático del equipo (indegree, reciprocidad y densidad de red) junto con el contexto cualitativo del colaborador. Cruza las respuestas cualitativas de texto con las métricas cuantitativas de ONA provistas. Si el Indegree es alto, analízalo como líder informal. Si la reciprocidad es baja, evalúa posibles brechas de comunicación en su entorno. Genera un diagnóstico ejecutivo y accionable para RR.HH. Redacta exactamente 2 párrafos de fortalezas informales y añade 2 recomendaciones accionables numeradas para el manager.";

type ParticipantRef = {
  id: string;
  name: string;
};

type TeamInsightsRequest = {
  mode: "group";
  groupName?: string;
  indegree: IndegreeMap;
  reciprocity: ReciprocityMap;
  density: NetworkDensity;
  silos: NetworkSilo[];
  participants?: ParticipantRef[];
};

type IndividualInsightsRequest = {
  mode: "individual";
  groupName?: string;
  participantId?: string;
  participantName: string;
  participantIndegree: number;
  participantReciprocity: number;
  participantSilo: string;
  networkDensityPercent: number;
  participants?: ParticipantRef[];
  responses?: SurveyResponseRef[];
  participantAnswers?: unknown;
};

type SurveyResponseRef = {
  participant_id: string | null;
  answers: unknown;
};

type InsightsRequest = TeamInsightsRequest | IndividualInsightsRequest;

type TeamInsightsResponse = {
  insight: string | null;
  fallback?: boolean;
};

const DEFAULT_INDIVIDUAL_SILO =
  "Sin silo aislado (integrado en la red general del equipo)";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeParseNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function safeParseString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseNumericRecord(value: unknown): Record<string, number> | null {
  if (!isRecord(value)) {
    return null;
  }

  const result: Record<string, number> = {};

  for (const [key, raw] of Object.entries(value)) {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    result[key] = numeric;
  }

  return result;
}

function parseNetworkDensity(value: unknown): NetworkDensity | null {
  if (!isRecord(value)) {
    return null;
  }

  const nodeCount = Number(value.nodeCount);
  const linkCount = Number(value.linkCount);
  const maxPossibleLinks = Number(value.maxPossibleLinks);
  const density = Number(value.density);
  const densityPercent = Number(value.densityPercent);

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

function parseSilos(value: unknown): NetworkSilo[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const silos: NetworkSilo[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const id = typeof item.id === "string" ? item.id.trim() : "";
    const size = Number(item.size);

    if (!id || !Number.isFinite(size)) {
      continue;
    }

    const memberIds = Array.isArray(item.memberIds)
      ? item.memberIds
          .filter((memberId): memberId is string => typeof memberId === "string")
          .map((memberId) => memberId.trim())
          .filter(Boolean)
      : [];

    const memberNames = Array.isArray(item.memberNames)
      ? item.memberNames
          .filter((name): name is string => typeof name === "string")
          .map((name) => name.trim())
          .filter(Boolean)
      : [];

    silos.push({ id, memberIds, memberNames, size });
  }

  return silos;
}

function parseParticipants(value: unknown): ParticipantRef[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const participants: ParticipantRef[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";

    if (id && name) {
      participants.push({ id, name });
    }
  }

  return participants.length > 0 ? participants : undefined;
}

function resolveInsightsMode(body: Record<string, unknown>): "individual" | "group" {
  if (body.mode === "individual") {
    return "individual";
  }

  if (body.mode === "group") {
    return "group";
  }

  const hasIndividualFields =
    safeParseString(body.participantName).length > 0 &&
    (body.participantIndegree !== undefined ||
      body.participantReciprocity !== undefined ||
      body.participantSilo !== undefined);

  const hasGroupFields =
    body.indegree !== undefined ||
    body.reciprocity !== undefined ||
    body.density !== undefined;

  if (hasIndividualFields && !hasGroupFields) {
    return "individual";
  }

  return "group";
}

function parseTeamInsightsRequest(
  body: Record<string, unknown>,
): TeamInsightsRequest | null {
  const indegree = parseNumericRecord(body.indegree);
  const reciprocity = parseNumericRecord(body.reciprocity);
  const density = parseNetworkDensity(body.density);

  if (!indegree || !reciprocity || !density) {
    return null;
  }

  const groupName = safeParseString(body.groupName);

  return {
    mode: "group",
    groupName: groupName.length > 0 ? groupName : undefined,
    indegree,
    reciprocity,
    density,
    silos: parseSilos(body.silos),
    participants: parseParticipants(body.participants),
  };
}

function parseSurveyResponses(value: unknown): SurveyResponseRef[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const responses: SurveyResponseRef[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }

    const participantId =
      item.participant_id === null || item.participant_id === undefined
        ? null
        : String(item.participant_id).trim() || null;

    responses.push({
      participant_id: participantId,
      answers: item.answers,
    });
  }

  return responses.length > 0 ? responses : undefined;
}

function resolveParticipantSiloLabel(
  participantId: string,
  silos: NetworkSilo[],
): string {
  const normalizedId = normalizeParticipantId(participantId);
  const silo = silos.find((candidate) =>
    candidate.memberIds.some(
      (memberId) => normalizeParticipantId(memberId) === normalizedId,
    ),
  );

  if (!silo) {
    return DEFAULT_INDIVIDUAL_SILO;
  }

  return `Silo ${silo.id.toUpperCase()} (${silo.size} miembros)`;
}

function enrichIndividualMetricsFromMathEngine(
  payload: IndividualInsightsRequest,
): IndividualInsightsRequest {
  if (
    !payload.participantId ||
    !payload.participants?.length ||
    !payload.responses?.length
  ) {
    return payload;
  }

  const links = buildGraphLinksFromResponses(
    payload.participants,
    payload.responses,
  );
  const indegree = calculateIndegree(links);
  const reciprocity = calculateReciprocity(links);
  const density = calculateNetworkDensity(payload.participants.length, links);
  const silos = detectNetworkSilos(payload.participants, links);
  const normalizedParticipantId = normalizeParticipantId(payload.participantId);

  const participantResponse = payload.responses.find(
    (response) =>
      response.participant_id !== null &&
      normalizeParticipantId(String(response.participant_id)) ===
        normalizedParticipantId,
  );

  return {
    ...payload,
    participantIndegree:
      indegree[normalizedParticipantId] ?? payload.participantIndegree,
    participantReciprocity:
      reciprocity[normalizedParticipantId] ?? payload.participantReciprocity,
    networkDensityPercent: density.densityPercent,
    participantSilo: resolveParticipantSiloLabel(normalizedParticipantId, silos),
    participantAnswers:
      participantResponse?.answers ?? payload.participantAnswers,
  };
}

function formatParticipantQualitativeContext(
  answers: unknown,
  nameById: Map<string, string>,
): string {
  if (!isRecord(answers)) {
    return "Sin respuestas cualitativas registradas para este colaborador.";
  }

  const lines: string[] = [];

  if (Array.isArray(answers.influencia)) {
    const names = answers.influencia
      .map((value) => nameById.get(String(value)) ?? String(value))
      .filter(Boolean);
    lines.push(
      `Nominaciones de influencia (respuesta propia): ${
        names.length > 0 ? names.join(", ") : "ninguna"
      }`,
    );
  }

  if (Array.isArray(answers.comunicacion)) {
    const names = answers.comunicacion
      .map((value) => nameById.get(String(value)) ?? String(value))
      .filter(Boolean);
    lines.push(
      `Nominaciones de comunicación frecuente (respuesta propia): ${
        names.length > 0 ? names.join(", ") : "ninguna"
      }`,
    );
  }

  if (lines.length === 0) {
    return "Sin nominaciones ONA registradas en la respuesta del colaborador.";
  }

  return lines.join("\n");
}

function parseIndividualInsightsRequest(
  body: Record<string, unknown>,
): IndividualInsightsRequest | null {
  const participantName = safeParseString(body.participantName);

  if (!participantName) {
    return null;
  }

  const participantId = safeParseString(body.participantId);
  const participantIndegree = safeParseNumber(body.participantIndegree, 0);
  const participantReciprocity = safeParseNumber(body.participantReciprocity, 0);
  const participantSilo =
    safeParseString(body.participantSilo) || DEFAULT_INDIVIDUAL_SILO;
  const groupName = safeParseString(body.groupName);

  const densityFromBody = parseNetworkDensity(body.density);
  const networkDensityPercent =
    densityFromBody?.densityPercent ??
    safeParseNumber(body.networkDensityPercent, 0);

  return {
    mode: "individual",
    groupName: groupName.length > 0 ? groupName : undefined,
    participantId: participantId.length > 0 ? participantId : undefined,
    participantName,
    participantIndegree,
    participantReciprocity,
    participantSilo,
    networkDensityPercent,
    participants: parseParticipants(body.participants),
    responses: parseSurveyResponses(body.responses),
    participantAnswers: body.participantAnswers,
  };
}

function parseInsightsRequest(body: unknown): InsightsRequest | null {
  if (!isRecord(body)) {
    return null;
  }

  const mode = resolveInsightsMode(body);

  if (mode === "individual") {
    return parseIndividualInsightsRequest(body);
  }

  return parseTeamInsightsRequest(body);
}

function buildNameById(participants: ParticipantRef[] | undefined): Map<string, string> {
  const nameById = new Map<string, string>();

  if (!participants) {
    return nameById;
  }

  for (const participant of participants) {
    nameById.set(participant.id, participant.name);
  }

  return nameById;
}

function resolveDisplayName(id: string, nameById: Map<string, string>): string {
  return nameById.get(id) ?? id;
}

function formatRankedMetrics(
  label: string,
  metrics: IndegreeMap | ReciprocityMap,
  nameById: Map<string, string>,
): string {
  const entries = Object.entries(metrics).sort(([, a], [, b]) => b - a);

  if (entries.length === 0) {
    return `${label}: sin datos.`;
  }

  return entries
    .map(
      ([id, value], index) =>
        `${index + 1}. ${resolveDisplayName(id, nameById)} — ${value}`,
    )
    .join("\n");
}

function formatSilos(silos: NetworkSilo[]): string {
  if (silos.length === 0) {
    return "No se detectaron silos significativos (subgrupos aislados ≥ 2 miembros).";
  }

  return silos
    .map(
      (silo, index) =>
        `${index + 1}. ${silo.id} (${silo.size} miembros): ${
          silo.memberNames.length > 0
            ? silo.memberNames.join(", ")
            : silo.memberIds.join(", ")
        }`,
    )
    .join("\n");
}

function buildGroupUserPrompt(payload: TeamInsightsRequest): string {
  const nameById = buildNameById(payload.participants);
  const teamLabel = payload.groupName ?? "Equipo sin nombre";

  return `Analiza las siguientes métricas ONA del equipo "${teamLabel}" y redacta un informe ejecutivo en prosa (2-3 párrafos, sin listas ni JSON).

DENSIDAD DE RED (mathEngine):
- Nodos (N): ${payload.density.nodeCount}
- Enlaces dirigidos (L): ${payload.density.linkCount}
- Enlaces posibles N×(N−1): ${payload.density.maxPossibleLinks}
- Densidad (ratio): ${payload.density.density.toFixed(4)}
- Densidad (%): ${payload.density.densityPercent}%

INDEGREE — votos / conexiones entrantes por colaborador:
${formatRankedMetrics("Indegree", payload.indegree, nameById)}

RECIPROCIDAD — conexiones mutuas por colaborador:
${formatRankedMetrics("Reciprocidad", payload.reciprocity, nameById)}

SILOS DETECTADOS:
${formatSilos(payload.silos)}

Instrucciones de salida:
- Responde únicamente con el texto del análisis ejecutivo en español.
- Destaca cohesión, líderes informales potenciales y riesgos de silos o desconexión.
- Tono profesional, orientado a negocio, máximo 3 párrafos.`;
}

function buildIndividualUserPrompt(payload: IndividualInsightsRequest): string {
  const teamLabel = payload.groupName ?? "Equipo sin nombre";
  const nameById = buildNameById(payload.participants);
  const networkDensity = Math.round(payload.networkDensityPercent * 10) / 10;

  return `Colaborador: ${payload.participantName}
Equipo: ${teamLabel}
Silo de pertenencia: ${payload.participantSilo}

--- METRICAS MATEMÁTICAS ONA DEL COLABORADOR ---

Votos entrantes (Indegree): ${payload.participantIndegree}

Conexiones mutuas (Reciprocidad): ${payload.participantReciprocity}

Densidad global del equipo: ${networkDensity}%

--- CONTEXTO CUALITATIVO DEL COLABORADOR ---
${formatParticipantQualitativeContext(payload.participantAnswers, nameById)}

Instrucciones de análisis:
- Cruza las respuestas cualitativas de texto con las métricas cuantitativas de ONA provistas.
- Si el Indegree es alto, analízalo como líder informal.
- Si la reciprocidad es baja, evalúa posibles brechas de comunicación en su entorno.
- Genera un diagnóstico ejecutivo y accionable para RR.HH.

Instrucciones de salida:
- Responde únicamente con el diagnóstico en español.
- Exactamente 2 párrafos de fortalezas informales basados en el cruce cualitativo-cuantitativo.
- Incluye 2 recomendaciones accionables numeradas para el manager al final.
- Tono de coach ejecutivo, profesional y orientado a la acción.`;
}

function buildOpenAiMessages(
  payload: InsightsRequest,
): Array<{ role: "system" | "user"; content: string }> {
  if (payload.mode === "individual") {
    return [
      { role: "system", content: INDIVIDUAL_SYSTEM_PROMPT },
      { role: "user", content: buildIndividualUserPrompt(payload) },
    ];
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildGroupUserPrompt(payload) },
  ];
}

async function generateInsight(payload: InsightsRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY no configurada.");
  }

  const openai = new OpenAI({ apiKey });
  const isIndividual = payload.mode === "individual";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: isIndividual ? 700 : 900,
    messages: buildOpenAiMessages(payload),
  });

  const insight = completion.choices[0]?.message?.content?.trim();

  if (!insight) {
    throw new Error("OpenAI devolvió una respuesta vacía.");
  }

  return insight;
}

export async function POST(request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch (parseError) {
      console.error("Error en API de Insights:", parseError);
      return NextResponse.json(
        { error: "El cuerpo de la petición no es un JSON válido." },
        { status: 400 },
      );
    }

    const payload = parseInsightsRequest(body);

    if (!payload) {
      return NextResponse.json(
        {
          error:
            "Cuerpo inválido. Modo group: { mode: 'group', indegree, reciprocity, density, silos? }. Modo individual: { mode: 'individual', participantName, participantId?, participantIndegree?, participantReciprocity?, participantSilo?, density?, participants?, responses? }.",
        },
        { status: 400 },
      );
    }

    const resolvedPayload =
      payload.mode === "individual"
        ? enrichIndividualMetricsFromMathEngine(payload)
        : payload;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          insight: null,
          error: "OPENAI_API_KEY no configurada.",
          fallback: true,
        } satisfies TeamInsightsResponse & { error: string },
        { status: 503 },
      );
    }

    const insight = await generateInsight(resolvedPayload);

    return NextResponse.json({ insight } satisfies TeamInsightsResponse);
  } catch (error) {
    console.error("Error en API de Insights:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al generar el análisis.";

    return NextResponse.json(
      {
        insight: null,
        error: message,
        fallback: true,
      } satisfies TeamInsightsResponse & { error: string },
      { status: 500 },
    );
  }
}
