/**
 * Framework EDT de ElevateX — motor de cálculo diagnóstico.
 *
 * Entrada: respuestas con `answers` JSONb (claves "1"–"28", valores A|B|C|D).
 * Codificación: A = 4.00 · B = 3.00 · C = 2.00 · D = 1.00.
 */

export const EDT_ANSWER_SCORES = {
  A: 4.0,
  B: 3.0,
  C: 2.0,
  D: 1.0,
} as const;

export type EdtAnswerLetter = keyof typeof EDT_ANSWER_SCORES;

export const EDT_SEMANTIC_THRESHOLDS = {
  alto: 3.5,
  competitivo: 2.5,
  bajo: 1.5,
} as const;

export type EdtSemanticLevel = "Alto" | "Competitivo" | "Bajo" | "Crítico";

export const EDT_BLOCKS = [
  {
    key: "entorno",
    label: "Entorno",
    questionStart: 1,
    questionEnd: 8,
    mediaKey: "entornoMedia",
    etiquetaKey: "entornoEtiqueta",
  },
  {
    key: "direccion",
    label: "Dirección",
    questionStart: 9,
    questionEnd: 16,
    mediaKey: "direccionMedia",
    etiquetaKey: "direccionEtiqueta",
  },
  {
    key: "talento",
    label: "Talento",
    questionStart: 17,
    questionEnd: 24,
    mediaKey: "talentoMedia",
    etiquetaKey: "talentoEtiqueta",
  },
  {
    key: "transversal",
    label: "EDT Transversal",
    questionStart: 25,
    questionEnd: 28,
    mediaKey: "transversalMedia",
    etiquetaKey: "transversalEtiqueta",
  },
] as const;

export type EdtBlockKey = (typeof EDT_BLOCKS)[number]["key"];

export type EdtBlockResult = {
  key: EdtBlockKey;
  label: string;
  questionRangeLabel: string;
  media: number;
  etiqueta: EdtSemanticLevel;
  scoreCount: number;
};

export type EdtMetricsResult = {
  entornoMedia: number;
  entornoEtiqueta: EdtSemanticLevel;
  direccionMedia: number;
  direccionEtiqueta: EdtSemanticLevel;
  talentoMedia: number;
  talentoEtiqueta: EdtSemanticLevel;
  transversalMedia: number;
  transversalEtiqueta: EdtSemanticLevel;
  /** Media aritmética de todas las respuestas codificadas (1–28) del sistema. */
  mediaGlobalSistema: number;
  /** Desviación típica poblacional sobre el mismo universo de puntuaciones. */
  desviacionTipica: number;
  responseCount: number;
  totalScoreCount: number;
  bloques: Record<EdtBlockKey, EdtBlockResult>;
};

export type EdtResponseRow = {
  answers: unknown;
};

const QUESTION_NUMBERS = Array.from({ length: 28 }, (_, index) => index + 1);

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseAnswerLetter(value: unknown): EdtAnswerLetter | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized in EDT_ANSWER_SCORES) {
    return normalized as EdtAnswerLetter;
  }

  return null;
}

/** Convierte una letra A–D en su puntuación numérica oficial del framework. */
export function mapEdtAnswerToScore(letter: EdtAnswerLetter): number {
  return EDT_ANSWER_SCORES[letter];
}

/** Clasificación semántica RR.HH. para evitar inflación diagnóstica. */
export function classifyEdtSemanticLevel(media: number): EdtSemanticLevel {
  if (media >= EDT_SEMANTIC_THRESHOLDS.alto) {
    return "Alto";
  }

  if (media >= EDT_SEMANTIC_THRESHOLDS.competitivo) {
    return "Competitivo";
  }

  if (media >= EDT_SEMANTIC_THRESHOLDS.bajo) {
    return "Bajo";
  }

  return "Crítico";
}

function formatQuestionRangeLabel(start: number, end: number): string {
  return `Preguntas ${start} a ${end}`;
}

function isQuestionNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 28;
}

/** Extrae las letras A–D del JSONb `answers` (claves "1" … "28"). */
export function extractEdtAnswerLettersFromAnswers(
  answers: unknown,
): Partial<Record<number, EdtAnswerLetter>> {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return {};
  }

  const record = answers as Record<string, unknown>;
  const parsed: Partial<Record<number, EdtAnswerLetter>> = {};

  for (const [rawKey, rawValue] of Object.entries(record)) {
    const questionNumber = Number(rawKey);
    if (!isQuestionNumber(questionNumber)) {
      continue;
    }

    const letter = parseAnswerLetter(rawValue);
    if (!letter) {
      continue;
    }

    parsed[questionNumber] = letter;
  }

  return parsed;
}

