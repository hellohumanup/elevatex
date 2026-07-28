/**
 * ElevateX — motor ONA (Organizational Network Analysis).
 *
 * Procesa `public.responses` (nombramientos ONA en `answers`: influencia, comunicacion)
 * y devuelve métricas agrupadas en las 3 dimensiones del producto:
 *
 * - Talento   → centralidad de grado (in/out), líderes informales, aislados, saturados
 * - Cultura   → densidad de red y reciprocidad (cohesión / confianza)
 * - Dirección → silos (componentes conexas) e índice de fragmentación
 */

import {
  buildGraphLinksFromResponses,
  calculateIndegree,
  calculateIsolation,
  calculateNetworkDensity,
  calculateNetworkReciprocity,
  calculateReciprocity,
  detectNetworkSilos,
  type GraphLink,
  type GraphParticipant,
  type IndividualNetworkReciprocity,
  type IsolatedParticipant,
  type NetworkDensity,
  type NetworkReciprocityResult,
  type NetworkSilo,
} from "@/lib/mathEngine";

export type ElevateXResponseRow = {
  participant_id: string | number | null;
  answers: unknown;
};

export type TalentProfileKind =
  | "informal_leader"
  | "connector"
  | "saturated"
  | "isolated"
  | "balanced";

export type TalentParticipantMetrics = {
  id: string;
  name: string;
  inDegree: number;
  outDegree: number;
  totalDegree: number;
  /** In-degree normalizado respecto al máximo del equipo (0–1). */
  centralityIndex: number;
  /**
   * % de votos emitidos o recibidos que están correspondidos (0–100).
   * Campo aditivo — clientes legacy pueden ignorarlo.
   */
  reciprocityPercent: number;
  profile: TalentProfileKind;
};

export type ElevateXTalentDimension = {
  participants: TalentParticipantMetrics[];
  informalLeaders: Array<{ id: string; name: string; inDegree: number }>;
  isolatedParticipants: IsolatedParticipant[];
  saturatedParticipants: Array<{
    id: string;
    name: string;
    inDegree: number;
    outDegree: number;
    totalDegree: number;
  }>;
  averageInDegree: number;
  averageOutDegree: number;
};

export type ElevateXCulturaDimension = {
  networkDensity: NetworkDensity;
  reciprocityRatio: number;
  reciprocityPercent: number;
  mutualLinkCount: number;
  /** Pares no ordenados con voto mutuo A↔B. */
  mutualPairCount: number;
  /** Desglose completo del motor `calculateNetworkReciprocity`. */
  networkReciprocity: NetworkReciprocityResult;
  /** id → % de reciprocidad individual. */
  individualReciprocityPercent: Readonly<Record<string, number>>;
  /** id → métricas individuales de reciprocidad. */
  individualReciprocity: Readonly<Record<string, IndividualNetworkReciprocity>>;
  /** Índice compuesto 0–100: 60 % densidad + 40 % reciprocidad. */
  cohesionIndex: number;
  /** Proxy de confianza relacional (reciprocidad normalizada 0–100). */
  trustIndex: number;
};

export type ElevateXDireccionDimension = {
  silos: NetworkSilo[];
  siloCount: number;
  largestSiloSize: number;
  /** 1 − (tamaño del mayor silo / N). Alto = más fragmentación entre subgrupos. */
  fragmentationIndex: number;
  /** Proxy de modularidad: fracción de nodos dentro de silos detectados (≥ 2 miembros). */
  modularityProxy: number;
};

export type ElevateXOnaDiagnostics = {
  groupSize: number;
  responseCount: number;
  linkCount: number;
  talento: ElevateXTalentDimension;
  cultura: ElevateXCulturaDimension;
  direccion: ElevateXDireccionDimension;
};

