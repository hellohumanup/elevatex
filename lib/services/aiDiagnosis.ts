import type { NetworkDensity } from "@/lib/mathEngine";

/** Líder de influencia detectado por centralidad de grado entrante (indegree). */
export type TeamInfluenceLeader = {
  id: string;
  name: string;
  /** Nominaciones ONA recibidas en la red del equipo. */
  nominationsReceived: number;
};

/**
 * Índice de fragmentación de la red (0 = integrada, 1 = altamente fragmentada).
 * Corresponde al indicador de dirección / silos del motor ElevateX ONA.
 */
export type TeamFragmentationMetric = {
  /** Valor normalizado en [0, 1]. */
  index: number;
  /** Número de silos o subgrupos detectados (contexto opcional). */
  siloCount?: number;
};

/** Colaborador aislado (0 votos recibidos). */
export type TeamIsolatedParticipant = {
  id: string;
  name: string;
};

/** Influencer por centralidad de entrada. */
export type TeamTopInfluencer = {
  id: string;
  name: string;
  inDegree: number;
};

/**
 * Entrada para el prompt de diagnóstico.
 * Incluye métricas del motor `calculateNetworkMetrics` y campos legacy opcionales.
 */
export type TeamDiagnosisPromptInput = {
  /** Densidad completa (legacy) o se deriva desde densityPercent. */
  density: NetworkDensity;
  leaders: readonly TeamInfluenceLeader[];
  fragmentation: TeamFragmentationMetric;
  /** Nombre del equipo; mejora la personalización del informe. */
  teamName?: string;
  /** % de reciprocidad (0–100) desde mathEngine. */
  reciprocityRate?: number;
  /** Colaboradores con 0 votos recibidos. */
  isolatedParticipants?: readonly TeamIsolatedParticipant[];
  /** Top influencers por inDegree. */
  topInfluencers?: readonly TeamTopInfluencer[];
};

type DensityInterpretationBand =
  | "muy_baja"
  | "baja"
  | "moderada"
  | "alta"
  | "muy_alta";

type FragmentationInterpretationBand =
  | "integrada"
  | "leve"
  | "moderada"
  | "alta"
  | "critica";

const SYSTEM_ROLE = `Eres un Consultor Senior de HR especializado en People Analytics, Organizational Network Analysis (ONA) y clima laboral corporativo.
Tu audiencia son directivos de RR.HH. y líderes de negocio que necesitan decisiones accionables, no jerga técnica vacía.
Escribes con tono corporativo, preciso y prudente.`;

const OUTPUT_CONTRACT = `FORMATO DE SALIDA OBLIGATORIO (Markdown en español):
## Resumen ejecutivo
(1 párrafo, máximo 120 palabras)

## Lectura del clima relacional
(1 párrafo: cohesión, confianza mutua e influencia informal)

## Hallazgos clave
- Hallazgo 1
- Hallazgo 2
- Hallazgo 3

## Recomendaciones para RR.HH.
1. Acción concreta (30-90 días)
2. Acción concreta (30-90 días)

RESTRICCIONES:
- No inventes métricas ni nombres que no figuren en los datos provistos.
- Usa Markdown simple (##, -, 1.); sin tablas ni JSON.
- Interpreta densidad, reciprocidad, aislados e influencers de forma conjunta.
- Si los datos son limitados, decláralo con prudencia y evita conclusiones absolutas.`;

function assertValidFragmentation(fragmentation: TeamFragmentationMetric): void {
  if (
    !Number.isFinite(fragmentation.index) ||
    fragmentation.index < 0 ||
    fragmentation.index > 1
  ) {
    throw new Error(
      "fragmentation.index debe ser un número finito entre 0 y 1.",
    );
  }

  if (
    fragmentation.siloCount !== undefined &&
    (!Number.isInteger(fragmentation.siloCount) || fragmentation.siloCount < 0)
  ) {
    throw new Error(
      "fragmentation.siloCount debe ser un entero mayor o igual que 0.",
    );
  }
}

function assertValidDensity(density: NetworkDensity): void {
  if (
    !Number.isFinite(density.densityPercent) ||
    density.densityPercent < 0 ||
    density.densityPercent > 100
  ) {
    throw new Error(
      "density.densityPercent debe ser un porcentaje finito entre 0 y 100.",
    );
  }
}

function classifyDensityBand(densityPercent: number): DensityInterpretationBand {
  if (densityPercent < 10) {
    return "muy_baja";
  }

  if (densityPercent < 25) {
    return "baja";
  }

  if (densityPercent < 50) {
    return "moderada";
  }

  if (densityPercent < 75) {
    return "alta";
  }

  return "muy_alta";
}

