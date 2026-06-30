import { getSupabase } from "@/lib/supabase";
import {
  buildGraphNodes,
  type GraphLink,
  type GraphParticipant,
  type SociogramNode,
} from "@/lib/mathEngine";

/** Fila cruda de Supabase — soporta columnas planas y arrays JSON. */
export type SurveyResponseRow = {
  id?: string | number;
  organization_id?: string | null;
  responder_id: string;
  p1_voto1?: string | null;
  p1_voto2?: string | null;
  p1_voto3?: string | null;
  p2_voto1?: string | null;
  p2_voto2?: string | null;
  p2_voto3?: string | null;
  p3_voto1?: string | null;
  p3_voto2?: string | null;
  p3_voto3?: string | null;
  p1_votes?: unknown;
  p2_votes?: unknown;
  p3_votes?: unknown;
};

export type SurveyNetworkData = {
  participants: GraphParticipant[];
  links: GraphLink[];
  nodes: SociogramNode[];
  responseCount: number;
};

/** Capa sociométrica visible en el grafo ONA. */
export type NetworkLayer = "all" | "p1" | "p2" | "p3";

export const NETWORK_LAYER_OPTIONS: Array<{
  value: NetworkLayer;
  label: string;
  description: string;
}> = [
  {
    value: "all",
    label: "Ver Red Completa",
    description: "Todos los enlaces de P1, P2 y P3 combinados",
  },
  {
    value: "p1",
    label: "Red de Ayuda Técnica (P1)",
    description: "Solo vínculos del array p1_votes",
  },
  {
    value: "p2",
    label: "Red de Colaboración Eficaz (P2)",
    description: "Solo vínculos del array p2_votes",
  },
  {
    value: "p3",
    label: "Referentes de Clima Laboral (P3)",
    description: "Solo vínculos del array p3_votes",
  },
];

const SURVEY_RESPONSE_SELECT_SAFE =
  "id, organization_id, responder_id, p1_voto1, p1_voto2, p1_voto3, p2_voto1, p2_voto2, p2_voto3, p3_voto1, p3_voto2, p3_voto3";

const SURVEY_RESPONSE_SELECT_EXTENDED = `${SURVEY_RESPONSE_SELECT_SAFE}, p1_votes, p2_votes, p3_votes, created_at`;

async function fetchSurveyRows(options?: {
  organizationId?: string;
}): Promise<{ data: SurveyResponseRow[]; error: string | null }> {
  const supabase = getSupabase();

  let extendedQuery = supabase
    .from("survey_responses")
    .select(SURVEY_RESPONSE_SELECT_EXTENDED);

  if (options?.organizationId !== undefined) {
    extendedQuery = extendedQuery.eq("organization_id", options.organizationId);
  }

  const extended = await extendedQuery.order("responder_id", { ascending: true });

  if (!extended.error) {
    return { data: (extended.data ?? []) as SurveyResponseRow[], error: null };
  }

  let safeQuery = supabase
    .from("survey_responses")
    .select(SURVEY_RESPONSE_SELECT_SAFE);

  if (options?.organizationId !== undefined) {
    safeQuery = safeQuery.eq("organization_id", options.organizationId);
  }

  const safe = await safeQuery.order("responder_id", { ascending: true });

  if (safe.error) {
    return { data: [], error: safe.error.message };
  }

  return { data: (safe.data ?? []) as SurveyResponseRow[], error: null };
}

function isNonEmptyVote(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeVoteValue(value: string): string {
  return value.trim();
}

function parseVoteEntry(entry: unknown): string | null {
  if (typeof entry === "string" && entry.trim().length > 0) {
    return normalizeVoteValue(entry);
  }

  if (typeof entry === "number" && Number.isFinite(entry)) {
    return String(entry);
  }

  if (entry && typeof entry === "object") {
    const record = entry as Record<string, unknown>;
    const candidate =
      record.id ?? record.user_id ?? record.participant_id ?? record.email;

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return normalizeVoteValue(candidate);
    }

    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }

  return null;
}

function parseVoteArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value) as unknown;
        return parseVoteArray(parsed);
      } catch {
        return [];
      }
    }

    return [];
  }

  return value
    .map((entry) => parseVoteEntry(entry))
    .filter((entry): entry is string => Boolean(entry));
}

/** Extrae los tres bloques de votos (técnico, confianza, cultura) de una fila. */
export function extractSurveyVoteGroups(row: SurveyResponseRow): {
  p1: string[];
  p2: string[];
  p3: string[];
} {
  const arrayP1 = parseVoteArray(row.p1_votes);
  const arrayP2 = parseVoteArray(row.p2_votes);
  const arrayP3 = parseVoteArray(row.p3_votes);

  if (arrayP1.length > 0 || arrayP2.length > 0 || arrayP3.length > 0) {
    return { p1: arrayP1, p2: arrayP2, p3: arrayP3 };
  }

  const flat = (values: Array<string | null | undefined>) =>
    values.filter(isNonEmptyVote).map(normalizeVoteValue);

  return {
    p1: flat([row.p1_voto1, row.p1_voto2, row.p1_voto3]),
    p2: flat([row.p2_voto1, row.p2_voto2, row.p2_voto3]),
    p3: flat([row.p3_voto1, row.p3_voto2, row.p3_voto3]),
  };
}

