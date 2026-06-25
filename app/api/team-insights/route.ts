import OpenAI from "openai";
import { NextResponse } from "next/server";
import { AI_MAINTENANCE_MESSAGE } from "@/lib/teamInsights";

type LeaderInsight = {
  id: string;
  name: string;
  votes?: number;
  mutualConnections?: number;
};

type IsolatedInsight = {
  id: string;
  name: string;
};

type TeamInsightsRequest = {
  leaders: LeaderInsight[];
  strongConnections: LeaderInsight[];
  isolated: IsolatedInsight[];
};

const SYSTEM_PROMPT =
  "Eres un Consultor Ejecutivo de Recursos Humanos experto en análisis sociométrico. Analiza estos datos de red de un equipo y redacta un breve y único párrafo (máximo 4 líneas) de resumen ejecutivo destacando el clima laboral, líderes, reciprocidad y riesgos de aislamiento. Usa un tono corporativo y profesional.";

function maintenanceResponse() {
  return NextResponse.json({
    insight: AI_MAINTENANCE_MESSAGE,
    fallback: true,
  });
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

function formatLeaders(leaders: LeaderInsight[]): string {
  if (leaders.length === 0) {
    return "- Ningún líder identificado.";
  }

  return leaders
    .map(
      (leader, index) =>
        `- ${index + 1}. ${leader.name}${leader.votes !== undefined ? `: ${leader.votes} conexiones recibidas` : ""}`,
    )
    .join("\n");
}

function formatStrongConnections(members: LeaderInsight[]): string {
  if (members.length === 0) {
    return "- No se detectaron conexiones mutuas relevantes.";
  }

  return members
    .map(
      (member, index) =>
        `- ${index + 1}. ${member.name}${member.mutualConnections !== undefined ? `: ${member.mutualConnections} conexiones recíprocas` : ""}`,
    )
    .join("\n");
}

function formatIsolated(members: IsolatedInsight[]): string {
  if (members.length === 0) {
    return "- Ningún miembro en situación de aislamiento.";
  }

  return members.map((member) => `- ${member.name}`).join("\n");
}

function buildUserPrompt({
  leaders,
  strongConnections,
  isolated,
}: TeamInsightsRequest): string {
  return `Analiza los siguientes datos sociométricos del equipo:

LÍDERES DE INFLUENCIA:
${formatLeaders(leaders)}

CONEXIONES FUERTES (RECIPROCIDAD):
${formatStrongConnections(strongConnections)}

MIEMBROS EN RIESGO DE AISLAMIENTO:
${formatIsolated(isolated)}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TeamInsightsRequest;

    const leaders = Array.isArray(body.leaders) ? body.leaders : [];
    const strongConnections = Array.isArray(body.strongConnections)
      ? body.strongConnections
      : [];
    const isolated = Array.isArray(body.isolated) ? body.isolated : [];

    const openai = getOpenAIClient();

    if (!openai) {
      return maintenanceResponse();
    }

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserPrompt({
              leaders,
              strongConnections,
              isolated,
            }),
          },
        ],
      });

      const insight = completion.choices[0]?.message?.content?.trim();

      if (!insight) {
        return maintenanceResponse();
      }

      return NextResponse.json({ insight, fallback: false });
    } catch {
      return maintenanceResponse();
    }
  } catch {
    return maintenanceResponse();
  }
}