/**
 * Extrae puntuaciones numéricas de un JSONb `answers`.
 * Acepta claves numéricas o string ("1" … "28").
 */
export function extractEdtScoresFromAnswers(
  answers: unknown,
): Partial<Record<number, number>> {
  const letters = extractEdtAnswerLettersFromAnswers(answers);
  const parsed: Partial<Record<number, number>> = {};

  for (const [rawKey, letter] of Object.entries(letters)) {
    if (!letter) {
      continue;
    }

    parsed[Number(rawKey)] = mapEdtAnswerToScore(letter);
  }

  return parsed;
}

function collectBlockScores(
  parsedAnswers: Partial<Record<number, number>>,
  questionStart: number,
  questionEnd: number,
): number[] {
  const scores: number[] = [];

  for (let question = questionStart; question <= questionEnd; question += 1) {
    const score = parsedAnswers[question];
    if (score !== undefined) {
      scores.push(score);
    }
  }

  return scores;
}

/** Media aritmética exacta; devuelve null si no hay observaciones válidas. */
export function computeArithmeticMean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const sum = values.reduce((accumulator, value) => accumulator + value, 0);
  return sum / values.length;
}

/** Desviación típica poblacional: σ = √(Σ(xᵢ − μ)² / N). */
export function computePopulationStdDev(
  values: readonly number[],
  mean: number,
): number | null {
  if (values.length === 0) {
    return null;
  }

  const variance =
    values.reduce((accumulator, value) => {
      const delta = value - mean;
      return accumulator + delta * delta;
    }, 0) / values.length;

  return Math.sqrt(variance);
}

function buildBlockResult(
  block: (typeof EDT_BLOCKS)[number],
  scores: readonly number[],
): EdtBlockResult {
  const rawMean = computeArithmeticMean(scores) ?? 0;
  const media = roundToTwoDecimals(rawMean);

  return {
    key: block.key,
    label: block.label,
    questionRangeLabel: formatQuestionRangeLabel(
      block.questionStart,
      block.questionEnd,
    ),
    media,
    etiqueta: classifyEdtSemanticLevel(rawMean),
    scoreCount: scores.length,
  };
}

/**
 * Calcula las métricas EDT agregadas del equipo a partir de las respuestas
 * al cuestionario (claves "1"–"28", valores A|B|C|D).
 *
 * Las medias de bloque se obtienen sobre todas las puntuaciones válidas
 * del bloque en el conjunto de respuestas (media aritmética exacta).
 */
export function computeEdtMetrics(
  responses: readonly EdtResponseRow[],
): EdtMetricsResult {
  const blockScores: Record<EdtBlockKey, number[]> = {
    entorno: [],
    direccion: [],
    talento: [],
    transversal: [],
  };
  const allScores: number[] = [];
  let responseCount = 0;

  for (const response of responses) {
    const parsed = extractEdtScoresFromAnswers(response.answers);

    if (Object.keys(parsed).length === 0) {
      continue;
    }

    responseCount += 1;

    for (const block of EDT_BLOCKS) {
      const scores = collectBlockScores(
        parsed,
        block.questionStart,
        block.questionEnd,
      );
      blockScores[block.key].push(...scores);
    }

    for (const questionNumber of QUESTION_NUMBERS) {
      const score = parsed[questionNumber];
      if (score !== undefined) {
        allScores.push(score);
      }
    }
  }

  const bloques = EDT_BLOCKS.reduce(
    (accumulator, block) => {
      accumulator[block.key] = buildBlockResult(block, blockScores[block.key]);
      return accumulator;
    },
    {} as Record<EdtBlockKey, EdtBlockResult>,
  );

  const rawGlobalMean = computeArithmeticMean(allScores) ?? 0;
  const rawStdDev = computePopulationStdDev(allScores, rawGlobalMean) ?? 0;

  return {
    entornoMedia: bloques.entorno.media,
    entornoEtiqueta: bloques.entorno.etiqueta,
    direccionMedia: bloques.direccion.media,
    direccionEtiqueta: bloques.direccion.etiqueta,
    talentoMedia: bloques.talento.media,
    talentoEtiqueta: bloques.talento.etiqueta,
    transversalMedia: bloques.transversal.media,
    transversalEtiqueta: bloques.transversal.etiqueta,
    mediaGlobalSistema: roundToTwoDecimals(rawGlobalMean),
    desviacionTipica: roundToTwoDecimals(rawStdDev),
    responseCount,
    totalScoreCount: allScores.length,
    bloques,
  };
}
