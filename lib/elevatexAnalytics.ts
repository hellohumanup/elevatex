import {
  buildGraphLinksFromResponses,
  buildGraphNodes,
  calculateIndegree,
  calculateIsolation,
  calculateNetworkDensity,
  calculateReciprocity,
  detectNetworkSilos,
  type GraphLink,
  type GraphParticipant,
  type GroupOnaMetrics,
  type InfluenceLeader,
  type IsolatedParticipant,
  type NetworkDensity,
  type NetworkSilo,
  type ReciprocityLeader,
  type SociogramNode,
} from "@/lib/mathEngine";
import type { QuestionnaireQuestion } from "@/lib/questionnaire";
import { resolveSociogramAnswerKey } from "@/lib/questionnaire";

export const ELEVATEX_DIMENSIONS = [
  "Propósito Exponencial",
  "Autonomía y Roles",
  "Experimentación y Aprendizaje",
] as const;

export type ElevateXDimension = (typeof ELEVATEX_DIMENSIONS)[number];

export type ElevateXDimensionAverages = Record<ElevateXDimension, number>;

export type QuestionnaireResponseRow = {
  id?: string;
  group_id?: string | number;
  participant_id: string | number;
  questionnaire_id?: string | null;
  answers: unknown;
  elevatex_scores?: unknown;
};

export type ElevateXTeamAnalytics = {
  elevatexAverages: ElevateXDimensionAverages;
  elevatexResponseCount: number;
  alineacionQuestionId: string | null;
  silosQuestionId: string | null;
  silosCount: number;
  silosBarriers: NetworkSilo[];
  onaMetrics: GroupOnaMetrics;
  networkDensity: NetworkDensity;
  links: GraphLink[];
  nodes: SociogramNode[];
  influenceLeaders: InfluenceLeader[];
  reciprocityLeaders: ReciprocityLeader[];
  isolatedParticipants: IsolatedParticipant[];
  leaderNames: string[];
  isolatedNames: string[];
};

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function matchesSociogramTopic(
  question: QuestionnaireQuestion,
  keyword: string,
): boolean {
  if (question.type !== "sociogram") {
    return false;
  }

  const normalizedKeyword = normalizeText(keyword);
  const fields = [question.subtitle, question.title, question.prompt]
    .filter(Boolean)
    .map((field) => normalizeText(field ?? ""));

  return fields.some((field) => field.includes(normalizedKeyword));
}

export function findSociogramQuestionByTopic(
  questions: readonly QuestionnaireQuestion[],
  keyword: string,
): QuestionnaireQuestion | null {
  return questions.find((question) => matchesSociogramTopic(question, keyword)) ?? null;
}

function parseElevateXScores(value: unknown): Partial<Record<ElevateXDimension, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const parsed: Partial<Record<ElevateXDimension, number>> = {};

  for (const dimension of ELEVATEX_DIMENSIONS) {
    const score = record[dimension];
    if (typeof score === "number" && Number.isFinite(score) && score >= 1 && score <= 5) {
      parsed[dimension] = score;
    }
  }

  return parsed;
}

export function computeElevateXDimensionAverages(
  responses: readonly Pick<QuestionnaireResponseRow, "elevatex_scores">[],
): { averages: ElevateXDimensionAverages; responseCount: number } {
  const sums: Record<ElevateXDimension, number> = {
    "Propósito Exponencial": 0,
    "Autonomía y Roles": 0,
    "Experimentación y Aprendizaje": 0,
  };
  const counts: Record<ElevateXDimension, number> = {
    "Propósito Exponencial": 0,
    "Autonomía y Roles": 0,
    "Experimentación y Aprendizaje": 0,
  };

  for (const response of responses) {
    const scores = parseElevateXScores(response.elevatex_scores);

    for (const dimension of ELEVATEX_DIMENSIONS) {
      const score = scores[dimension];
      if (score === undefined) {
        continue;
      }

      sums[dimension] += score;
      counts[dimension] += 1;
    }
  }

  const averages = ELEVATEX_DIMENSIONS.reduce((accumulator, dimension) => {
    accumulator[dimension] =
      counts[dimension] > 0
        ? Math.round((sums[dimension] / counts[dimension]) * 10) / 10
        : 0;
    return accumulator;
  }, {} as ElevateXDimensionAverages);

  const responseCount = responses.filter((response) => {
    const scores = parseElevateXScores(response.elevatex_scores);
    return ELEVATEX_DIMENSIONS.some((dimension) => scores[dimension] !== undefined);
  }).length;

  return { averages, responseCount };
}

function extractSociogramSelections(
  answers: unknown,
  answerKeys: readonly string[],
): string[] {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return [];
  }

  const record = answers as Record<string, unknown>;

  for (const answerKey of answerKeys) {
    const selected = record[answerKey];
    if (!Array.isArray(selected)) {
      continue;
    }

    const parsed = selected
      .map((value) => {
        if (typeof value === "string" && value.length > 0) {
          return value;
        }
        if (typeof value === "number") {
          return String(value);
        }
        return null;
      })
      .filter((value): value is string => value !== null);

    if (parsed.length > 0) {
      return parsed;
    }
  }

  return [];
}