function classifyFragmentationBand(
  index: number,
): FragmentationInterpretationBand {
  if (index < 0.15) {
    return "integrada";
  }

  if (index < 0.35) {
    return "leve";
  }

  if (index < 0.55) {
    return "moderada";
  }

  if (index < 0.75) {
    return "alta";
  }

  return "critica";
}

function densityBandLabel(band: DensityInterpretationBand): string {
  const labels: Record<DensityInterpretationBand, string> = {
    muy_baja:
      "red muy dispersa — interacción informal limitada, riesgo de desconexión",
    baja: "cohesión relacional baja — vínculos puntuales, no habituales",
    moderada:
      "cohesión moderada — equilibrio entre especialización y colaboración",
    alta: "red cohesionada — circulación activa de influencia y comunicación",
    muy_alta:
      "red muy densa — alta interdependencia; vigilar saturación de conectores",
  };

  return labels[band];
}

function fragmentationBandLabel(
  band: FragmentationInterpretationBand,
): string {
  const labels: Record<FragmentationInterpretationBand, string> = {
    integrada: "equipo integrado — baja probabilidad de silos aislados",
    leve: "fragmentación leve — subgrupos emergentes aún permeables",
    moderada:
      "fragmentación moderada — conviene reforzar puentes entre subgrupos",
    alta: "fragmentación alta — riesgo de silos operativos y pérdida de alineación",
    critica:
      "fragmentación crítica — coexisten islas relacionales con poca circulación",
  };

  return labels[band];
}

function formatLeadersSection(leaders: readonly TeamInfluenceLeader[]): string {
  if (leaders.length === 0) {
    return "- Sin líderes de influencia identificados (ninguna nominación entrante significativa).";
  }

  return leaders
    .map((leader, index) => {
      const nominationsLabel =
        leader.nominationsReceived === 1
          ? "1 nominación"
          : `${leader.nominationsReceived} nominaciones`;

      return `${index + 1}. ${leader.name} — ${nominationsLabel} recibidas (id: ${leader.id})`;
    })
    .join("\n");
}

function formatDensitySection(density: NetworkDensity): string {
  const band = classifyDensityBand(density.densityPercent);

  return [
    `- Nodos del roster (N): ${density.nodeCount}`,
    `- Arcos dirigidos observados (L): ${density.linkCount}`,
    `- Arcos posibles N×(N−1): ${density.maxPossibleLinks}`,
    `- Densidad (ratio D): ${density.density.toFixed(4)}`,
    `- Densidad (%): ${density.densityPercent}%`,
    `- Banda interpretativa: ${band} — ${densityBandLabel(band)}`,
  ].join("\n");
}

function formatFragmentationSection(
  fragmentation: TeamFragmentationMetric,
): string {
  const band = classifyFragmentationBand(fragmentation.index);
  const siloLine =
    fragmentation.siloCount !== undefined
      ? `- Silos detectados: ${fragmentation.siloCount}`
      : "- Silos detectados: no especificado";

  return [
    `- Índice de fragmentación: ${(fragmentation.index * 100).toFixed(1)}% (escala 0-100)`,
    siloLine,
    `- Banda interpretativa: ${band} — ${fragmentationBandLabel(band)}`,
  ].join("\n");
}

function formatReciprocitySection(reciprocityRate: number | undefined): string {
  if (reciprocityRate === undefined || !Number.isFinite(reciprocityRate)) {
    return "- Reciprocidad: no informada";
  }

  return `- Tasa de reciprocidad: ${reciprocityRate.toFixed(1)}% (pares mutuos sobre máximo bidireccional)`;
}

function formatIsolatedSection(
  isolated: readonly TeamIsolatedParticipant[] | undefined,
): string {
  if (!isolated || isolated.length === 0) {
    return "- Sin colaboradores aislados (todos reciben al menos una nominación).";
  }

  return isolated
    .map((participant) => `- ${participant.name} (id: ${participant.id})`)
    .join("\n");
}

function formatTopInfluencersSection(
  influencers: readonly TeamTopInfluencer[] | undefined,
  fallbackLeaders: readonly TeamInfluenceLeader[],
): string {
  if (influencers && influencers.length > 0) {
    return influencers
      .map(
        (influencer, index) =>
          `${index + 1}. ${influencer.name} — ${influencer.inDegree} votos recibidos (id: ${influencer.id})`,
      )
      .join("\n");
  }

  return formatLeadersSection(fallbackLeaders);
}

function buildMetricsContext(input: TeamDiagnosisPromptInput): string {
  const teamLabel = input.teamName?.trim() || "Equipo sin nombre";

  return `CONTEXTO CUANTITATIVO ONA — ${teamLabel}

COHESIÓN / DENSIDAD DE RED:
${formatDensitySection(input.density)}

CONFIANZA MUTUA (RECIPROCIDAD):
${formatReciprocitySection(input.reciprocityRate)}

LÍDERES INFORMALES (centralidad de entrada):
${formatTopInfluencersSection(input.topInfluencers, input.leaders)}

RIESGO DE AISLAMIENTO:
${formatIsolatedSection(input.isolatedParticipants)}

FRAGMENTACIÓN Y RIESGO DE SILOS (contexto complementario):
${formatFragmentationSection(input.fragmentation)}`;
}

