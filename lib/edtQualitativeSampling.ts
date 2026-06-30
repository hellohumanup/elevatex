/**
 * Framework ElevateX — Auditoría Cualitativa Automatizada (Muestreo EDT).
 * Determina el plan de entrevistas según el tamaño de la población respondida.
 */

export type EdtQualitativeSamplingBand =
  | "micro"
  | "small"
  | "medium"
  | "large";

export type EdtQualitativeSamplingRecommendation = {
  band: EdtQualitativeSamplingBand;
  /** Etiqueta legible del tramo poblacional. */
  bandLabel: string;
  populationSize: number;
  interviewsMin: number;
  interviewsMax: number;
  populationPercentMin: number;
  populationPercentMax: number;
  /** Ej. "4–5 entrevistas" */
  interviewsRangeLabel: string;
  /** Ej. "40–50% de la población" */
  populationPercentLabel: string;
  focus: string;
  justification: string;
};

type SamplingRule = Omit<
  EdtQualitativeSamplingRecommendation,
  "populationSize" | "interviewsRangeLabel" | "populationPercentLabel"
> & {
  matches: (populationSize: number) => boolean;
};

const EDT_QUALITATIVE_SAMPLING_RULES: SamplingRule[] = [
  {
    band: "micro",
    bandLabel: "Hasta 15 personas",
    matches: (populationSize) => populationSize <= 15,
    interviewsMin: 4,
    interviewsMax: 5,
    populationPercentMin: 40,
    populationPercentMax: 50,
    focus: "Toda la curva",
    justification:
      "Factor de corrección para muestras pequeñas: El tamaño del grupo no permite ignorar las colas de la campana. Se requiere un porcentaje alto para evitar el sesgo de selección.",
  },
  {
    band: "small",
    bandLabel: "De 16 a 35 personas",
    matches: (populationSize) => populationSize >= 16 && populationSize <= 35,
    interviewsMin: 6,
    interviewsMax: 8,
    populationPercentMin: 30,
    populationPercentMax: 40,
    focus: "Centro y extremos",
    justification:
      "Muestreo de variación máxima: Permite dividir el grupo en dos subperfiles opuestos para contrastar las opiniones centrales con las disidentes.",
  },
  {
    band: "medium",
    bandLabel: "De 36 a 75 personas",
    matches: (populationSize) => populationSize >= 36 && populationSize <= 75,
    interviewsMin: 10,
    interviewsMax: 12,
    populationPercentMin: 20,
    populationPercentMax: 24,
    focus: "Colas y anomalías",
    justification:
      "Saturación inicial (Estudio de Guest et al.): Los modelos cualitativos demuestran que en poblaciones medianas, las primeras 12 entrevistas revelan más del 80% de los conceptos y causas subyacentes.",
  },
  {
    band: "large",
    bandLabel: "Más de 75 personas",
    matches: (populationSize) => populationSize > 75,
    interviewsMin: 12,
    interviewsMax: 15,
    populationPercentMin: 12,
    populationPercentMax: 15,
    focus: "Extremos puros",
    justification:
      "Principio de eficiencia cualitativa: Entrevistar a más del 15% de una masa homogénea genera redundancia de datos. Se priorizan los extremos de la campana de Gauss para explicar la dispersión.",
  },
];

function formatInterviewsRange(min: number, max: number): string {
  return min === max
    ? `${min} entrevista${min === 1 ? "" : "s"}`
    : `${min}–${max} entrevistas`;
}

function formatPopulationPercentRange(min: number, max: number): string {
  return `${min}–${max}% de la población`;
}

/**
 * Devuelve la recomendación oficial de muestreo cualitativo EDT según el
 * número total de respuestas acumuladas en la encuesta o panel.
 */
export function computeEdtQualitativeSampling(
  totalResponses: number,
): EdtQualitativeSamplingRecommendation {
  const populationSize = Math.max(0, Math.floor(totalResponses));
  const rule =
    EDT_QUALITATIVE_SAMPLING_RULES.find((entry) => entry.matches(populationSize)) ??
    EDT_QUALITATIVE_SAMPLING_RULES[0];

  return {
    band: rule.band,
    bandLabel: rule.bandLabel,
    populationSize,
    interviewsMin: rule.interviewsMin,
    interviewsMax: rule.interviewsMax,
    populationPercentMin: rule.populationPercentMin,
    populationPercentMax: rule.populationPercentMax,
    interviewsRangeLabel: formatInterviewsRange(
      rule.interviewsMin,
      rule.interviewsMax,
    ),
    populationPercentLabel: formatPopulationPercentRange(
      rule.populationPercentMin,
      rule.populationPercentMax,
    ),
    focus: rule.focus,
    justification: rule.justification,
  };
}
