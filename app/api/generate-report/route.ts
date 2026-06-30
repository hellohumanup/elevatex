import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildGenerateReportUserPrompt,
  parseGenerateReportRequestBody,
  parseStrategicDiagnosticReport,
  type GenerateReportRequestBody,
  type StrategicDiagnosticReport,
} from "@/lib/generateReport";

export type { GenerateReportRequestBody, StrategicDiagnosticReport };

const SYSTEM_PROMPT = `Eres un consultor senior en Desarrollo Organizacional (DO) y Análisis de Redes Organizacionales (ONA), especializado en el framework ElevateX.

Tu misión es integrar diagnóstico cuantitativo y sociométrico para un informe ejecutivo B2B:

DIMENSIONES EDT (escala 1–4):
1. Entorno — clima, seguridad psicológica y condiciones del contexto de trabajo.
2. Dirección — alineación estratégica, claridad de objetivos y liderazgo percibido.
3. Talento — desarrollo, reconocimiento y capacidad de retención del capital humano.

ANÁLISIS DE REDES ONA:
- Densidad de red (% de conexiones reales vs. máximo posible).
- Líderes de influencia informal (centralidad entrante).
- Colaboradores aislados (sin conexiones entrantes — riesgo de desconexión).
- Silos y subgrupos desconectados (anomalías estructurales).

Metodología obligatoria:
- Cruza las tres dimensiones EDT con las anomalías ONA para detectar desajustes: percepción cultural favorable vs. red fragmentada; alta densidad con perfiles aislados; líderes informales en bloques EDT débiles; silos que contradicen autonomía o dirección percibida.
- Basa cada afirmación exclusivamente en los datos recibidos. No inventes métricas ni contexto externo.
- Tono corporativo, científico y directo. Sin saludos, disclaimers ni texto fuera del JSON.

FORMATO DE SALIDA — responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin bloques de código):
{
  "resumenEjecutivo": "string",
  "principalesRiesgos": ["string", "string", "string"],
  "planAccionInmediato": ["string", "string", "string"]
}

Reglas estrictas:
- "resumenEjecutivo": un párrafo ejecutivo potente que sintetice el estado del equipo y el principal desajuste EDT–ONA.
- "principalesRiesgos": exactamente 3 strings, ordenados por severidad e impacto en negocio.
- "planAccionInmediato": exactamente 3 strings con iniciativas accionables para el manager en 4–6 semanas.`;

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const payload: GenerateReportRequestBody | null =
      parseGenerateReportRequestBody(body);

    if (!payload) {
      return NextResponse.json(
        {
          error:
            "Cuerpo inválido. Se requiere { groupName, edt: { entornoMedia, direccionMedia, talentoMedia, transversalMedia }, ona: { density, leaders[], isolated[] } }.",
        },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error("[generate-report] OPENAI_API_KEY no configurada.");
      return NextResponse.json(
        { error: "OPENAI_API_KEY no configurada." },
        { status: 503 },
      );
    }

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.45,
      max_tokens: 1400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildGenerateReportUserPrompt(payload) },
      ],
    });

    const rawContent = completion.choices[0]?.message?.content?.trim();

    if (!rawContent) {
      console.error("[generate-report] OpenAI devolvió una respuesta vacía.");
      return NextResponse.json(
        { error: "OpenAI devolvió una respuesta vacía." },
        { status: 502 },
      );
    }

    const report = parseStrategicDiagnosticReport(rawContent);

    if (!report) {
      console.error(
        "[generate-report] Formato JSON inválido:",
        rawContent.slice(0, 500),
      );
      return NextResponse.json(
        {
          error:
            'La respuesta no cumple el formato { resumenEjecutivo, principalesRiesgos[3], planAccionInmediato[3] }.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("[generate-report] Error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido al generar el informe.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
