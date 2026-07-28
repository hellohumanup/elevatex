import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildFallbackTeamDiagnosisMarkdown,
  generateTeamDiagnosisPrompt,
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
const USER_PROMPT =
  "Redacta el diagnóstico ejecutivo de este equipo en Markdown, con tono de Consultor Senior de HR.";

/** Análisis estructurado que consume la vista de resultados. */
type AiDiagnosisAnalysis = {
  diagnosis: string;
  summary: string;
  metrics: {
    density: number;
    reciprocityRate: number;
    rosterSize: number;
    isolatedCount: number;
    topInfluencerCount: number;
    betweennessLeaderCount: number;
  };
};

type AiDiagnosisSuccessResponse = {
  success: true;
  diagnosis: string;
  analysis: AiDiagnosisAnalysis;
  systemPrompt: string;
  usedFallback: boolean;
  model: string | null;
  groupId?: string;
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

function buildAnalysisEnvelope(
  diagnosis: string,
  payload: TeamDiagnosisPromptInput,
  body: Record<string, unknown>,
): AiDiagnosisAnalysis {
  const densityPercent = payload.density.densityPercent;
  const reciprocityRate = payload.reciprocityRate ?? 0;
  const rosterSize = Number(
    body.rosterSize ?? payload.density.nodeCount ?? 0,
  );
  const isolatedCount = payload.isolatedParticipants?.length ?? 0;
  const topInfluencerCount = payload.topInfluencers?.length ?? 0;
  const betweennessLeaderCount = Array.isArray(body.betweennessLeaders)
    ? body.betweennessLeaders.length
    : 0;

  const summary = [
    `Densidad ${densityPercent.toFixed(1)}%`,
    `reciprocidad ${reciprocityRate.toFixed(1)}%`,
    `${isolatedCount} aislado(s)`,
    `${topInfluencerCount} influencer(s)`,
  ].join(" · ");

  return {
    diagnosis,
    summary,
    metrics: {
      density: densityPercent,
      reciprocityRate,
      rosterSize: Number.isFinite(rosterSize) ? Math.max(0, Math.floor(rosterSize)) : 0,
      isolatedCount,
      topInfluencerCount,
      betweennessLeaderCount,
    },
  };
}

async function generateDiagnosisWithOpenAI(systemPrompt: string): Promise<string> {
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
    max_tokens: 1100,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: USER_PROMPT },
    ],
  });

  const diagnosis = completion.choices[0]?.message?.content?.trim();

  if (!diagnosis) {
    throw new Error("OpenAI devolvió una respuesta vacía.");
  }

  return diagnosis;
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

  try {
    const systemPrompt = await generateTeamDiagnosisPrompt(payload);
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());

    // Sin clave: mock/fallback estructurado para no romper la UI en tests/local.
    if (!hasOpenAiKey) {
      const diagnosis = buildFallbackTeamDiagnosisMarkdown(payload);
      const analysis = buildAnalysisEnvelope(diagnosis, payload, body);

      console.warn(
        "[api/ai-diagnosis] OPENAI_API_KEY ausente — devolviendo informe de prueba.",
        { groupId: requestGroupId },
      );

      return NextResponse.json({
        success: true,
        diagnosis,
        analysis,
        systemPrompt,
        usedFallback: true,
        model: null,
        ...(requestGroupId ? { groupId: requestGroupId } : {}),
      } satisfies AiDiagnosisSuccessResponse);
    }

    try {
      const diagnosis = await generateDiagnosisWithOpenAI(systemPrompt);
      const analysis = buildAnalysisEnvelope(diagnosis, payload, body);

      return NextResponse.json({
        success: true,
        diagnosis,
        analysis,
        systemPrompt,
        usedFallback: false,
        model: OPENAI_MODEL,
        ...(requestGroupId ? { groupId: requestGroupId } : {}),
      } satisfies AiDiagnosisSuccessResponse);
    } catch (openAiError) {
      console.error("[api/ai-diagnosis] OpenAI error:", openAiError, {
        groupId: requestGroupId,
      });

      const diagnosis = `${buildFallbackTeamDiagnosisMarkdown(payload)}\n\n> *Nota: se usó informe de prueba tras error de OpenAI (${resolveOpenAiErrorMessage(openAiError)}).*`;
      const analysis = buildAnalysisEnvelope(diagnosis, payload, body);

      return NextResponse.json({
        success: true,
        diagnosis,
        analysis,
        systemPrompt,
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
