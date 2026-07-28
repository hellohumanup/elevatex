import {
  type EdtAnswerLetter,
  extractEdtAnswerLettersFromAnswers,
} from "@/lib/edtMetrics";

/** Umbral de afinidad en producción: ~65% de coincidencia sobre 28 preguntas EDT. */
export const EDT_AFFINITY_MATCH_THRESHOLD_PRODUCTION = 18;

/**
 * Umbral intermedio en desarrollo (~32 % sobre 28 preguntas).
 * Equilibrio entre evitar telarañas (umbral 5) y grafo vacío con datos simulados (umbral 13+).
 * TODO(producción): revisar si el umbral dev sigue siendo necesario tras datos reales.
 */
export const EDT_AFFINITY_MATCH_THRESHOLD_DEV = 9;

export function resolveEdtAffinityMatchThreshold(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): number {
  return nodeEnv === "development"
    ? EDT_AFFINITY_MATCH_THRESHOLD_DEV
    : EDT_AFFINITY_MATCH_THRESHOLD_PRODUCTION;
}

/** @deprecated Usar resolveEdtAffinityMatchThreshold() */
export const EDT_AFFINITY_MATCH_THRESHOLD = resolveEdtAffinityMatchThreshold();

export type EdtAffinityGraphLink = {
  source: string;
  target: string;
  value: number;
};

export type EdtAffinityGraphNode = {
  id: string;
  name: string;
  /** Nº de enlaces de afinidad incidentes (grado en la red). */
  votes: number;
};

export type EdtAffinityGraphData = {
  nodes: EdtAffinityGraphNode[];
  links: EdtAffinityGraphLink[];
};

export type EdtAffinityParticipant = {
  id: string | number;
  name: string;
};

export type EdtAffinityResponse = {
  participant_id: string | number | null;
  answers: unknown;
};

export type EdtPairAffinityScore = {
  /** Coincidencias exactas de letra (A|B|C|D) en la misma pregunta. */
  matches: number;
  /** Preguntas 1–28 en las que ambos participantes respondieron. */
  comparableQuestions: number;
};

/**
 * Compara estrictamente par a par (pregunta N vs pregunta N) dos perfiles EDT.
 * Solo cuenta una coincidencia cuando ambos tienen respuesta en esa pregunta
 * y la letra es idéntica; preguntas sin respuesta de uno u otro se ignoran.
 */
export function scoreEdtPairAffinity(
  left: Partial<Record<number, EdtAnswerLetter>>,
  right: Partial<Record<number, EdtAnswerLetter>>,
  questionStart = 1,
  questionEnd = 28,
): EdtPairAffinityScore {
  let matches = 0;
  let comparableQuestions = 0;

  for (let question = questionStart; question <= questionEnd; question += 1) {
    const leftAnswer = left[question];
    const rightAnswer = right[question];

    if (leftAnswer === undefined || rightAnswer === undefined) {
      continue;
    }

    comparableQuestions += 1;

    if (leftAnswer === rightAnswer) {
      matches += 1;
    }
  }

  return { matches, comparableQuestions };
}

/** @deprecated Preferir scoreEdtPairAffinity para validar cobertura del par. */
export function countEdtAnswerLetterMatches(
  left: Partial<Record<number, EdtAnswerLetter>>,
  right: Partial<Record<number, EdtAnswerLetter>>,
  questionStart = 1,
  questionEnd = 28,
): number {
  return scoreEdtPairAffinity(left, right, questionStart, questionEnd).matches;
}

/**
 * Construye la red de afinidad cruzada EDT comparando todos los pares
 * de participantes. Crea un enlace cuando comparten la misma opción en
 * al menos `threshold` preguntas coincidentes y ambos perfiles con al menos
 * `threshold` preguntas comparables en común (cobertura mínima del par).
 */
export function buildEdtAffinityGraphData(
  participants: readonly EdtAffinityParticipant[],
  responses: readonly EdtAffinityResponse[],
  threshold = resolveEdtAffinityMatchThreshold(),
): EdtAffinityGraphData {
  const participantIds = new Set(
    participants.map((participant) => String(participant.id)),
  );

  const answersByParticipant = new Map<
    string,
    Partial<Record<number, EdtAnswerLetter>>
  >();

  for (const response of responses) {
    if (response.participant_id === null || response.participant_id === undefined) {
      continue;
    }

    const participantId = String(response.participant_id);

    if (!participantIds.has(participantId)) {
      continue;
    }

    answersByParticipant.set(
      participantId,
      extractEdtAnswerLettersFromAnswers(response.answers),
    );
  }

  const roster = participants.map((participant) => ({
    id: String(participant.id),
    name: participant.name,
  }));

  const links: EdtAffinityGraphLink[] = [];

  for (let indexA = 0; indexA < roster.length; indexA += 1) {
    for (let indexB = indexA + 1; indexB < roster.length; indexB += 1) {
      const participantA = roster[indexA];
      const participantB = roster[indexB];
      const answersA = answersByParticipant.get(participantA.id);
      const answersB = answersByParticipant.get(participantB.id);

      if (!answersA || !answersB) {
        continue;
      }

      const { matches, comparableQuestions } = scoreEdtPairAffinity(
        answersA,
        answersB,
      );

      if (comparableQuestions >= threshold && matches >= threshold) {
        links.push({
          source: participantA.id,
          target: participantB.id,
          value: matches,
        });
      }
    }
  }

  const degreeById = new Map<string, number>(
    roster.map((participant) => [participant.id, 0]),
  );

  for (const link of links) {
    degreeById.set(link.source, (degreeById.get(link.source) ?? 0) + 1);
    degreeById.set(link.target, (degreeById.get(link.target) ?? 0) + 1);
  }

  const nodes: EdtAffinityGraphNode[] = roster.map((participant) => ({
    id: participant.id,
    name: participant.name,
    votes: degreeById.get(participant.id) ?? 0,
  }));

  return { nodes, links };
}
