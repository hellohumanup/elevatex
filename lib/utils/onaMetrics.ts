/**
 * Métricas ONA (Organizational Network Analysis) — capa matemática pura.
 *
 * Modelo de grafo dirigido G = (V, E):
 *   • V = roster de participantes del equipo
 *   • E = arcos dirigidos voter → nominee (cada nominación es un arco)
 *
 * Convenciones:
 *   • Se excluyen auto-nominaciones (v → v).
 *   • Solo se consideran aristas entre miembros del roster.
 *   • Arcos paralelos (p. ej. influencia + comunicación) se acumulan.
 */

/** Participante mínimo del roster del equipo. */
export type OnaParticipant = {
  id: string;
  name: string;
};

/** Voto dirigido: un respondiente emite una o más nominaciones. */
export type OnaVote = {
  /** ID del votante (quien responde el cuestionario). */
  voterId: string;
  /** IDs de los participantes nominados por ese votante. */
  nomineeIds: readonly string[];
};

/** Arco dirigido normalizado del sociograma. */
export type DirectedEdge = {
  source: string;
  target: string;
};

/** Entrada común para métricas derivadas de votos crudos. */
export type OnaMetricsInput = {
  participants: readonly OnaParticipant[];
  votes: readonly OnaVote[];
};

/** Puntuación de centralidad de grado entrante (indegree) por persona. */
export type IndegreeCentralityScore = {
  participantId: string;
  participantName: string;
  /** Número total de nominaciones recibidas (grado entrante). */
  nominationsReceived: number;
  /**
   * Score normalizado en [0, 1] respecto al máximo teórico (N − 1).
   * Útil para comparar influencia relativa dentro del equipo.
   */
  normalizedScore: number;
};

/** Resultado agregado de centralidad de grado entrante. */
export type IndegreeCentralityResult = {
  scores: readonly IndegreeCentralityScore[];
  /** Mapa id → nominaciones recibidas (incluye ceros del roster completo). */
  byParticipantId: Readonly<Record<string, number>>;
  /** Participantes ordenados por nominaciones (desc), útil para "Líderes de Influencia". */
  influenceLeaders: readonly IndegreeCentralityScore[];
};

/**
 * Densidad de red en grafo dirigido:
 *   D = L / (N × (N − 1))
 *
 * Donde:
 *   N = |V|  (tamaño del roster)
 *   L = |E|  (número de arcos dirigidos, con paralelos incluidos)
 */
export type NetworkDensityResult = {
  nodeCount: number;
  arcCount: number;
  maxPossibleArcs: number;
  density: number;
  densityPercent: number;
};

function normalizeParticipantId(id: string): string {
  return id.trim();
}

/**
 * Construye la lista de arcos dirigidos a partir del roster y los votos.
 * Función pura reutilizable por todas las métricas del módulo.
 */
export function buildDirectedEdges(input: OnaMetricsInput): DirectedEdge[] {
  const roster = new Set(
    input.participants.map((participant) =>
      normalizeParticipantId(participant.id),
    ),
  );

  const edges: DirectedEdge[] = [];

  for (const vote of input.votes) {
    const source = normalizeParticipantId(vote.voterId);

    if (!roster.has(source)) {
      continue;
    }

    for (const rawTarget of vote.nomineeIds) {
      const target = normalizeParticipantId(rawTarget);

      if (!target || source === target || !roster.has(target)) {
        continue;
      }

      edges.push({ source, target });
    }
  }

  return edges;
}

/**
 * Calcula la centralidad de grado entrante (indegree centrality) de cada persona.
 *
 * En ONA sociométrica, el indegree de un nodo v equivale al número de veces
 * que v fue nominado por otros miembros del equipo. Valores altos señalan
 * "Líderes de Influencia" informales.
 */
export function calculateIndegreeCentrality(
  input: OnaMetricsInput,
): IndegreeCentralityResult {
  const edges = buildDirectedEdges(input);
  const nameById = new Map(
    input.participants.map((participant) => [
      normalizeParticipantId(participant.id),
      participant.name,
    ]),
  );

  const byParticipantId: Record<string, number> = {};

  for (const participant of input.participants) {
    const id = normalizeParticipantId(participant.id);
    byParticipantId[id] = 0;
  }

  for (const edge of edges) {
    byParticipantId[edge.target] = (byParticipantId[edge.target] ?? 0) + 1;
  }

  const maxTheoreticalIndegree = Math.max(input.participants.length - 1, 0);

  const scores: IndegreeCentralityScore[] = input.participants.map(
    (participant) => {
      const participantId = normalizeParticipantId(participant.id);
      const nominationsReceived = byParticipantId[participantId] ?? 0;

      return {
        participantId,
        participantName: participant.name,
        nominationsReceived,
        normalizedScore:
          maxTheoreticalIndegree > 0
            ? nominationsReceived / maxTheoreticalIndegree
            : 0,
      };
    },
  );

  const influenceLeaders = [...scores]
    .filter((score) => score.nominationsReceived > 0)
    .sort(
      (left, right) =>
        right.nominationsReceived - left.nominationsReceived ||
        left.participantName.localeCompare(right.participantName, "es"),
    );

  return {
    scores,
    byParticipantId,
    influenceLeaders,
  };
}

/**
 * Calcula la densidad de la red dirigida del equipo.
 *
 * Fórmula estándar para grafos dirigidos sin auto-bucles:
 *   D = L / (N × (N − 1))
 *
 * Interpretación:
 *   • D = 0   → sin conexiones
 *   • D = 1   → todos nominan a todos (red completa dirigida)
 *   • Valores intermedios indican qué tan interconectado está el equipo.
 */
export function calculateNetworkDensity(
  input: OnaMetricsInput,
): NetworkDensityResult;
export function calculateNetworkDensity(
  nodeCount: number,
  edges: readonly DirectedEdge[],
): NetworkDensityResult;
export function calculateNetworkDensity(
  inputOrNodeCount: OnaMetricsInput | number,
  maybeEdges?: readonly DirectedEdge[],
): NetworkDensityResult {
  const edges =
    typeof inputOrNodeCount === "number"
      ? [...(maybeEdges ?? [])]
      : buildDirectedEdges(inputOrNodeCount);

  const nodeCount =
    typeof inputOrNodeCount === "number"
      ? inputOrNodeCount
      : inputOrNodeCount.participants.length;

  const arcCount = edges.length;
  const maxPossibleArcs = nodeCount > 1 ? nodeCount * (nodeCount - 1) : 0;
  const density = maxPossibleArcs > 0 ? arcCount / maxPossibleArcs : 0;
  const densityPercent = Math.round(density * 100 * 100) / 100;

  return {
    nodeCount,
    arcCount,
    maxPossibleArcs,
    density,
    densityPercent,
  };
}
