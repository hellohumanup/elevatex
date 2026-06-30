import {
  buildGraphLinksFromResponses,
  calculateNetworkDensity,
  type GraphLink,
} from "@/lib/mathEngine";

export type NetworkParticipantInput = {
  id: string | number;
  name: string;
};

export type NetworkResponseInput = {
  participant_id: string | number;
  answers: unknown;
};

export type ParticipantNetworkMetrics = {
  id: string;
  name: string;
  inDegree: number;
  outDegree: number;
  /** Centralidad relativa simple: inDegree / máximo inDegree del equipo (0–1). */
  centralityIndex: number;
};

export type TeamNetworkMetrics = {
  nodeCount: number;
  linkCount: number;
  maxPossibleLinks: number;
  /** Conexiones reales / conexiones posibles (0–1). */
  density: number;
  densityPercent: number;
  /** Vínculos recíprocos / conexiones totales (0–1). */
  reciprocity: number;
  reciprocityPercent: number;
  mutualLinkCount: number;
};

export type NetworkMetricsResult = {
  participants: ParticipantNetworkMetrics[];
  team: TeamNetworkMetrics;
};

function buildDegreeMaps(
  participants: readonly NetworkParticipantInput[],
  links: readonly GraphLink[],
): {
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
} {
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const participant of participants) {
    const id = String(participant.id);
    inDegree.set(id, 0);
    outDegree.set(id, 0);
  }

  for (const link of links) {
    inDegree.set(link.target, (inDegree.get(link.target) ?? 0) + 1);
    outDegree.set(link.source, (outDegree.get(link.source) ?? 0) + 1);
  }

  return { inDegree, outDegree };
}

function calculateTeamReciprocity(links: readonly GraphLink[]): {
  reciprocity: number;
  reciprocityPercent: number;
  mutualLinkCount: number;
} {
  if (links.length === 0) {
    return { reciprocity: 0, reciprocityPercent: 0, mutualLinkCount: 0 };
  }

  const linkSet = new Set(
    links.map((link) => `${link.source}|${link.target}`),
  );

  let mutualLinkCount = 0;

  for (const link of links) {
    if (linkSet.has(`${link.target}|${link.source}`)) {
      mutualLinkCount += 1;
    }
  }

  const reciprocity = mutualLinkCount / links.length;

  return {
    reciprocity,
    reciprocityPercent: Math.round(reciprocity * 100),
    mutualLinkCount,
  };
}

function calculateCentralityIndex(
  inDegree: number,
  maxInDegree: number,
): number {
  if (maxInDegree <= 0 || inDegree <= 0) {
    return 0;
  }

  return Number((inDegree / maxInDegree).toFixed(4));
}

/**
 * Calcula métricas ONA a partir de participantes y respuestas sociométricas.
 * `answers` puede ser un array de IDs o un JSONB objeto con arrays de IDs.
 */
export function calculateNetworkMetrics(
  participants: NetworkParticipantInput[],
  responses: NetworkResponseInput[],
): NetworkMetricsResult {
  const roster = participants.map((participant) => ({
    id: String(participant.id),
    name: participant.name,
  }));

  const links = buildGraphLinksFromResponses(participants, responses);
  const { inDegree, outDegree } = buildDegreeMaps(participants, links);

  const maxInDegree = Math.max(
    ...roster.map((participant) => inDegree.get(participant.id) ?? 0),
    0,
  );

  const participantMetrics: ParticipantNetworkMetrics[] = roster
    .map((participant) => {
      const votesReceived = inDegree.get(participant.id) ?? 0;
      const votesCast = outDegree.get(participant.id) ?? 0;

      return {
        id: participant.id,
        name: participant.name,
        inDegree: votesReceived,
        outDegree: votesCast,
        centralityIndex: calculateCentralityIndex(votesReceived, maxInDegree),
      };
    })
    .sort(
      (a, b) =>
        b.inDegree - a.inDegree ||
        b.centralityIndex - a.centralityIndex ||
        a.name.localeCompare(b.name, "es"),
    );

  const densityMetrics = calculateNetworkDensity(roster.length, links);
  const reciprocityMetrics = calculateTeamReciprocity(links);

  return {
    participants: participantMetrics,
    team: {
      nodeCount: densityMetrics.nodeCount,
      linkCount: densityMetrics.linkCount,
      maxPossibleLinks: densityMetrics.maxPossibleLinks,
      density: densityMetrics.density,
      densityPercent: densityMetrics.densityPercent,
      reciprocity: reciprocityMetrics.reciprocity,
      reciprocityPercent: reciprocityMetrics.reciprocityPercent,
      mutualLinkCount: reciprocityMetrics.mutualLinkCount,
    },
  };
}