function votesForLayer(
  groups: { p1: string[]; p2: string[]; p3: string[] },
  layer: NetworkLayer,
): string[] {
  switch (layer) {
    case "p1":
      return groups.p1;
    case "p2":
      return groups.p2;
    case "p3":
      return groups.p3;
    default:
      return [...groups.p1, ...groups.p2, ...groups.p3];
  }
}

/** Mapa id → etiqueta visible a partir de todas las filas. */
export function buildParticipantNameMap(
  rows: readonly SurveyResponseRow[],
): Map<string, string> {
  const participants = buildParticipantsFromSurveyRows(rows);
  return new Map(participants.map((participant) => [participant.id, participant.name]));
}

/** Construye participantes únicos (emisores y receptores de votos). */
export function buildParticipantsFromSurveyRows(
  rows: readonly SurveyResponseRow[],
): GraphParticipant[] {
  const participantIds = new Set<string>();

  for (const row of rows) {
    participantIds.add(normalizeVoteValue(row.responder_id));

    const { p1, p2, p3 } = extractSurveyVoteGroups(row);

    for (const targetId of [...p1, ...p2, ...p3]) {
      participantIds.add(targetId);
    }
  }

  return [...participantIds]
    .sort((a, b) => a.localeCompare(b, "es"))
    .map((id) => ({ id, name: id }));
}

/** Convierte survey_responses en enlaces dirigidos emisor → receptor. */
export function buildGraphLinksFromSurveyRows(
  rows: readonly SurveyResponseRow[],
  layer: NetworkLayer = "all",
): GraphLink[] {
  const links: GraphLink[] = [];

  for (const row of rows) {
    const source = normalizeVoteValue(row.responder_id);
    const groups = extractSurveyVoteGroups(row);
    const targets = votesForLayer(groups, layer);

    for (const target of targets) {
      if (source !== target) {
        links.push({ source, target });
      }
    }
  }

  return links;
}

/** Participantes activos en una capa concreta de la red. */
export function buildParticipantsForLayer(
  rows: readonly SurveyResponseRow[],
  links: readonly GraphLink[],
  nameMap: Map<string, string>,
): GraphParticipant[] {
  const participantIds = new Set<string>();

  for (const link of links) {
    participantIds.add(link.source);
    participantIds.add(link.target);
  }

  if (links.length === 0) {
    for (const row of rows) {
      participantIds.add(normalizeVoteValue(row.responder_id));
    }
  }

  return [...participantIds]
    .sort((a, b) =>
      (nameMap.get(a) ?? a).localeCompare(nameMap.get(b) ?? b, "es"),
    )
    .map((id) => ({
      id,
      name: nameMap.get(id) ?? id,
    }));
}

export function buildSurveyNetworkData(
  rows: readonly SurveyResponseRow[],
  layer: NetworkLayer = "all",
): SurveyNetworkData {
  const nameMap = buildParticipantNameMap(rows);
  const links = buildGraphLinksFromSurveyRows(rows, layer);
  const participants = buildParticipantsForLayer(rows, links, nameMap);
  const nodes = buildGraphNodes(participants, links);

  return {
    participants,
    links,
    nodes,
    responseCount: rows.length,
  };
}

export type SurveyVoteDetail = {
  voterId: string;
  voterName: string;
  technicalVotes: string[];
  trustVotes: string[];
  cultureVotes: string[];
};

export function buildVoteDetailsFromSurveyRows(
  rows: readonly SurveyResponseRow[],
): SurveyVoteDetail[] {
  return rows
    .map((row) => {
      const { p1, p2, p3 } = extractSurveyVoteGroups(row);
      const voterId = normalizeVoteValue(row.responder_id);

      return {
        voterId,
        voterName: voterId,
        technicalVotes: p1,
        trustVotes: p2,
        cultureVotes: p3,
      };
    })
    .sort((a, b) => a.voterName.localeCompare(b.voterName, "es"));
}

export async function fetchAllSurveyResponses(): Promise<{
  data: SurveyResponseRow[];
  error: string | null;
}> {
  return fetchSurveyRows();
}

export async function fetchSurveyResponsesForOrganization(
  organizationId: number | string,
): Promise<{ data: SurveyResponseRow[]; error: string | null }> {
  const orgId =
    typeof organizationId === "string"
      ? organizationId.trim()
      : String(organizationId);

  if (!orgId) {
    return {
      data: [],
      error: "organization_id no válido para consultar survey_responses.",
    };
  }

  return fetchSurveyRows({ organizationId: orgId });
}

/** Adaptador para reutilizar helpers legacy con filas del cuestionario nativo. */
export function surveyRowsToLegacyResponses(rows: readonly SurveyResponseRow[]) {
  return rows.map((row) => {
    const { p1, p2, p3 } = extractSurveyVoteGroups(row);

    return {
      participant_id: normalizeVoteValue(row.responder_id),
      answers: [...p1, ...p2, ...p3],
    };
  });
}