function buildInterpretationGuidelines(): string {
  return `GUÍA DE INTERPRETACIÓN (aplicar en el informe):
- Densidad baja + reciprocidad baja: priorizar activación de vínculos y confianza mutua.
- Densidad baja + aislados > 0: riesgo de exclusión relacional; plan de inclusión inmediata.
- Reciprocidad alta + líderes concentrados: buena confianza bilateral, vigilar dependencia de hubs.
- Densidad alta + líderes concentrados: evaluar saturación de conectores clave.
- Triangula densidad, reciprocidad, aislados e influencers antes de recomendar.`;
}

/**
 * Genera el prompt de sistema para que un LLM redacte un informe de clima laboral
 * a partir de métricas ONA ya calculadas.
 */
export async function generateTeamDiagnosisPrompt(
  input: TeamDiagnosisPromptInput,
): Promise<string> {
  assertValidDensity(input.density);
  assertValidFragmentation(input.fragmentation);

  const leaders = [...input.leaders].sort(
    (left, right) =>
      right.nominationsReceived - left.nominationsReceived ||
      left.name.localeCompare(right.name, "es"),
  );

  const sections = [
    SYSTEM_ROLE,
    OUTPUT_CONTRACT,
    buildInterpretationGuidelines(),
    buildMetricsContext({ ...input, leaders }),
    "TAREA: Con los datos anteriores, redacta el informe de clima laboral corporativo en Markdown siguiendo el formato de salida obligatorio.",
  ];

  return sections.join("\n\n");
}

/**
 * Informe Markdown de prueba cuando OPENAI_API_KEY no está configurada.
 * Permite validar la UI sin romper el flujo.
 */
export function buildFallbackTeamDiagnosisMarkdown(
  input: TeamDiagnosisPromptInput,
): string {
  const teamLabel = input.teamName?.trim() || "el equipo";
  const densityPct = input.density.densityPercent;
  const reciprocity =
    typeof input.reciprocityRate === "number" &&
    Number.isFinite(input.reciprocityRate)
      ? input.reciprocityRate
      : null;
  const isolated = input.isolatedParticipants ?? [];
  const influencers =
    input.topInfluencers && input.topInfluencers.length > 0
      ? input.topInfluencers
      : input.leaders.map((leader) => ({
          id: leader.id,
          name: leader.name,
          inDegree: leader.nominationsReceived,
        }));

  const influencerNames =
    influencers.length > 0
      ? influencers.map((item) => item.name).join(", ")
      : "aún no identificados";

  const isolatedLine =
    isolated.length > 0
      ? `Se observan ${isolated.length} colaborador(es) sin nominaciones recibidas (${isolated.map((item) => item.name).join(", ")}), lo que eleva el riesgo de exclusión relacional.`
      : "No se detectan colaboradores aislados en la red actual.";

  return `## Resumen ejecutivo

Diagnóstico de prueba (modo fallback — sin OPENAI_API_KEY) para **${teamLabel}**. La cohesión medida por densidad se sitúa en **${densityPct.toFixed(1)}%**${reciprocity !== null ? ` y la confianza mutua (reciprocidad) en **${reciprocity.toFixed(1)}%**` : ""}. Los referentes informales principales son: ${influencerNames}.

## Lectura del clima relacional

La densidad indica el grado de conexiones activas respecto al máximo posible; la reciprocidad refleja cuántas de esas relaciones son bidireccionales. ${isolatedLine} Esta lectura debe tomarse como orientación preliminar hasta disponer de respuesta del modelo de IA.

## Hallazgos clave

- Cohesión de equipo (densidad): ${densityPct.toFixed(1)}%.
- Confianza mutua (reciprocidad): ${reciprocity !== null ? `${reciprocity.toFixed(1)}%` : "no informada"}.
- Riesgo de aislamiento: ${isolated.length} colaborador(es) con 0 votos recibidos.
- Líderes informales: ${influencerNames}.

## Recomendaciones para RR.HH.

1. Facilitar espacios estructurados de colaboración cruzada (30 días) para elevar densidad y reciprocidad donde estén bajas.
2. Diseñar un plan de inclusión para perfiles aislados y reforzar el rol de los líderes informales como puentes de onboarding relacional (60-90 días).

> *Informe generado en modo fallback local. Configura OPENAI_API_KEY en \`.env.local\` para el diagnóstico completo con IA.*`;
}
