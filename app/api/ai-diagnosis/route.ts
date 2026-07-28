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
import type { NetworkDensity } from "@/lib/mathEngine";

export const dynamic = "force-dynamic";

const OPENAI_MODEL = "gpt-4o-mini";
const USER_PROMPT =
  "Redacta el diagnóstico ejecutivo de este equipo en Markdown, con tono de Consultor Senior de HR.";

type AiDiagnosisSuccessResponse = {
  success: true;
  diagnosis: string;
  systemPrompt: string;
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
 * Acepta el payload nuevo del motor matemático y el contrato legacy
 * `{ density, leaders, fragmentation }`.
 */
function parseAiDiagnosisRequestBody(
  body: unknown,
): TeamDiagnosisPromptInput | null {
  if (!isRecord(body)) {
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

  const payload = parseAiDiagnosisRequestBody(body);

  if (!payload) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Cuerpo inválido. Se requiere { density, reciprocityRate?, isolatedParticipants?, topInfluencers?, teamName? } (o el contrato legacy density/leaders/fragmentation).",
      } satisfies AiDiagnosisErrorResponse,
      { status: 400 },
    );
  }

  try {
    const systemPrompt = await generateTeamDiagnosisPrompt(payload);
    const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY?.trim());

    // Sin clave: fallback estructurado para no romper la UI en tests/local.
    if (!hasOpenAiKey) {
      const diagnosis = buildFallbackTeamDiagnosisMarkdown(payload);

      console.warn(
        "[api/ai-diagnosis] OPENAI_API_KEY ausente — devolviendo informe fallback.",
      );

      return NextResponse.json({
        success: true,
        diagnosis,
        systemPrompt,
        usedFallback: true,
        model: null,
      } satisfies AiDiagnosisSuccessResponse);
    }

    const diagnosis = await generateDiagnosisWithOpenAI(systemPrompt);

    return NextResponse.json({
      success: true,
      diagnosis,
      systemPrompt,
      usedFallback: false,
      model: OPENAI_MODEL,
    } satisfies AiDiagnosisSuccessResponse);
  } catch (error) {
    console.error("[api/ai-diagnosis]", error);

    // Si OpenAI falla, aún así intentar no tumbar la UI con un fallback.
    try {
      const systemPrompt = await generateTeamDiagnosisPrompt(payload);
      const diagnosis = buildFallbackTeamDiagnosisMarkdown(payload);

      return NextResponse.json({
        success: true,
        diagnosis: `${diagnosis}\n\n> *Nota: se usó fallback tras error de OpenAI (${resolveOpenAiErrorMessage(error)}).*`,
        systemPrompt,
        usedFallback: true,
        model: null,
      } satisfies AiDiagnosisSuccessResponse);
    } catch {
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
}