export function buildLinksFromSociogramQuestion(
  responses: readonly QuestionnaireResponseRow[],
  answerKeys: readonly string[],
  participantIds: ReadonlySet<string>,
): GraphLink[] {
  const links: GraphLink[] = [];

  for (const response of responses) {
    const source = String(response.participant_id);
    if (!participantIds.has(source)) {
      continue;
    }

    for (const targetId of extractSociogramSelections(response.answers, answerKeys)) {
      if (participantIds.has(targetId)) {
        links.push({ source, target: targetId });
      }
    }
  }

  return links;
}

function buildOnaMetricsFromLinks(
  participants: readonly GraphParticipant[],
  links: readonly GraphLink[],
  topLeaders = 2,
  topReciprocity = 3,
): GroupOnaMetrics {
  const nameById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const networkDensity = calculateNetworkDensity(participants.length, links);
  const nodes = buildGraphNodes(participants, links);
  const indegreeMap = calculateIndegree(links);

  const influenceLeaders = Object.entries(indegreeMap)
    .map(([id, votes]) => ({
      id,
      name: nameById.get(id) ?? id,
      votes,
    }))
    .sort(
      (a, b) =>
        b.votes - a.votes || a.name.localeCompare(b.name, "es"),
    )
    .slice(0, topLeaders);

  const reciprocityMap = calculateReciprocity(links);
  const reciprocityLeaders = Object.entries(reciprocityMap)
    .map(([id, mutualConnections]) => ({
      id,
      name: nameById.get(id) ?? id,
      mutualConnections,
    }))
    .filter((leader) => leader.mutualConnections > 0)
    .sort(
      (a, b) =>
        b.mutualConnections - a.mutualConnections ||
        a.name.localeCompare(b.name, "es"),
    )
    .slice(0, topReciprocity);

  const isolatedParticipants = calculateIsolation(participants, indegreeMap);
  const silos = detectNetworkSilos(participants, links);

  return {
    networkDensity,
    links: [...links],
    nodes,
    influenceLeaders,
    reciprocityLeaders,
    isolatedParticipants,
    silos,
    leaderNames: influenceLeaders.map((leader) => leader.name),
    isolatedNames: isolatedParticipants.map((participant) => participant.name),
  };
}

function sociogramAnswerKeys(
  question: QuestionnaireQuestion,
): string[] {
  const semanticKey = resolveSociogramAnswerKey(question);
  return semanticKey === question.id
    ? [semanticKey]
    : [semanticKey, question.id];
}

function countSilosBarriers(
  responses: readonly QuestionnaireResponseRow[],
  question: QuestionnaireQuestion,
  participants: readonly GraphParticipant[],
  participantIds: ReadonlySet<string>,
): { silosCount: number; silosBarriers: NetworkSilo[] } {
  const answerKeys = sociogramAnswerKeys(question);
  const links = buildLinksFromSociogramQuestion(
    responses,
    answerKeys,
    participantIds,
  );
  const silosBarriers = detectNetworkSilos(participants, links);

  if (silosBarriers.length > 0) {
    return { silosCount: silosBarriers.length, silosBarriers };
  }

  const uniqueBarriers = new Set<string>();
  for (const response of responses) {
    for (const targetId of extractSociogramSelections(response.answers, answerKeys)) {
      if (participantIds.has(targetId)) {
        uniqueBarriers.add(targetId);
      }
    }
  }

  return {
    silosCount: uniqueBarriers.size,
    silosBarriers: [],
  };
}

export function computeElevateXTeamAnalytics(input: {
  participants: readonly { id: string | number; name: string }[];
  responses: readonly QuestionnaireResponseRow[];
  questions: readonly QuestionnaireQuestion[];
}): ElevateXTeamAnalytics {
  const graphParticipants: GraphParticipant[] = input.participants.map(
    (participant) => ({
      id: String(participant.id),
      name: participant.name,
    }),
  );
  const participantIds = new Set(graphParticipants.map((participant) => participant.id));

  const { averages, responseCount } = computeElevateXDimensionAverages(
    input.responses,
  );

  const alineacionQuestion = findSociogramQuestionByTopic(
    input.questions,
    "alineacion",
  );
  const silosQuestion =
    findSociogramQuestionByTopic(input.questions, "silos") ??
    findSociogramQuestionByTopic(input.questions, "silo");

  const alineacionLinks = alineacionQuestion
    ? buildLinksFromSociogramQuestion(
        input.responses,
        sociogramAnswerKeys(alineacionQuestion),
        participantIds,
      )
    : buildGraphLinksFromResponses(graphParticipants, input.responses);

  const onaMetrics = buildOnaMetricsFromLinks(graphParticipants, alineacionLinks);

  const { silosCount, silosBarriers } = silosQuestion
    ? countSilosBarriers(
        input.responses,
        silosQuestion,
        graphParticipants,
        participantIds,
      )
    : { silosCount: onaMetrics.silos.length, silosBarriers: onaMetrics.silos };

  return {
    elevatexAverages: averages,
    elevatexResponseCount: responseCount,
    alineacionQuestionId: alineacionQuestion?.id ?? null,
    silosQuestionId: silosQuestion?.id ?? null,
    silosCount,
    silosBarriers,
    onaMetrics,
    networkDensity: onaMetrics.networkDensity,
    links: onaMetrics.links,
    nodes: onaMetrics.nodes,
    influenceLeaders: onaMetrics.influenceLeaders,
    reciprocityLeaders: onaMetrics.reciprocityLeaders,
    isolatedParticipants: onaMetrics.isolatedParticipants,
    leaderNames: onaMetrics.leaderNames,
    isolatedNames: onaMetrics.isolatedNames,
  };
}
