import {
  type EdtAnswerLetter,
  extractEdtAnswerLettersFromAnswers,
} from "@/lib/edtMetrics";

/** Umbral de afinidad: ~65% de coincidencia sobre 28 preguntas EDT. */
export const EDT_AFFINITY_MATCH_THRESHOLD = 18;

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

/**
 * Cuenta coincidencias exactas de opción (A|B|C|D) pregunta a pregunta
 * entre dos perfiles EDT (preguntas 1–28).
 */
export function countEdtAnswerLetterMatches(
  left: Partial<Record<number, EdtAnswerLetter>>,
  right: Partial<Record<number, EdtAnswerLetter>>,
  questionStart = 1,
  questionEnd = 28,
): number {
  let matches = 0;

  for (let question = questionStart; question <= questionEnd; question += 1) {
    const leftAnswer = left[question];
    const rightAnswer = right[question];

    if (
      leftAnswer !== undefined &&
      rightAnswer !== undefined &&
      leftAnswer === rightAnswer
    ) {
      matches += 1;
    }
  }

  return matches;
}

/**
 * Construye la red de afinidad cruzada EDT comparando todos los pares
 * de participantes. Crea un enlace cuando comparten la misma opción en
 * al menos `threshold` preguntas (por defecto 18 ≈ 65%).
 */
export function buildEdtAffinityGraphData(
  participants: readonly EdtAffinityParticipant[],
  responses: readonly EdtAffinityResponse[],
  threshold = EDT_AFFINITY_MATCH_THRESHOLD,
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

      const matches = countEdtAnswerLetterMatches(answersA, answersB);

      if (matches >= threshold) {
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
