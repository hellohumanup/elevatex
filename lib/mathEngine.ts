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
export type IndegreeMap = Record<string, number>;

/** Mapa de reciprocidad: ID del colaborador → conexiones mutuas con otros miembros. */
export type ReciprocityMap = Record<string, number>;

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

/** Normaliza el JSONB `answers` de Supabase a IDs de string comparables. */
export function parseResponseAnswers(answers: unknown): string[] {
  if (!Array.isArray(answers)) {
    return [];
  }

  return answers
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
}

/**
 * Calcula el indegree (grado entrante) de cada nodo a partir de los enlaces del grafo.
 * En nuestro contexto sociométrico, cada enlace es un voto: `source` elige a `target`.
 */
export function calculateIndegree(links: readonly GraphLink[]): IndegreeMap {
  const indegree: IndegreeMap = {};

  // Cada aparición de un target representa un voto recibido por ese nodo.
  for (const link of links) {
    indegree[link.target] = (indegree[link.target] ?? 0) + 1;
  }

  return indegree;
}

/**
 * Calcula cuántas conexiones recíprocas tiene cada colaborador.
 * Una conexión es recíproca cuando A elige a B y B también elige a A.
 */
export function calculateReciprocity(
  links: readonly GraphLink[],
): ReciprocityMap {
  const linkSet = new Set(
    links.map((link) => `${link.source}|${link.target}`),
  );
  const reciprocity: ReciprocityMap = {};
  const countedPairs = new Set<string>();

  for (const link of links) {
    const hasReverseLink = linkSet.has(`${link.target}|${link.source}`);

    if (!hasReverseLink || link.source === link.target) {
      continue;
    }

    const pairKey = [link.source, link.target].sort().join("|");

    if (countedPairs.has(pairKey)) {
      continue;
    }

    countedPairs.add(pairKey);
    reciprocity[link.source] = (reciprocity[link.source] ?? 0) + 1;
    reciprocity[link.target] = (reciprocity[link.target] ?? 0) + 1;
  }

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
  responses: readonly { participant_id: string | number; answers: unknown }[],
): GraphLink[] {
  const participantIds = new Set(
    participants.map((participant) => String(participant.id)),
  );
  const links: GraphLink[] = [];

  for (const response of responses) {
    const source = String(response.participant_id);

    for (const targetId of parseResponseAnswers(response.answers)) {
      if (participantIds.has(source) && participantIds.has(targetId)) {
        links.push({ source, target: targetId });
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
 * Densidad de red dirigida: enlaces reales / enlaces posibles (n × (n − 1)).
 * Incluye votos de p1, p2 y p3 como conexiones independientes.
 */
export function calculateNetworkDensity(
  nodeCount: number,
  links: readonly GraphLink[],
): NetworkDensity {
  const linkCount = links.length;
  const maxPossibleLinks =
    nodeCount > 1 ? nodeCount * (nodeCount - 1) : 0;
  const density =
    maxPossibleLinks > 0 ? linkCount / maxPossibleLinks : 0;

  return {
    nodeCount,
    linkCount,
    maxPossibleLinks,
    density,
    densityPercent: Math.round(density * 100),
  };
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
