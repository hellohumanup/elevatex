import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  classifyEdtSemanticLevel,
  type EdtSemanticLevel,
} from "@/lib/edtMetrics";

export type AnalyzeGraphEdtMetricsPayload = {
  entornoMedia: number;
  entornoEtiqueta: EdtSemanticLevel;
  direccionMedia: number;
  direccionEtiqueta: EdtSemanticLevel;
  talentoMedia: number;
  talentoEtiqueta: EdtSemanticLevel;
  transversalMedia: number;
  transversalEtiqueta: EdtSemanticLevel;
  mediaGlobal: number;
  desviacionTipica: number;
};

export type AnalyzeGraphRequestBody = {
  teamName: string;
  edtMetrics: AnalyzeGraphEdtMetricsPayload;
};

const SYSTEM_PROMPT = `Eres un Consultor Senior de Alta Dirección en ElevateX. Tu misión es redactar un informe ejecutivo implacable, directo y de alto impacto para un Manager, basándote únicamente en los datos reales recibidos de la Evaluación de Dinámicas de Trabajo (EDT). No te inventes ninguna métrica ni asumas datos fuera del JSON recibido. Estructura el informe en Markdown con estos tres bloques:

📊 Diagnóstico del Ecosistema EDT: Analiza cómo está el equipo contrastando las medias de Entorno, Dirección y Talento con sus umbrales oficiales (Alto >=3.50, Competitivo >=2.50, Bajo >=1.50, Crítico <1.50). Sé tajante si un bloque está por debajo de 2.50.

📉 Análisis de Coherencia y Dispersión: Utiliza la Media Global y la Desviación Típica para evaluar si el equipo comparte la misma experiencia o si hay fracturas y bandos internos en sus dinámicas de opinión.

🎯 Plan de Acción Exponencial: Redacta 3 recomendaciones de negocio críticas, agresivas y accionables dirigidas al bloque con menor puntuación del sistema.`;

function parseFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSemanticLevel(value: unknown): EdtSemanticLevel | null {
  if (
    value === "Alto" ||
    value === "Competitivo" ||
    value === "Bajo" ||
    value === "Crítico"
  ) {
    return value;
  }

  return null;
}

function resolveEtiqueta(
  media: number,
  provided: unknown,
): EdtSemanticLevel {
  const parsed = parseSemanticLevel(provided);
  return parsed ?? classifyEdtSemanticLevel(media);
}

function parseEdtMetrics(value: unknown): AnalyzeGraphEdtMetricsPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  const entornoMedia = parseFiniteNumber(record.entornoMedia);
  const direccionMedia = parseFiniteNumber(record.direccionMedia);
  const talentoMedia = parseFiniteNumber(record.talentoMedia);
  const transversalMedia = parseFiniteNumber(record.transversalMedia);
  const mediaGlobal =
    parseFiniteNumber(record.mediaGlobal) ??
    parseFiniteNumber(record.mediaGlobalSistema);
  const desviacionTipica = parseFiniteNumber(record.desviacionTipica);

  if (
    entornoMedia === null ||
    direccionMedia === null ||
    talentoMedia === null ||
    transversalMedia === null ||
    mediaGlobal === null ||
    desviacionTipica === null
  ) {
    return null;
  }

  return {
    entornoMedia,
    entornoEtiqueta: resolveEtiqueta(entornoMedia, record.entornoEtiqueta),
    direccionMedia,
    direccionEtiqueta: resolveEtiqueta(direccionMedia, record.direccionEtiqueta),
    talentoMedia,
    talentoEtiqueta: resolveEtiqueta(talentoMedia, record.talentoEtiqueta),
    transversalMedia,
    transversalEtiqueta: resolveEtiqueta(
      transversalMedia,
      record.transversalEtiqueta,
    ),
    mediaGlobal,
    desviacionTipica,
  };
}

export function parseAnalyzeGraphRequestBody(
  body: unknown,
): AnalyzeGraphRequestBody | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const edtMetrics = parseEdtMetrics(record.edtMetrics);

  if (!edtMetrics) {
    return null;
  }

  const teamName =
    typeof record.teamName === "string" ? record.teamName.trim() : "";

  if (!teamName) {
    return null;
  }

  return { teamName, edtMetrics };
}

function formatBlockLine(
  label: string,
  media: number,
  etiqueta: EdtSemanticLevel,
): string {
  return `- ${label}: ${media.toFixed(2)} (${etiqueta})`;
}

export function buildAnalyzeGraphUserPrompt(
  payload: AnalyzeGraphRequestBody,
): string {
  const { edtMetrics, teamName } = payload;

  return `Genera el informe ejecutivo EDT en Markdown para el equipo "${teamName}".

DATOS RECIBIDOS (JSON EDT — no inventar nada fuera de esto):

MÉTRICAS POR BLOQUE (escala 1.00–4.00):
${formatBlockLine("Entorno", edtMetrics.entornoMedia, edtMetrics.entornoEtiqueta)}
${formatBlockLine("Dirección", edtMetrics.direccionMedia, edtMetrics.direccionEtiqueta)}
${formatBlockLine("Talento", edtMetrics.talentoMedia, edtMetrics.talentoEtiqueta)}
${formatBlockLine("EDT Transversal", edtMetrics.transversalMedia, edtMetrics.transversalEtiqueta)}

ESTADÍSTICOS GLOBALES:
- Media Global: ${edtMetrics.mediaGlobal.toFixed(2)}
- Desviación Típica: ${edtMetrics.desviacionTipica.toFixed(2)}

Umbrales oficiales: Alto >= 3.50 · Competitivo >= 2.50 · Bajo >= 1.50 · Crítico < 1.50

El bloque con menor puntuación del sistema (incluyendo EDT Transversal) debe ser la base del Plan de Acción Exponencial.`;
}

function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error("[analyze-graph] OPENAI_API_KEY no configurada.");
    return null;
  }

  return new OpenAI({ apiKey });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const payload = parseAnalyzeGraphRequestBody(body);

    if (!payload) {
      return NextResponse.json(
        {
          error:
            "Cuerpo inválido. Se requiere { teamName: string, edtMetrics: { entornoMedia, direccionMedia, talentoMedia, transversalMedia, mediaGlobal, desviacionTipica } }.",
        },
        { status: 400 },
      );
    }

    const openai = getOpenAIClient();

    if (!openai) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY no configurada." },
        { status: 503 },
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      max_tokens: 1400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildAnalyzeGraphUserPrompt(payload) },
      ],
    });

    const report = completion.choices[0]?.message?.content?.trim();

    if (!report) {
      console.error("[analyze-graph] OpenAI devolvió una respuesta vacía.");
      return NextResponse.json(
        { error: "OpenAI devolvió una respuesta vacía." },
        { status: 502 },
      );
    }

    return NextResponse.json({ report });
  } catch (error) {
    console.error("[analyze-graph] Error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al generar el informe EDT.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
