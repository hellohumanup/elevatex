/** Enlace dirigido: `source` vota o señala a `target`. */
export type GraphLink = {
  source: string;
  target: string;
  /**
   * Peso del voto según la posición en la dinámica.
   * Si se omite, se trata como 1 (arco plano / legado).
   */
  weight?: number;
};

/** Nodo del sociograma con métricas de influencia. */
export type SociogramNode = {
  id: string;
  name: string;
  /** Indegree plano: número de conexiones entrantes (cada arco cuenta 1). */
  votes: number;
  /** Indegree ponderado: suma de pesos de las conexiones entrantes. */
  weightedVotes?: number;
};

/** Mapa de indegree: ID del nodo → número de votos/conexiones entrantes recibidas. */
export type IndegreeMap = Readonly<Record<string, number>>;

/**
 * Mapa de indegree ponderado: ID del nodo → suma de pesos recibidos.
 * Voto 1 → 1.0 · Voto 2 → 0.7 · Voto 3 → 0.4
 */
export type WeightedIndegreeMap = Readonly<Record<string, number>>;

/** Nominación ponderada extraída del JSONB `answers`. */
export type WeightedNomination = {
  targetId: string;
  /** Peso según posición (1-based index → 1.0 / 0.7 / 0.4). */
  weight: number;
  /** Posición 1-based en la lista de la pregunta ONA. */
  position: number;
  /** Canal de origen (`influencia`, `comunicacion`, …). */
  channel: string;
};

/**
 * Pesos por posición de voto en la dinámica ONA.
 * Índice 0 = Voto 1, índice 1 = Voto 2, índice 2 = Voto 3.
 */
export const VOTE_POSITION_WEIGHTS = [1.0, 0.7, 0.4] as const;

/** Devuelve el peso de un voto según su índice 0-based en la lista. */
export function getVotePositionWeight(positionIndex: number): number {
  if (!Number.isFinite(positionIndex) || positionIndex < 0) {
    return 0;
  }

  const index = Math.floor(positionIndex);

  if (index < VOTE_POSITION_WEIGHTS.length) {
    return VOTE_POSITION_WEIGHTS[index];
  }

  return VOTE_POSITION_WEIGHTS[VOTE_POSITION_WEIGHTS.length - 1];
}

/** Mapa de reciprocidad: ID del colaborador → conexiones mutuas con otros miembros. */
export type ReciprocityMap = Readonly<Record<string, number>>;

/**
 * Reciprocidad individual: proporción de aristas incidentes (emitidas o recibidas)
 * que tienen arco inverso.
 */
export type IndividualNetworkReciprocity = {
  /** Pares no ordenados {A,B} mutuos en los que participa el nodo. */
  mutualPairs: number;
  /** Aristas dirigidas incidentes con reverse existente. */
  reciprocatedEdgeCount: number;
  /** Aristas dirigidas incidentes (out + in, topología única en la matriz). */
  incidentEdgeCount: number;
  /** reciprocatedEdgeCount / incidentEdgeCount (0–1). */
  reciprocityRatio: number;
  /** Porcentaje 0–100. */
  reciprocityPercent: number;
};

/**
 * Reciprocidad global de red + desglose por participante.
 * Índice global = aristas recíprocas / aristas activas (matriz de adyacencia).
 */
export type NetworkReciprocityResult = {
  /** Pares {A,B} con A→B y B→A. */
  mutualPairCount: number;
  /**
   * Aristas dirigidas que forman parte de un par recíproco.
   * Equivale a `mutualLinkCount` en el payload ElevateX.
   */
  reciprocalEdgeCount: number;
  /** Total de aristas dirigidas activas (celdas > 0 en la matriz). */
  activeEdgeCount: number;
  /** reciprocalEdgeCount / activeEdgeCount (0–1). */
  reciprocityRatio: number;
  /** Porcentaje global 0–100. */
  reciprocityPercent: number;
  /** Alias de reciprocalEdgeCount (compatibilidad ElevateX / networkMetrics). */
  mutualLinkCount: number;
  byParticipant: Readonly<Record<string, IndividualNetworkReciprocity>>;
  /** Atajo id → reciprocityPercent individual. */
  individualReciprocityPercent: Readonly<Record<string, number>>;
};

/** Matriz de adyacencia dirigida: source → (target → peso de arcos). */
export type DirectedAdjacencyMatrix = ReadonlyMap<string, ReadonlyMap<string, number>>;

/** Representación serializable de la matriz para logs de depuración. */
export type SerializableAdjacencyMatrix = Readonly<
  Record<string, Readonly<Record<string, number>>>
>;

/** Colaborador sin conexiones entrantes en la red. */
export type IsolatedParticipant = {
  id: string;
  name: string;
};

/** Métrica de densidad de la red sociométrica (0–100 %). */
export type NetworkDensity = {
  nodeCount: number;
  linkCount: number;
  maxPossibleLinks: number;
  density: number;
  densityPercent: number;
};

/** Subgrupo desconectado o débilmente acoplado dentro de la red. */
export type NetworkSilo = {
  id: string;
  memberIds: string[];
  memberNames: string[];
  size: number;
};

/** Participante mínimo para construir el grafo. */
export type GraphParticipant = {
  id: string;
  name: string;
};