function buildDegreeMaps(
  participants: readonly GraphParticipant[],
  links: readonly GraphLink[],
): {
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
} {
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const participant of participants) {
    inDegree.set(participant.id, 0);
    outDegree.set(participant.id, 0);
  }

  for (const link of links) {
    inDegree.set(link.target, (inDegree.get(link.target) ?? 0) + 1);
    outDegree.set(link.source, (outDegree.get(link.source) ?? 0) + 1);
  }

  return { inDegree, outDegree };
}

function computeArithmeticMean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function classifyTalentProfile(input: {
  inDegree: number;
  outDegree: number;
  totalDegree: number;
  maxInDegree: number;
  isLeader: boolean;
  isIsolated: boolean;
  isSaturated: boolean;
}): TalentProfileKind {
  if (input.isIsolated) {
    return "isolated";
  }

  if (input.isLeader) {
    return "informal_leader";
  }

  if (input.isSaturated) {
    return "saturated";
  }

  if (input.outDegree > input.inDegree && input.outDegree >= 2) {
    return "connector";
  }

  return "balanced";
}

function buildTalentDimension(
  participants: readonly GraphParticipant[],
  links: readonly GraphLink[],
  individualReciprocityPercent: Readonly<Record<string, number>>,
): ElevateXTalentDimension {
  const { inDegree, outDegree } = buildDegreeMaps(participants, links);
  const indegreeMap = calculateIndegree(links);
  const isolatedParticipants = calculateIsolation(participants, indegreeMap);

  const isolatedIds = new Set(
    isolatedParticipants.map((participant) => participant.id),
  );

  const inDegrees = participants.map(
    (participant) => inDegree.get(participant.id) ?? 0,
  );
  const outDegrees = participants.map(
    (participant) => outDegree.get(participant.id) ?? 0,
  );
  const totalDegrees = participants.map(
    (participant, index) => inDegrees[index] + outDegrees[index],
  );

  const averageInDegree = computeArithmeticMean(inDegrees);
  const averageOutDegree = computeArithmeticMean(outDegrees);
  const averageTotalDegree = computeArithmeticMean(totalDegrees);
  const maxInDegree = Math.max(...inDegrees, 0);

  const leaderThreshold = Math.max(2, Math.ceil(participants.length * 0.15));
  const sortedByIn = [...participants].sort(
    (a, b) =>
      (inDegree.get(b.id) ?? 0) - (inDegree.get(a.id) ?? 0) ||
      a.name.localeCompare(b.name, "es"),
  );
  const leaderIds = new Set(
    sortedByIn
      .filter((participant) => (inDegree.get(participant.id) ?? 0) >= leaderThreshold)
      .slice(0, Math.max(2, Math.ceil(participants.length * 0.2)))
      .map((participant) => participant.id),
  );

  const participantMetrics: TalentParticipantMetrics[] = participants
    .map((participant) => {
      const votesIn = inDegree.get(participant.id) ?? 0;
      const votesOut = outDegree.get(participant.id) ?? 0;
      const total = votesIn + votesOut;
      const isIsolated = isolatedIds.has(participant.id);
      const isSaturated =
        !isIsolated &&
        total >= averageTotalDegree * 1.35 &&
        votesIn >= Math.max(2, averageInDegree);
      const isLeader = leaderIds.has(participant.id) && votesIn > 0;

      return {
        id: participant.id,
        name: participant.name,
        inDegree: votesIn,
        outDegree: votesOut,
        totalDegree: total,
        centralityIndex:
          maxInDegree > 0
            ? Number((votesIn / maxInDegree).toFixed(4))
            : 0,
        reciprocityPercent:
          individualReciprocityPercent[participant.id] ?? 0,
        profile: classifyTalentProfile({
          inDegree: votesIn,
          outDegree: votesOut,
          totalDegree: total,
          maxInDegree,
          isLeader,
          isIsolated,
          isSaturated,
        }),
      };
    })
    .sort(
      (a, b) =>
        b.inDegree - a.inDegree ||
        b.outDegree - a.outDegree ||
        a.name.localeCompare(b.name, "es"),
    );

  const informalLeaders = participantMetrics
    .filter((participant) => participant.profile === "informal_leader")
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
      inDegree: participant.inDegree,
    }));

  const saturatedParticipants = participantMetrics
    .filter((participant) => participant.profile === "saturated")
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
      inDegree: participant.inDegree,
      outDegree: participant.outDegree,
      totalDegree: participant.totalDegree,
    }));

  return {
    participants: participantMetrics,
    informalLeaders,
    isolatedParticipants,
    saturatedParticipants,
    averageInDegree: Number(averageInDegree.toFixed(2)),
    averageOutDegree: Number(averageOutDegree.toFixed(2)),
  };
}

