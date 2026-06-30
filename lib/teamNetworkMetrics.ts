import { getSupabase } from "@/lib/supabase";

export type TeamNetworkMetric = {
  participant_name: string;
  indegree_count: number;
  relative_centrality: number;
};

type TeamNetworkMetricRow = {
  participant_name?: string | null;
  indegree_count?: number | string | null;
  relative_centrality?: number | string | null;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function mapMetricRow(row: TeamNetworkMetricRow): TeamNetworkMetric | null {
  const participantName = row.participant_name?.trim() ?? "";

  if (!participantName) {
    return null;
  }

  return {
    participant_name: participantName,
    indegree_count: toNumber(row.indegree_count),
    relative_centrality: toNumber(row.relative_centrality),
  };
}

/** Convierte centralidad relativa (0–1 o 0–100) a porcentaje para UI. */
export function toCentralityPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value <= 1) {
    return Math.round(value * 100);
  }

  return Math.round(Math.min(value, 100));
}

export async function fetchTeamNetworkMetrics(groupId: string): Promise<{
  data: TeamNetworkMetric[];
  error: string | null;
}> {
  try {
    const { data, error } = await getSupabase().rpc("get_team_network_metrics", {
      target_group_id: groupId,
    });

    if (error) {
      console.error("Error crítico en Supabase:", error);
      return { data: [], error: error.message };
    }

    const rows = (data ?? []) as TeamNetworkMetricRow[];

    const metrics = rows
      .map((row: TeamNetworkMetricRow) => mapMetricRow(row))
      .filter((row): row is TeamNetworkMetric => row !== null)
      .sort(
        (a: TeamNetworkMetric, b: TeamNetworkMetric) =>
          b.indegree_count - a.indegree_count ||
          b.relative_centrality - a.relative_centrality ||
          a.participant_name.localeCompare(b.participant_name, "es"),
      );

    return { data: metrics, error: null };
  } catch (error) {
    console.error("Error crítico en Supabase:", error);
    return {
      data: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