/** Mapas para resolver IDs de participantes a nombres legibles. */
export type ParticipantNameLookup = {
  nameById: Map<string, string>;
  idByNormalizedName: Map<string, string>;
};

const ONA_INFLUENCE_KEYS = ["influencia", "influence"] as const;
const ONA_COMMUNICATION_KEYS = ["comunicacion", "communication"] as const;
const ONA_CHOICE_KEYS = [...ONA_INFLUENCE_KEYS, ...ONA_COMMUNICATION_KEYS] as const;

const RESPONSE_METADATA_KEYS = new Set([
  "respondent_name",
  "respondentName",
]);

/** Normaliza un ID de participante para comparaciones consistentes. */
export function normalizeParticipantId(id: string): string {
  return id.trim();
}

/** Normaliza un nombre para búsqueda insensible a acentos y mayúsculas. */
export function normalizeParticipantName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Construye mapas bidireccionales id ↔ nombre desde la lista de participantes. */
export function buildParticipantNameLookup(
  participants: readonly { id: string | number; name: string }[],
): ParticipantNameLookup {
  const nameById = new Map<string, string>();
  const idByNormalizedName = new Map<string, string>();

  for (const participant of participants) {
    const id = normalizeParticipantId(String(participant.id));
    nameById.set(id, participant.name);

    const normalizedName = normalizeParticipantName(participant.name);
    if (normalizedName.length > 0) {
      idByNormalizedName.set(normalizedName, id);
    }
  }

  return { nameById, idByNormalizedName };
}

/** Resuelve un ID (o nombre legado) al nombre visible del colaborador. */
export function resolveParticipantDisplayName(
  idOrName: string,
  lookup: ParticipantNameLookup,
): string {
  const normalizedId = normalizeParticipantId(idOrName);
  if (!normalizedId) {
    return "Desconocido";
  }

  const directMatch = lookup.nameById.get(normalizedId);
  if (directMatch) {
    return directMatch;
  }

  for (const [participantId, participantName] of lookup.nameById) {
    if (participantId.toLowerCase() === normalizedId.toLowerCase()) {
      return participantName;
    }
  }

  const mappedId = lookup.idByNormalizedName.get(
    normalizeParticipantName(normalizedId),
  );
  if (mappedId) {
    const resolvedName = lookup.nameById.get(mappedId);
    if (resolvedName) {
      return resolvedName;
    }
  }

  if (!/^[0-9a-f-]{36}$/i.test(normalizedId)) {
    return normalizedId;
  }

  return "Desconocido";
}

function coalesceToParticipantId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (value && typeof value === "object" && "id" in value) {
    return coalesceToParticipantId((value as { id?: unknown }).id);
  }

  return null;
}

function collectParticipantIdsFromArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids: string[] = [];

  for (const item of value) {
    const id = coalesceToParticipantId(item);
    if (id) {
      ids.push(id);
    }
  }

  return ids;
}

function appendUniqueIds(target: string[], source: readonly string[]): void {
  const seen = new Set(target);

  for (const id of source) {
    if (!seen.has(id)) {
      seen.add(id);
      target.push(id);
    }
  }
}

function parseWeightedAnswersRecord(
  record: Record<string, unknown>,
): WeightedNomination[] {
  const nominations: WeightedNomination[] = [];

  for (const key of ONA_CHOICE_KEYS) {
    if (!(key in record)) {
      continue;
    }

    const ids = collectParticipantIdsFromArray(record[key]);

    ids.forEach((targetId, positionIndex) => {
      nominations.push({
        targetId,
        weight: getVotePositionWeight(positionIndex),
        position: positionIndex + 1,
        channel: key,
      });
    });
  }

  if (nominations.length > 0) {
    return nominations;
  }

  // Fallback: arrays no numéricos desconocidos (sin claves ONA canónicas).
  for (const [key, value] of Object.entries(record)) {
    if (RESPONSE_METADATA_KEYS.has(key)) {
      continue;
    }

    if (/^\d+$/.test(key)) {
      continue;
    }

    if (!Array.isArray(value)) {
      continue;
    }

    const ids = collectParticipantIdsFromArray(value);
    ids.forEach((targetId, positionIndex) => {
      nominations.push({
        targetId,
        weight: getVotePositionWeight(positionIndex),
        position: positionIndex + 1,
        channel: key,
      });
    });
  }

  return nominations;
}

function normalizeAnswersPayload(answers: unknown): unknown {
  if (typeof answers !== "string") {
    return answers;
  }

  const trimmed = answers.trim();
  if (!trimmed) {
    return answers;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return answers;
  }
}

/** Extrae el nombre del respondiente embebido en el JSONB `answers`. */
export function extractRespondentNameFromAnswers(
  answers: unknown,
): string | null {
  const normalized = normalizeAnswersPayload(answers);

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return null;
  }

  const rawName = (normalized as Record<string, unknown>).respondent_name;

  if (typeof rawName !== "string") {
    return null;
  }

  const trimmed = rawName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Normaliza el JSONB `answers` de Supabase a IDs de string comparables. */
export function parseResponseAnswers(answers: unknown): string[] {
  const nominations = parseWeightedResponseAnswers(answers);
  const ids: string[] = [];
  appendUniqueIds(
    ids,
    nominations.map((nomination) => nomination.targetId),
  );
  return ids;
}

