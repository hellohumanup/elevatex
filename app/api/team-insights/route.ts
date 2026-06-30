import OpenAI from "openai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Tipos alineados con lib/mathEngine.ts (definidos aquí para evitar acoplamiento en el bundle del API route). */
type IndegreeMap = Readonly<Record<string, number>>;

type ReciprocityMap = Readonly<Record<string, number>>;

type NetworkDensity = {
  nodeCount: number;
  linkCount: number;
  maxPossibleLinks: number;
  density: number;
  densityPercent: number;
};

type NetworkSilo = {
  id: string;
  memberIds: string[];
  memberNames: string[];
  size: number;
};

const SYSTEM_PROMPT =
  "Eres un consultor experto en People Analytics y Organizational Network Analysis (ONA). Vas a recibir métricas de un equipo. Tu objetivo es redactar un análisis ejecutivo breve (2-3 párrafos) destacando la cohesión del equipo, posibles líderes ocultos y riesgos de silos o desconexión, usando un tono profesional y orientado a negocio.";

const INDIVIDUAL_SYSTEM_PROMPT =
  "Eres un Coach Ejecutivo y experto en People Analytics. Analiza el perfil de este colaborador basándote en sus métricas ONA individuales que te pasará el usuario (nominaciones de liderazgo/indegree, conexiones mutuas/reciprocity y silo al que pertenece). Redacta un diagnóstico individual potente de exactamente 2 párrafos enfocado en sus fortalezas informales y añade 2 recomendaciones accionables y directas para que el manager sepa cómo gestionarlo y potenciarlo.";

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
  participantName: string;
  participantIndegree: number;
  participantReciprocity: number;
  participantSilo: string;
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

function parseIndividualInsightsRequest(
  body: Record<string, unknown>,
): IndividualInsightsRequest | null {
  const participantName = safeParseString(body.participantName);

  if (!participantName) {
    return null;
  }

  const participantIndegree = safeParseNumber(body.participantIndegree, 0);
  const participantReciprocity = safeParseNumber(body.participantReciprocity, 0);
  const participantSilo =
    safeParseString(body.participantSilo) || DEFAULT_INDIVIDUAL_SILO;

  const groupName = safeParseString(body.groupName);

  return {
    mode: "individual",
    groupName: groupName.length > 0 ? groupName : undefined,
    participantName,
    participantIndegree,
    participantReciprocity,
    participantSilo,
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

  return `Colaborador: ${payload.participantName}
Equipo: ${teamLabel}

Métricas ONA individuales:
- Nominaciones de liderazgo recibidas (indegree): ${payload.participantIndegree}
- Conexiones mutuas (reciprocity): ${payload.participantReciprocity}
- Silo de pertenencia: ${payload.participantSilo}

Instrucciones de salida:
- Responde únicamente con el diagnóstico en español.
- Exactamente 2 párrafos de fortalezas informales.
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
            "Cuerpo inválido. Modo group: { mode: 'group', indegree, reciprocity, density, silos? }. Modo individual: { mode: 'individual', participantName, participantIndegree?, participantReciprocity?, participantSilo? }.",
        },
        { status: 400 },
      );
    }

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

    const insight = await generateInsight(payload);

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