function buildCulturaDimension(
  nodeCount: number,
  links: readonly GraphLink[],
  participantIds: readonly string[],
): ElevateXCulturaDimension {
  const networkDensity = calculateNetworkDensity(nodeCount, links);
  const networkReciprocity = calculateNetworkReciprocity(links, participantIds);

  const densityScore = networkDensity.densityPercent;
  const reciprocityScore = networkReciprocity.reciprocityPercent;
  const cohesionIndex =
    Math.round((densityScore * 0.6 + reciprocityScore * 0.4) * 100) / 100;

  return {
    networkDensity,
    reciprocityRatio: networkReciprocity.reciprocityRatio,
    reciprocityPercent: networkReciprocity.reciprocityPercent,
    mutualLinkCount: networkReciprocity.mutualLinkCount,
    mutualPairCount: networkReciprocity.mutualPairCount,
    networkReciprocity,
    individualReciprocityPercent:
      networkReciprocity.individualReciprocityPercent,
    individualReciprocity: networkReciprocity.byParticipant,
    cohesionIndex,
    trustIndex: reciprocityScore,
  };
}

function buildDireccionDimension(
  participants: readonly GraphParticipant[],
  links: readonly GraphLink[],
): ElevateXDireccionDimension {
  const silos = detectNetworkSilos(participants, links);
  const nodeCount = participants.length;
  const nodesInSilos = new Set(silos.flatMap((silo) => silo.memberIds));
  const largestSiloSize = silos.reduce(
    (max, silo) => Math.max(max, silo.size),
    0,
  );

  const fragmentationIndex =
    nodeCount > 0
      ? Number((1 - largestSiloSize / nodeCount).toFixed(4))
      : 0;

  const modularityProxy =
    nodeCount > 0
      ? Number((nodesInSilos.size / nodeCount).toFixed(4))
      : 0;

  return {
    silos,
    siloCount: silos.length,
    largestSiloSize,
    fragmentationIndex,
    modularityProxy,
  };
}

/**
 * Calcula el diagnóstico ONA completo de un equipo a partir de participantes
 * y filas de `public.responses`.
 */
export function computeElevateXOnaDiagnostics(
  participantsInput: readonly { id: string | number; name: string }[],
  responses: readonly ElevateXResponseRow[],
): ElevateXOnaDiagnostics {
  const participants: GraphParticipant[] = participantsInput.map((participant) => ({
    id: String(participant.id),
    name: participant.name,
  }));

  const graphResponses = responses.map((response) => ({
    participant_id: response.participant_id,
    answers: response.answers,
  }));

  const links = buildGraphLinksFromResponses(participants, graphResponses);
  const responseCount = graphResponses.filter(
    (response) =>
      response.participant_id !== null && response.participant_id !== undefined,
  ).length;

  const participantIds = participants.map((participant) => participant.id);
  const cultura = buildCulturaDimension(
    participants.length,
    links,
    participantIds,
  );

  return {
    groupSize: participants.length,
    responseCount,
    linkCount: links.length,
    talento: buildTalentDimension(
      participants,
      links,
      cultura.individualReciprocityPercent,
    ),
    cultura,
    direccion: buildDireccionDimension(participants, links),
  };
}

/** Mapa de reciprocidad por participante (conexiones mutuas). */
export function computeParticipantReciprocityMap(
  links: readonly GraphLink[],
): Record<string, number> {
  return calculateReciprocity(links);
}