/**
 * Extrae nominaciones ONA con peso por posición de voto.
 * - Posición 1 → 1.0
 * - Posición 2 → 0.7
 * - Posición 3 → 0.4
 *
 * Cada canal (`influencia`, `comunicacion`, …) genera sus propias nominaciones;
 * los arcos paralelos entre canales se conservan.
 */
export function parseWeightedResponseAnswers(
  answers: unknown,
): WeightedNomination[] {
  const normalized = normalizeAnswersPayload(answers);

  if (Array.isArray(normalized)) {
    return collectParticipantIdsFromArray(normalized).map(
      (targetId, positionIndex) => ({
        targetId,
        weight: getVotePositionWeight(positionIndex),
        position: positionIndex + 1,
        channel: "list",
      }),
    );
  }

  if (normalized && typeof normalized === "object") {
    return parseWeightedAnswersRecord(normalized as Record<string, unknown>);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Núcleo ONA — utilidades internas
// ---------------------------------------------------------------------------

const ONA_DEBUG = process.env.NODE_ENV === "development";

function debugOnaMatrix(
  label: string,
  payload:
    | SerializableAdjacencyMatrix
    | IndegreeMap
    | ReciprocityMap
    | NetworkDensity
    | NetworkReciprocityResult
    | Record<string, unknown>,
): void {
  if (!ONA_DEBUG) {
    return;
  }

  console.log(`[mathEngine:ONA] ${label}`, payload);
}

function normalizeGraphLink(link: GraphLink): GraphLink | null {
  const source = normalizeParticipantId(link.source);
  const target = normalizeParticipantId(link.target);

  if (!source || !target) {
    return null;
  }

  const weight =
    typeof link.weight === "number" && Number.isFinite(link.weight)
      ? link.weight
      : 1;

  return { source, target, weight };
}

/**
 * Construye la matriz de adyacencia dirigida.
 * Cada enlace explícito en `links` incrementa en 1 el arco source → target
 * (conteo topológico plano; el peso del voto no altera esta matriz).
 */
export function buildDirectedAdjacencyMatrix(
  links: readonly GraphLink[],
): DirectedAdjacencyMatrix {
  const matrix = new Map<string, Map<string, number>>();

  for (const rawLink of links) {
    const link = normalizeGraphLink(rawLink);
    if (!link) {
      continue;
    }

    const row = matrix.get(link.source) ?? new Map<string, number>();
    row.set(link.target, (row.get(link.target) ?? 0) + 1);
    matrix.set(link.source, row);
  }

  return matrix;
}

/**
 * Matriz de adyacencia ponderada: cada arco acumula el `weight` del voto
 * (posición 1 → 1.0, 2 → 0.7, 3 → 0.4).
 */
export function buildWeightedDirectedAdjacencyMatrix(
  links: readonly GraphLink[],
): DirectedAdjacencyMatrix {
  const matrix = new Map<string, Map<string, number>>();

  for (const rawLink of links) {
    const link = normalizeGraphLink(rawLink);
    if (!link) {
      continue;
    }

    const arcWeight = link.weight ?? 1;
    const row = matrix.get(link.source) ?? new Map<string, number>();
    row.set(link.target, (row.get(link.target) ?? 0) + arcWeight);
    matrix.set(link.source, row);
  }

  return matrix;
}

function serializeAdjacencyMatrix(
  matrix: DirectedAdjacencyMatrix,
): SerializableAdjacencyMatrix {
  const serialized: Record<string, Record<string, number>> = {};

  for (const [source, targets] of matrix) {
    serialized[source] = Object.fromEntries(targets);
  }

  return serialized;
}

function sortedPairKey(nodeA: string, nodeB: string): string {
  return [nodeA, nodeB].sort().join("↔");
}

/**
 * Calcula el indegree (grado entrante) plano de cada nodo.
 * En contexto sociométrico, cada arco dirigido source → target cuenta como 1 voto,
 * con independencia del peso posicional. Los arcos paralelos se acumulan.
 */
export function calculateIndegree(links: readonly GraphLink[]): IndegreeMap {
  const adjacency = buildDirectedAdjacencyMatrix(links);
  const indegree: Record<string, number> = {};

  for (const [, targets] of adjacency) {
    for (const [target, weight] of targets) {
      indegree[target] = (indegree[target] ?? 0) + weight;
    }
  }

  debugOnaMatrix("Matriz de adyacencia (indegree)", serializeAdjacencyMatrix(adjacency));
  debugOnaMatrix("Vector de indegree (votos entrantes por ID)", indegree);

  return indegree;
}

/**
 * Calcula el indegree ponderado: suma de pesos de las conexiones recibidas.
 * - Voto 1 (posición 1) → +1.0
 * - Voto 2 (posición 2) → +0.7
 * - Voto 3 (posición 3) → +0.4
 * Enlaces sin `weight` aportan 1 (compatibilidad con grafos legados).
 */
export function calculateWeightedIndegree(
  links: readonly GraphLink[],
): WeightedIndegreeMap {
  const adjacency = buildWeightedDirectedAdjacencyMatrix(links);
  const weightedIndegree: Record<string, number> = {};

  for (const [, targets] of adjacency) {
    for (const [target, weight] of targets) {
      weightedIndegree[target] =
        Math.round(((weightedIndegree[target] ?? 0) + weight) * 1000) / 1000;
    }
  }

  debugOnaMatrix(
    "Matriz de adyacencia (weightedIndegree)",
    serializeAdjacencyMatrix(adjacency),
  );
  debugOnaMatrix(
    "Vector de weightedIndegree (pesos entrantes por ID)",
    weightedIndegree,
  );

  return weightedIndegree;
}

/**
 * Calcula cuántas conexiones mutuas tiene cada colaborador.
 * Un par (A, B) es recíproco cuando existen arcos A → B y B → A.
 * Cada nodo suma min(weight(A→B), weight(B→A)) por par mutuo.
 */
export function calculateReciprocity(
  links: readonly GraphLink[],
): ReciprocityMap {
  const adjacency = buildDirectedAdjacencyMatrix(links);
  const reciprocity: Record<string, number> = {};
  const processedPairs = new Set<string>();

  for (const [source, targets] of adjacency) {
    for (const [target, forwardWeight] of targets) {
      if (source === target) {
        continue;
      }

      const pairKey = sortedPairKey(source, target);
      if (processedPairs.has(pairKey)) {
        continue;
      }

      const reverseWeight = adjacency.get(target)?.get(source) ?? 0;
      if (reverseWeight === 0) {
        continue;
      }

      processedPairs.add(pairKey);
      const mutualConnections = Math.min(forwardWeight, reverseWeight);

      reciprocity[source] = (reciprocity[source] ?? 0) + mutualConnections;
      reciprocity[target] = (reciprocity[target] ?? 0) + mutualConnections;
    }
  }

  debugOnaMatrix("Matriz de adyacencia (reciprocidad)", serializeAdjacencyMatrix(adjacency));
  debugOnaMatrix("Vector de reciprocidad (conexiones mutuas por ID)", reciprocity);

  return reciprocity;
}

function emptyIndividualReciprocity(): IndividualNetworkReciprocity {
  return {
    mutualPairs: 0,
    reciprocatedEdgeCount: 0,
    incidentEdgeCount: 0,
    reciprocityRatio: 0,
    reciprocityPercent: 0,
  };
}

function roundRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function roundPercent(ratio: number): number {
  return Math.round(ratio * 10000) / 100;
}

/**
 * Reciprocidad de red a partir de la matriz de adyacencia dirigida.
 *
 * Global:
 * - Arista activa = celda source→target > 0
 * - Arista recíproca = existe también target→source
 * - Índice = reciprocalEdgeCount / activeEdgeCount
 *
 * Individual (por participante P):
 * - % de votos emitidos o recibidos que están correspondidos
 *   = aristas incidentes con reverse / aristas incidentes (out + in)
 */
export function calculateNetworkReciprocity(
  links: readonly GraphLink[],
  participantIds: readonly string[] = [],
): NetworkReciprocityResult {
  const adjacency = buildDirectedAdjacencyMatrix(links);
  const nodeIds = new Set<string>(
    participantIds.map((id) => normalizeParticipantId(id)).filter(Boolean),
  );

  for (const [source, targets] of adjacency) {
    nodeIds.add(source);
    for (const target of targets.keys()) {
      nodeIds.add(target);
    }
  }

  const byParticipant: Record<string, IndividualNetworkReciprocity> = {};
  for (const nodeId of nodeIds) {
    byParticipant[nodeId] = emptyIndividualReciprocity();
  }

  let activeEdgeCount = 0;
  let reciprocalEdgeCount = 0;
  let mutualPairCount = 0;
  const processedPairs = new Set<string>();

  for (const [source, targets] of adjacency) {
    for (const [target, forwardWeight] of targets) {
      if (source === target || forwardWeight <= 0) {
        continue;
      }

      activeEdgeCount += 1;

      const reverseWeight = adjacency.get(target)?.get(source) ?? 0;
      const isReciprocal = reverseWeight > 0;

      if (isReciprocal) {
        reciprocalEdgeCount += 1;
      }

      // Out-edge de `source` e in-edge de `target` (misma arista dirigida).
      const sourceStats = byParticipant[source] ?? emptyIndividualReciprocity();
      sourceStats.incidentEdgeCount += 1;
      if (isReciprocal) {
        sourceStats.reciprocatedEdgeCount += 1;
      }
      byParticipant[source] = sourceStats;

      const targetStats = byParticipant[target] ?? emptyIndividualReciprocity();
      targetStats.incidentEdgeCount += 1;
      if (isReciprocal) {
        targetStats.reciprocatedEdgeCount += 1;
      }
      byParticipant[target] = targetStats;

      if (isReciprocal) {
        const pairKey = sortedPairKey(source, target);
        if (!processedPairs.has(pairKey)) {
          processedPairs.add(pairKey);
          mutualPairCount += 1;
          sourceStats.mutualPairs += 1;
          targetStats.mutualPairs += 1;
        }
      }
    }
  }

  const individualReciprocityPercent: Record<string, number> = {};

  for (const [nodeId, stats] of Object.entries(byParticipant)) {
    const ratio =
      stats.incidentEdgeCount > 0
        ? stats.reciprocatedEdgeCount / stats.incidentEdgeCount
        : 0;
    stats.reciprocityRatio = roundRatio(ratio);
    stats.reciprocityPercent = roundPercent(ratio);
    individualReciprocityPercent[nodeId] = stats.reciprocityPercent;
  }

  const reciprocityRatio =
    activeEdgeCount > 0 ? reciprocalEdgeCount / activeEdgeCount : 0;

  const result: NetworkReciprocityResult = {
    mutualPairCount,
    reciprocalEdgeCount,
    activeEdgeCount,
    reciprocityRatio: roundRatio(reciprocityRatio),
    reciprocityPercent: roundPercent(reciprocityRatio),
    mutualLinkCount: reciprocalEdgeCount,
    byParticipant,
    individualReciprocityPercent,
  };

  debugOnaMatrix(
    "Matriz de adyacencia (networkReciprocity)",
    serializeAdjacencyMatrix(adjacency),
  );
  debugOnaMatrix("Reciprocidad de red (global + individual)", {
    mutualPairCount: result.mutualPairCount,
    reciprocalEdgeCount: result.reciprocalEdgeCount,
    activeEdgeCount: result.activeEdgeCount,
    reciprocityRatio: result.reciprocityRatio,
    reciprocityPercent: result.reciprocityPercent,
    individualReciprocityPercent: result.individualReciprocityPercent,
  });

  return result;
}

/**
 * Identifica colaboradores aislados: miembros del equipo con 0 votos recibidos.
 * Compara el roster completo contra el mapa de indegree previamente calculado.
 */
export function calculateIsolation(
  participants: readonly { id: string | number; name: string }[],
  indegreeMap: IndegreeMap,
): IsolatedParticipant[] {
  return participants
    .filter((participant) => (indegreeMap[String(participant.id)] ?? 0) === 0)
    .map((participant) => ({
      id: String(participant.id),
      name: participant.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/**
 * Construye enlaces del grafo a partir de las respuestas almacenadas en Supabase.
 * Cada nominación conserva su peso posicional (1.0 / 0.7 / 0.4).
 * Los arcos paralelos entre canales ONA (influencia + comunicación) se conservan.
 */
export function buildGraphLinksFromResponses(
  participants: readonly { id: string | number }[],
  responses: readonly { participant_id: string | number | null; answers: unknown }[],
): GraphLink[] {
  const participantIds = new Set(
    participants.map((participant) =>
      normalizeParticipantId(String(participant.id)),
    ),
  );
  const links: GraphLink[] = [];

  for (const response of responses) {
    if (response.participant_id === null || response.participant_id === undefined) {
      continue;
    }

    const source = normalizeParticipantId(String(response.participant_id));

    for (const nomination of parseWeightedResponseAnswers(response.answers)) {
      const normalizedTarget = normalizeParticipantId(nomination.targetId);

      if (
        !participantIds.has(source) ||
        !participantIds.has(normalizedTarget) ||
        source === normalizedTarget
      ) {
        continue;
      }

      links.push({
        source,
        target: normalizedTarget,
        weight: nomination.weight,
      });
    }
  }

  return links;
}

/** Construye nodos del sociograma con indegree plano y ponderado. */
export function buildGraphNodes(
  participants: readonly { id: string | number; name: string }[],
  links: readonly GraphLink[],
): SociogramNode[] {
  const indegree = calculateIndegree(links);
  const weightedIndegree = calculateWeightedIndegree(links);

  return participants.map((participant) => {
    const id = String(participant.id);

    return {
      id,
      name: participant.name,
      votes: indegree[id] ?? 0,
      weightedVotes: weightedIndegree[id] ?? 0,
    };
  });
}

/**
 * Densidad de red dirigida: D = L / (N × (N − 1)).
 * - L = número total de arcos dirigidos (incluye paralelos)
 * - N = nodeCount (tamaño del roster del equipo)
 * - densityPercent = D × 100
 */
export function calculateNetworkDensity(
  nodeCount: number,
  links: readonly GraphLink[],
): NetworkDensity {
  const normalizedLinks = links
    .map(normalizeGraphLink)
    .filter((link): link is GraphLink => link !== null);

  const linkCount = normalizedLinks.length;
  const maxPossibleLinks = nodeCount > 1 ? nodeCount * (nodeCount - 1) : 0;
  const density =
    maxPossibleLinks > 0 ? linkCount / maxPossibleLinks : 0;
  const densityPercent = density * 100;

  const result: NetworkDensity = {
    nodeCount,
    linkCount,
    maxPossibleLinks,
    density,
    densityPercent: Math.round(densityPercent * 100) / 100,
  };

  debugOnaMatrix("Densidad de red dirigida D = L / (N(N-1))", {
    formula: "D = L / (N(N-1))",
    N: nodeCount,
    L: linkCount,
    maxPossibleLinks,
    densityRatio: density,
    densityPercent: result.densityPercent,
  });

  return result;
}

/**
 * Detecta silos como componentes conexas en la red (vista no dirigida).
 * Grupos con ≥ 2 miembros conectados entre sí pero separados del resto.
 */
export function detectNetworkSilos(
  participants: readonly GraphParticipant[],
  links: readonly GraphLink[],
): NetworkSilo[] {
  const parent = new Map<string, string>();

  function find(nodeId: string): string {
    const currentParent = parent.get(nodeId) ?? nodeId;

    if (currentParent !== nodeId) {
      const root = find(currentParent);
      parent.set(nodeId, root);
      return root;
    }

    return nodeId;
  }

  function union(nodeA: string, nodeB: string) {
    const rootA = find(nodeA);
    const rootB = find(nodeB);

    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  }

  for (const participant of participants) {
    parent.set(participant.id, participant.id);
  }

  for (const link of links) {
    union(link.source, link.target);
  }

  const nameById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );
  const clusters = new Map<string, string[]>();

  for (const participant of participants) {
    const root = find(participant.id);
    const members = clusters.get(root) ?? [];
    members.push(participant.id);
    clusters.set(root, members);
  }

  return [...clusters.values()]
    .filter((memberIds) => memberIds.length >= 2)
    .map((memberIds, index) => {
      const sortedMemberIds = [...memberIds].sort((a, b) =>
        (nameById.get(a) ?? a).localeCompare(nameById.get(b) ?? "es"),
      );

      return {
        id: `silo-${index + 1}`,
        memberIds: sortedMemberIds,
        memberNames: sortedMemberIds.map((id) => nameById.get(id) ?? id),
        size: sortedMemberIds.length,
      };
    })
    .sort((a, b) => b.size - a.size || a.id.localeCompare(b.id, "es"));
}

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

export type GroupOnaMetrics = {
  networkDensity: NetworkDensity;
  networkReciprocity: NetworkReciprocityResult;
  links: GraphLink[];
  nodes: SociogramNode[];
  influenceLeaders: InfluenceLeader[];
  reciprocityLeaders: ReciprocityLeader[];
  isolatedParticipants: IsolatedParticipant[];
  silos: NetworkSilo[];
  leaderNames: string[];
  isolatedNames: string[];
};

function buildInfluenceLeaders(
  links: readonly GraphLink[],
  nameById: Map<string, string>,
  limit = 2,
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
    .slice(0, limit);
}

function buildReciprocityLeaders(
  links: readonly GraphLink[],
  nameById: Map<string, string>,
  limit = 3,
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
    .slice(0, limit);
}

/**
 * Calcula métricas ONA en caliente desde participants + responses del grupo.
 *
 * - N = total de participantes
 * - Enlaces posibles = N × (N − 1); si N ≤ 1 → densidad 0
 * - Densidad = (votos reales / enlaces posibles) × 100
 * - Líderes = Top 2 por votos entrantes
 * - Aislados = participantes con 0 votos entrantes
 */
export function computeGroupOnaMetrics(
  participants: readonly GraphParticipant[],
  responses: readonly { participant_id: string | number; answers: unknown }[],
  options?: { topLeaders?: number; topReciprocity?: number },
): GroupOnaMetrics {
  const topLeaders = options?.topLeaders ?? 2;
  const topReciprocity = options?.topReciprocity ?? 3;
  const graphParticipants = participants.map((participant) => ({
    id: String(participant.id),
    name: participant.name,
  }));
  const nameById = new Map(
    graphParticipants.map((participant) => [participant.id, participant.name]),
  );
  const links = buildGraphLinksFromResponses(graphParticipants, responses);
  const networkDensity = calculateNetworkDensity(
    graphParticipants.length,
    links,
  );
  const networkReciprocity = calculateNetworkReciprocity(
    links,
    graphParticipants.map((participant) => participant.id),
  );
  const nodes = buildGraphNodes(graphParticipants, links);
  const influenceLeaders = buildInfluenceLeaders(links, nameById, topLeaders);
  const reciprocityLeaders = buildReciprocityLeaders(
    links,
    nameById,
    topReciprocity,
  );
  const indegreeMap = calculateIndegree(links);
  const isolatedParticipants = calculateIsolation(
    graphParticipants,
    indegreeMap,
  );
  const silos = detectNetworkSilos(graphParticipants, links);

  return {
    networkDensity,
    networkReciprocity,
    links,
    nodes,
    influenceLeaders,
    reciprocityLeaders,
    isolatedParticipants,
    silos,
    leaderNames: influenceLeaders.map((leader) => leader.name),
    isolatedNames: isolatedParticipants.map((participant) => participant.name),
  };
}

/** Colaborador de entrada para `calculateNetworkMetrics`. */
export type NetworkMetricsParticipantInput = {
  id: number | string;
  name: string;
};

/** Respuesta sociométrica: array plano de IDs o JSONB legacy de Supabase. */
export type NetworkMetricsResponseInput = {
  participant_id: number | string | null;
  answers: (number | string)[] | unknown;
};

/** Mapa id → conteo de grado (entrante o saliente). */
export type NetworkDegreeMap = Readonly<Record<string, number>>;

/** Influencer del top por votos recibidos. */
export type NetworkMetricsInfluencer = {
  id: string;
  name: string;
  inDegree: number;
};

/**
 * Resultado agregado de densidad, grados, reciprocidad, intermediación e influencers.
 * Densidad y reciprocidad se expresan en porcentaje 0–100.
 * Listo para KPIs ejecutivos y payload de `/api/ai-diagnosis`.
 */
export type CalculatedNetworkMetrics = {
  /** L / (N × (N − 1)) × 100 — arcos dirigidos únicos sobre el máximo posible. */
  density: number;
  /** Votos recibidos por colaborador (id → conteo). */
  inDegree: NetworkDegreeMap;
  /** Votos emitidos por colaborador (id → conteo). */
  outDegree: NetworkDegreeMap;
  /**
   * Centralidad de grado normalizada 0–1:
   * in = inDegree / (N−1), out = outDegree / (N−1).
   */
  degreeCentrality: {
    in: NetworkDegreeMap;
    out: NetworkDegreeMap;
  };
  /**
   * Pares mutuos {A,B} / C(N, 2) × 100 —
   * reciprocidad sobre el máximo de conexiones bidireccionales posibles.
   */
  reciprocityRate: number;
  /**
   * Intermediación (betweenness) normalizada 0–1 por nodo
   * (algoritmo de Brandes sobre el digrafo de nominaciones únicas).
   */
  betweenness: NetworkDegreeMap;
  /** Top 3 por betweenness (desempate alfabético). */
  betweennessLeaders: Array<{
    id: string;
    name: string;
    betweenness: number;
  }>;
  /** Colaboradores con 0 votos recibidos. */
  isolatedParticipants: Array<{ id: string; name: string }>;
  /** Top 3 por inDegree (desempate alfabético). */
  topInfluencers: NetworkMetricsInfluencer[];
};

/** Alias semántico para informe ejecutivo / diagnóstico IA. */
export type OnaExecutiveMetrics = CalculatedNetworkMetrics;

/**
 * Betweenness centrality (Brandes) sobre digrafo simple de nominaciones.
 * Puntuación cruda; el caller normaliza por (N−1)(N−2) cuando N > 2.
 */
export function calculateBetweennessCentrality(
  nodeIds: readonly string[],
  directedEdges: ReadonlySet<string>,
): Record<string, number> {
  const nodes = [...new Set(nodeIds.map((id) => String(id).trim()).filter(Boolean))];
  const betweenness: Record<string, number> = {};
  const adjacency = new Map<string, string[]>();

  for (const id of nodes) {
    betweenness[id] = 0;
    adjacency.set(id, []);
  }

  for (const edge of directedEdges) {
    const separator = edge.indexOf("\u2192");
    if (separator <= 0) {
      continue;
    }
    const source = edge.slice(0, separator);
    const target = edge.slice(separator + 1);
    if (!adjacency.has(source) || !adjacency.has(target) || source === target) {
      continue;
    }
    adjacency.get(source)!.push(target);
  }

  for (const source of nodes) {
    const stack: string[] = [];
    const predecessors = new Map<string, string[]>();
    const sigma: Record<string, number> = {};
    const distance: Record<string, number> = {};
    const queue: string[] = [];

    for (const node of nodes) {
      predecessors.set(node, []);
      sigma[node] = 0;
      distance[node] = -1;
    }

    sigma[source] = 1;
    distance[source] = 0;
    queue.push(source);

    while (queue.length > 0) {
      const vertex = queue.shift()!;
      stack.push(vertex);

      for (const neighbor of adjacency.get(vertex) ?? []) {
        if (distance[neighbor]! < 0) {
          distance[neighbor] = distance[vertex]! + 1;
          queue.push(neighbor);
        }

        if (distance[neighbor] === distance[vertex]! + 1) {
          sigma[neighbor] = (sigma[neighbor] ?? 0) + (sigma[vertex] ?? 0);
          predecessors.get(neighbor)!.push(vertex);
        }
      }
    }

    const delta: Record<string, number> = {};
    for (const node of nodes) {
      delta[node] = 0;
    }

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of predecessors.get(w) ?? []) {
        const sigmaW = sigma[w] ?? 0;
        if (sigmaW <= 0) {
          continue;
        }
        delta[v] =
          (delta[v] ?? 0) +
          ((sigma[v] ?? 0) / sigmaW) * (1 + (delta[w] ?? 0));
      }
      if (w !== source) {
        betweenness[w] = (betweenness[w] ?? 0) + (delta[w] ?? 0);
      }
    }
  }

  return betweenness;
}

/**
 * Calcula métricas ONA puras a partir del roster y respuestas (planas o JSONB).
 * No toca Supabase ni UI: solo aritmética de red dirigida.
 *
 * Fórmulas:
 * - Densidad % = |E| / (N(N−1)) × 100
 * - Reciprocidad % = pares mutuos / C(N,2) × 100
 * - Centralidad de grado = degree / (N−1)
 * - Betweenness = Brandes / ((N−1)(N−2))
 */
export function calculateNetworkMetrics(
  participants: readonly NetworkMetricsParticipantInput[],
  responses: readonly NetworkMetricsResponseInput[],
): CalculatedNetworkMetrics {
  const roster = participants.map((participant) => ({
    id: String(participant.id).trim(),
    name: participant.name,
  }));
  const rosterIds = new Set(roster.map((participant) => participant.id));

  // Inicializa grados a 0 para todo el equipo (incluye aislados).
  const inDegree: Record<string, number> = {};
  const outDegree: Record<string, number> = {};
  for (const participant of roster) {
    inDegree[participant.id] = 0;
    outDegree[participant.id] = 0;
  }

  // Arcos dirigidos únicos A→B (evita densidades > 100% por votos repetidos).
  const directedEdges = new Set<string>();

  for (const response of responses) {
    if (response.participant_id === null || response.participant_id === undefined) {
      continue;
    }

    const source = String(response.participant_id).trim();
    if (!rosterIds.has(source)) {
      continue;
    }

    // Acepta arrays planos o el JSONB real de Supabase (influencia, comunicación…).
    const nominationIds = Array.isArray(response.answers)
      ? response.answers.map((value) => String(value).trim()).filter(Boolean)
      : parseResponseAnswers(response.answers);

    for (const rawTarget of nominationIds) {
      const target = String(rawTarget).trim();
      if (!rosterIds.has(target) || source === target) {
        continue;
      }

      // Cada nominación suma 1 al outDegree del emisor y al inDegree del receptor.
      outDegree[source] = (outDegree[source] ?? 0) + 1;
      inDegree[target] = (inDegree[target] ?? 0) + 1;
      directedEdges.add(`${source}\u2192${target}`);
    }
  }

  const n = roster.length;
  // Máximo de arcos dirigidos posibles en un digrafo simple sin bucles.
  const maxDirectedEdges = n > 1 ? n * (n - 1) : 0;
  // Densidad (%) = conexiones reales / máximo posible.
  const density =
    maxDirectedEdges > 0
      ? Math.round((directedEdges.size / maxDirectedEdges) * 10000) / 100
      : 0;

  // Pares mutuos: A→B y B→A existen.
  let mutualPairCount = 0;
  for (const edge of directedEdges) {
    const separator = edge.indexOf("\u2192");
    if (separator <= 0) {
      continue;
    }
    const source = edge.slice(0, separator);
    const target = edge.slice(separator + 1);
    // Contar cada par una sola vez (solo cuando source < target lexicográficamente).
    if (source < target && directedEdges.has(`${target}\u2192${source}`)) {
      mutualPairCount += 1;
    }
  }

  // Máximo de conexiones bidireccionales posibles = C(N, 2) = N×(N−1)/2.
  const maxBidirectionalPairs = n > 1 ? (n * (n - 1)) / 2 : 0;
  const reciprocityRate =
    maxBidirectionalPairs > 0
      ? Math.round((mutualPairCount / maxBidirectionalPairs) * 10000) / 100
      : 0;

  // Centralidad de grado normalizada (Freeman): degree / (N−1).
  const degreeDenominator = n > 1 ? n - 1 : 1;
  const degreeCentralityIn: Record<string, number> = {};
  const degreeCentralityOut: Record<string, number> = {};
  for (const participant of roster) {
    degreeCentralityIn[participant.id] =
      Math.round(
        ((inDegree[participant.id] ?? 0) / degreeDenominator) * 10000,
      ) / 10000;
    degreeCentralityOut[participant.id] =
      Math.round(
        ((outDegree[participant.id] ?? 0) / degreeDenominator) * 10000,
      ) / 10000;
  }

  // Intermediación (Brandes) normalizada para digrafos: / ((N−1)(N−2)).
  const rawBetweenness = calculateBetweennessCentrality(
    roster.map((participant) => participant.id),
    directedEdges,
  );
  const betweennessNorm =
    n > 2 ? (n - 1) * (n - 2) : 1;
  const betweenness: Record<string, number> = {};
  for (const participant of roster) {
    const raw = rawBetweenness[participant.id] ?? 0;
    betweenness[participant.id] =
      Math.round((raw / betweennessNorm) * 10000) / 10000;
  }

  const betweennessLeaders = [...roster]
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
      betweenness: betweenness[participant.id] ?? 0,
    }))
    .sort(
      (a, b) =>
        b.betweenness - a.betweenness || a.name.localeCompare(b.name, "es"),
    )
    .slice(0, 3);

  // Aislados: inDegree === 0.
  const isolatedParticipants = roster
    .filter((participant) => (inDegree[participant.id] ?? 0) === 0)
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  // Top 3 influencers por votos recibidos (centralidad de entrada).
  const topInfluencers = [...roster]
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
      inDegree: inDegree[participant.id] ?? 0,
    }))
    .sort(
      (a, b) =>
        b.inDegree - a.inDegree || a.name.localeCompare(b.name, "es"),
    )
    .slice(0, 3);

  return {
    density,
    inDegree,
    outDegree,
    degreeCentrality: {
      in: degreeCentralityIn,
      out: degreeCentralityOut,
    },
    reciprocityRate,
    betweenness,
    betweennessLeaders,
    isolatedParticipants,
    topInfluencers,
  };
}

