/** Enlace dirigido: `source` vota o señala a `target`. */
export type GraphLink = {
  source: string;
  target: string;
};

/** Nodo del sociograma con métricas de influencia. */
export type SociogramNode = {
  id: string;
  name: string;
  votes: number;
};

/** Mapa de indegree: ID del nodo → número de votos/conexiones entrantes recibidas. */
export type IndegreeMap = Readonly<Record<string, number>>;

/** Mapa de reciprocidad: ID del colaborador → conexiones mutuas con otros miembros. */
export type ReciprocityMap = Readonly<Record<string, number>>;

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

function parseAnswersRecord(record: Record<string, unknown>): string[] {
  const ids: string[] = [];

  for (const key of ONA_CHOICE_KEYS) {
    if (key in record) {
      appendUniqueIds(ids, collectParticipantIdsFromArray(record[key]));
    }
  }

  if (ids.length > 0) {
    return ids;
  }

  for (const [key, value] of Object.entries(record)) {
    if (RESPONSE_METADATA_KEYS.has(key)) {
      continue;
    }

    if (/^\d+$/.test(key)) {
      continue;
    }

    if (Array.isArray(value)) {
      appendUniqueIds(ids, collectParticipantIdsFromArray(value));
    }
  }

  return ids;
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
  const normalized = normalizeAnswersPayload(answers);

  if (Array.isArray(normalized)) {
    return collectParticipantIdsFromArray(normalized);
  }

  if (normalized && typeof normalized === "object") {
    return parseAnswersRecord(normalized as Record<string, unknown>);
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

  return { source, target };
}

/**
 * Construye la matriz de adyacencia dirigida ponderada.
 * Cada enlace explícito en `links` incrementa en 1 el arco source → target.
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
 * Calcula el indegree (grado entrante) de cada nodo a partir de los enlaces del grafo.
 * En contexto sociométrico, cada arco dirigido source → target es un voto hacia target.
 * Los arcos paralelos (p. ej. influencia + comunicación) se acumulan.
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

/** Construye enlaces del grafo a partir de las respuestas almacenadas en Supabase. */
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

    for (const targetId of parseResponseAnswers(response.answers)) {
      const normalizedTarget = normalizeParticipantId(targetId);

      if (participantIds.has(source) && participantIds.has(normalizedTarget)) {
        links.push({ source, target: normalizedTarget });
      }
    }
  }

  return links;
}

/** Construye nodos del sociograma con el indegree calculado desde los enlaces. */
export function buildGraphNodes(
  participants: readonly { id: string | number; name: string }[],
  links: readonly GraphLink[],
): SociogramNode[] {
  const indegree = calculateIndegree(links);

  return participants.map((participant) => ({
    id: String(participant.id),
    name: participant.name,
    votes: indegree[String(participant.id)] ?? 0,
  }));
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
