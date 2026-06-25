import {
  buildGraphNodes,
  calculateIndegree,
  calculateIsolation,
  calculateNetworkDensity,
  calculateReciprocity,
  detectNetworkSilos,
  type GraphLink,
  type GraphParticipant,
  type IsolatedParticipant,
  type NetworkDensity,
  type NetworkSilo,
} from "@/lib/mathEngine";
import {
  buildSurveyNetworkData,
  buildVoteDetailsFromSurveyRows,
  type NetworkLayer,
  type SurveyResponseRow,
  type SurveyVoteDetail,
} from "@/lib/surveyResponseGraph";

export type { NetworkLayer };
export { NETWORK_LAYER_OPTIONS } from "@/lib/surveyResponseGraph";

export type InfluenceLeader = {
  id: string;
  name: string;
  votes: number;
};

export type ReciprocityLeader = {
  id: string;
  name: string;
  mutualConnections: number;
};

export type RankingEntry = {
  id: string;
  name: string;
  votes: number;
};

export type OrganizationalNetworkAnalysis = {
  participants: GraphParticipant[];
  links: GraphLink[];
  nodes: ReturnType<typeof buildSurveyNetworkData>["nodes"];
  responseCount: number;
  networkDensity: NetworkDensity;
  networkSilos: NetworkSilo[];
  influenceLeaders: InfluenceLeader[];
  reciprocityLeaders: ReciprocityLeader[];
  isolatedParticipants: IsolatedParticipant[];
  ranking: RankingEntry[];
  voteDetails: SurveyVoteDetail[];
};

export function buildInfluenceLeaders(
  links: GraphLink[],
  nameById: Map<string, string>,
): InfluenceLeader[] {
  const indegree = calculateIndegree(links);

  return Object.entries(indegree)
    .map(([id, votes]) => ({
      id,
      name: nameById.get(id) ?? id,
      votes,
    }))
    .sort(
      (a, b) =>
        b.votes - a.votes || a.name.localeCompare(b.name, "es"),
    )
    .slice(0, 3);
}

export function buildReciprocityLeaders(
  links: GraphLink[],
  nameById: Map<string, string>,
): ReciprocityLeader[] {
  const reciprocity = calculateReciprocity(links);

  return Object.entries(reciprocity)
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
    .slice(0, 3);
}

export function buildRankingFromLinks(
  participants: readonly GraphParticipant[],
  links: readonly GraphLink[],
): RankingEntry[] {
  const indegree = calculateIndegree(links);

  return participants
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
      votes: indegree[participant.id] ?? 0,
    }))
    .sort(
      (a, b) =>
        b.votes - a.votes || a.name.localeCompare(b.name, "es"),
    );
}

/** Calcula el ONA completo a partir de filas reales de survey_responses. */
export function computeOnaFromSurveyRows(
  rows: readonly SurveyResponseRow[],
  layer: NetworkLayer = "all",
): OrganizationalNetworkAnalysis {
  const network = buildSurveyNetworkData(rows, layer);
  const nameById = new Map(
    network.participants.map((participant) => [
      participant.id,
      participant.name,
    ]),
  );
  const indegreeMap = calculateIndegree(network.links);

  return {
    participants: network.participants,
    links: network.links,
    nodes: network.nodes,
    responseCount: network.responseCount,
    networkDensity: calculateNetworkDensity(
      network.participants.length,
      network.links,
    ),
    networkSilos: detectNetworkSilos(network.participants, network.links),
    influenceLeaders: buildInfluenceLeaders(network.links, nameById),
    reciprocityLeaders: buildReciprocityLeaders(network.links, nameById),
    isolatedParticipants: calculateIsolation(network.participants, indegreeMap),
    ranking: buildRankingFromLinks(network.participants, network.links),
    voteDetails: buildVoteDetailsFromSurveyRows(rows),
  };
}