/**
 * Proyecta el objeto ONA a un payload plano para `/api/ai-diagnosis`
 * y el informe ejecutivo (sin romper contratos legacy).
 */
export type AiDiagnosisMetricsPayload = {
  groupId?: string;
  teamName?: string;
  density: number;
  reciprocityRate: number;
  isolatedParticipants: Array<{ id: string; name: string }>;
  topInfluencers: NetworkMetricsInfluencer[];
  betweennessLeaders: CalculatedNetworkMetrics["betweennessLeaders"];
  degreeCentrality: CalculatedNetworkMetrics["degreeCentrality"];
  rosterSize: number;
};

export function toAiDiagnosisMetricsPayload(
  metrics: CalculatedNetworkMetrics,
  options?: {
    teamName?: string;
    groupId?: string;
    rosterSize?: number;
  },
): AiDiagnosisMetricsPayload {
  return {
    ...(options?.groupId ? { groupId: options.groupId } : {}),
    ...(options?.teamName ? { teamName: options.teamName } : {}),
    density: metrics.density,
    reciprocityRate: metrics.reciprocityRate,
    isolatedParticipants: metrics.isolatedParticipants,
    topInfluencers: metrics.topInfluencers,
    betweennessLeaders: metrics.betweennessLeaders,
    degreeCentrality: metrics.degreeCentrality,
    rosterSize:
      options?.rosterSize ?? Object.keys(metrics.inDegree).length,
  };
}
