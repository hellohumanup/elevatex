"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DemoModePanel from "@/components/DemoModePanel";
import EdtExecutiveDashboard from "@/components/EdtExecutiveDashboard";
import SociogramGraph from "@/components/SociogramGraph";
import TeamVotesImportZone from "@/components/TeamVotesImportZone";
import {
  buildDemoDatasetForGroup,
  type DemoOrgId,
} from "@/lib/demoOrganizations";
import { parseVotesImportFile } from "@/lib/parseVotesImportFile";
import { persistVotesImportToSupabase } from "@/lib/persistVotesImport";
import {
  AI_MAINTENANCE_MESSAGE,
} from "@/lib/teamInsights";
import {
  buildGraphLinksFromResponses,
  buildGraphNodes,
  buildParticipantNameLookup,
  calculateIndegree,
  calculateIsolation,
  calculateNetworkDensity,
  calculateReciprocity,
  detectNetworkSilos,
  extractRespondentNameFromAnswers,
  normalizeParticipantId,
  parseResponseAnswers,
  resolveParticipantDisplayName,
  type GraphLink,
  type IndegreeMap,
  type NetworkDensity,
  type NetworkSilo,
  type ParticipantNameLookup,
  type ReciprocityMap,
  type SociogramNode,
} from "@/lib/mathEngine";
import { getSupabase } from "@/lib/supabase";
import { simulateDevVotesForGroup } from "@/lib/simulateDevVotes";
import { computeEdtMetrics, type EdtMetricsResult } from "@/lib/edtMetrics";
import { buildEdtAffinityGraphData } from "@/lib/edtAffinityGraph";
import { resolveRouteGroupId } from "@/lib/groupId";
import { FALLBACK_TEST_TENANT_ID } from "@/lib/groups";
import {
  calculateNetworkMetrics,
  type NetworkMetricsResult,
} from "@/lib/networkMetrics";

/** Bypass de validación multi-tenant en desarrollo local. */
const IS_LOCAL_DEV = process.env.NODE_ENV === "development";

/** UUID de la organización piloto (Piloto BetaX) — aislamiento multi-tenant. */
const ACTIVE_ORGANIZATION_ID = "11111111-1111-1111-1111-111111111111";

const TENANT_ACCESS_DENIED_MESSAGE =
  "No tienes permisos para acceder a los datos de este equipo o el grupo no pertenece a tu organización.";

const INVALID_GROUP_ID_MESSAGE =
  "El enlace no incluye un ID de equipo válido. Abre esta página desde el panel del equipo (por ejemplo /group/123/resultados).";

const RESULTADOS_PDF_EXPORT_ID = "resultados-dashboard-pdf";

const GROUP_COLUMNS = "id, name, age_band, created_at, organization_id";

const RESPONSE_COLUMNS =
  "id, group_id, participant_id, respondent_name, answers, started_at, completed_at";

type Participant = {
  id: string;
  name: string;
  group_id: string;
};

type Response = {
  id: string;
  group_id: string;
  participant_id: string | null;
  respondent_name?: string | null;
  answers: unknown;
  started_at?: string | null;
  completed_at?: string | null;
};

type AverageResponseTimeResult = {
  display: string;
  totalMs: number | null;
  validCount: number;
  isFastReflection: boolean;
};

type RankingEntry = {
  id: string;
  name: string;
  votes: number;
};

type SelectedParticipantProfile = {
  id: string;
  name: string;
  indegree: number;
  reciprocity: number;
  silo: string;
};

type VoteDetail = {
  voterId: string;
  voterName: string;
  choices: string[];
};

type InfluenceLeader = {
  id: string;
  name: string;
  votes: number;
};

type ReciprocityLeader = {
  id: string;
  name: string;
  mutualConnections: number;
};

type OnaClientMetrics = {
  links: GraphLink[];
  nodes: SociogramNode[];
  indegree: IndegreeMap;
  reciprocity: ReciprocityMap;
  density: NetworkDensity;
};

/** Transforma participants + responses de Supabase al grafo ONA y ejecuta el motor matemático. */
function computeOnaClientMetrics(
  participants: Participant[],
  responses: Response[],
): OnaClientMetrics {
  const links = buildGraphLinksFromResponses(participants, responses);
  const nodes = buildGraphNodes(participants, links);
  const indegree = calculateIndegree(links);
  const reciprocity = calculateReciprocity(links);
  const density = calculateNetworkDensity(participants.length, links);

  return { links, nodes, indegree, reciprocity, density };
}

function logOnaClientMetrics(
  source: string,
  metrics: OnaClientMetrics,
): void {
  console.log("[CLIENTE ONA]", source, {
    indegree: metrics.indegree,
    reciprocity: metrics.reciprocity,
    density: metrics.density,
    linkCount: metrics.links.length,
    nodeCount: metrics.nodes.length,
  });
}

function buildInfluenceLeaders(
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

function buildReciprocityLeaders(
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

const TWO_MINUTES_MS = 2 * 60 * 1000;

function parseResponseDurationMs(
  startedAt: unknown,
  completedAt: unknown,
): number | null {
  if (typeof startedAt !== "string" || typeof completedAt !== "string") {
    return null;
  }

  const startedMs = Date.parse(startedAt);
  const completedMs = Date.parse(completedAt);

  if (!Number.isFinite(startedMs) || !Number.isFinite(completedMs)) {
    return null;
  }

  const durationMs = completedMs - startedMs;

  if (durationMs < 0) {
    return null;
  }

  return durationMs;
}

function formatDurationMs(totalMs: number): string {
  const totalSeconds = Math.round(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function calculateAverageResponseTime(
  responses: ReadonlyArray<unknown>,
): AverageResponseTimeResult {
  const durationsMs: number[] = [];

  for (const response of responses) {
    if (!response || typeof response !== "object") {
      continue;
    }

    const record = response as {
      started_at?: unknown;
      completed_at?: unknown;
    };
    const durationMs = parseResponseDurationMs(
      record.started_at,
      record.completed_at,
    );

    if (durationMs !== null) {
      durationsMs.push(durationMs);
    }
  }

  if (durationsMs.length === 0) {
    return {
      display: "N/A",
      totalMs: null,
      validCount: 0,
      isFastReflection: false,
    };
  }

  const averageMs =
    durationsMs.reduce((sum, durationMs) => sum + durationMs, 0) /
    durationsMs.length;

  return {
    display: formatDurationMs(averageMs),
    totalMs: averageMs,
    validCount: durationsMs.length,
    isFastReflection: averageMs < TWO_MINUTES_MS,
  };
}

function buildRanking(
  participants: Participant[],
  responses: Response[],
): RankingEntry[] {
  const voteCounts = new Map<string, number>();

  for (const participant of participants) {
    voteCounts.set(String(participant.id), 0);
  }

  for (const response of responses) {
    for (const chosenId of parseResponseAnswers(response.answers)) {
      voteCounts.set(chosenId, (voteCounts.get(chosenId) ?? 0) + 1);
    }
  }

  return participants
    .map((participant) => ({
      id: String(participant.id),
      name: participant.name,
      votes: voteCounts.get(String(participant.id)) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.votes - a.votes || a.name.localeCompare(b.name, "es"),
    );
}

function resolveParticipantSiloLabel(
  participantId: string,
  silos: NetworkSilo[],
): string {
  const normalizedId = normalizeParticipantId(participantId);
  const silo = silos.find((candidate) =>
    candidate.memberIds.some(
      (memberId) => normalizeParticipantId(memberId) === normalizedId,
    ),
  );

  if (!silo) {
    return "Sin silo aislado (integrado en la red general del equipo)";
  }

  return `Silo ${silo.id.toUpperCase()} (${silo.size} miembros)`;
}

function resolveVoterName(
  response: Response,
  lookup: ParticipantNameLookup,
): string {
  if (response.participant_id) {
    const fromParticipant = resolveParticipantDisplayName(
      String(response.participant_id),
      lookup,
    );

    if (fromParticipant !== "Desconocido") {
      return fromParticipant;
    }
  }

  const fromColumn = response.respondent_name?.trim();
  if (fromColumn) {
    return fromColumn;
  }

  const fromAnswers = extractRespondentNameFromAnswers(response.answers);
  if (fromAnswers) {
    return fromAnswers;
  }

  return "Desconocido";
}

function buildVoteDetails(
  responses: Response[],
  lookup: ParticipantNameLookup,
): VoteDetail[] {
  return responses
    .map((response) => {
      const choiceIds = parseResponseAnswers(response.answers);

      return {
        voterId: response.participant_id
          ? normalizeParticipantId(String(response.participant_id))
          : response.id,
        voterName: resolveVoterName(response, lookup),
        choices: choiceIds.map((id) =>
          resolveParticipantDisplayName(id, lookup),
        ),
      };
    })
    .sort((a, b) => a.voterName.localeCompare(b.voterName, "es"));
}

export default function ResultadosPage() {
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const { routeGroupId: groupId, numericGroupId, paramsReady } = useMemo(
    () => resolveRouteGroupId(params),
    [params],
  );

  const [realGroupName, setRealGroupName] = useState<string | null>(null);
  const [realParticipants, setRealParticipants] = useState<Participant[]>([]);
  const [realResponses, setRealResponses] = useState<Response[]>([]);
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [selectedDemoOrg, setSelectedDemoOrg] = useState<DemoOrgId>(
    "tech-solutions",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [aiReport, setAiReport] = useState<any>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [selectedParticipant, setSelectedParticipant] =
    useState<SelectedParticipantProfile | null>(null);
  const [individualInsight, setIndividualInsight] = useState<string | null>(null);
  const [isGeneratingIndividual, setIsGeneratingIndividual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(
    null,
  );
  const [metrics, setMetrics] = useState<NetworkMetricsResult | null>(null);
  const [rpcMetrics, setRpcMetrics] = useState<
    Array<{
      participant_name: string;
      indegree_count: number;
      relative_centrality: number;
    }>
  >([]);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [edtMetrics, setEdtMetrics] = useState<EdtMetricsResult | null>(null);

  const supabase = useMemo(() => getSupabase(), []);
  const pdfExportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (IS_LOCAL_DEV) {
      console.warn(
        "[resultados] Modo desarrollo: bypass tenant activo —",
        FALLBACK_TEST_TENANT_ID,
      );
    }
  }, []);

  const fetchGroupData = useCallback(async () => {
    if (numericGroupId === null) {
      return;
    }

    if (!IS_LOCAL_DEV) {
      setError(null);
    }

    const [groupResult, participantsResult, responsesResult] =
      await Promise.all([
        supabase
          .from("groups")
          .select(GROUP_COLUMNS)
          .eq("id", numericGroupId)
          .maybeSingle(),
        supabase
          .from("participants")
          .select("id, name, group_id")
          .eq("group_id", numericGroupId),
        supabase
          .from("responses")
          .select(RESPONSE_COLUMNS)
          .eq("group_id", numericGroupId),
      ]);

    console.log("Datos devueltos (groups):", groupResult.data);
    console.log("Datos devueltos (participants):", participantsResult.data);
    console.log("Datos devueltos (responses):", responsesResult.data);

    if (groupResult.error || !groupResult.data) {
      if (IS_LOCAL_DEV) {
        console.warn(
          "[fetchGroupData] Dev bypass: grupo no encontrado — continuando con datos del group_id.",
          groupResult.error?.message,
        );
        setRealGroupName(`Equipo ${groupId} (dev)`);
      } else {
        setError(
          groupResult.error?.message || "No se encontró el equipo.",
        );
        return;
      }
    } else {
      setRealGroupName(groupResult.data.name);
    }

    if (participantsResult.error) {
      if (IS_LOCAL_DEV) {
        console.warn(
          "[fetchGroupData] Dev bypass: error en participants —",
          participantsResult.error.message,
        );
        setRealParticipants([]);
      } else {
        setError(participantsResult.error.message);
        return;
      }
    } else {
      setRealParticipants(participantsResult.data ?? []);
    }

    if (responsesResult.error) {
      if (IS_LOCAL_DEV) {
        console.warn(
          "[fetchGroupData] Dev bypass: error en responses —",
          responsesResult.error.message,
        );
        setRealResponses([]);
      } else {
        setError(responsesResult.error.message);
        return;
      }
    } else {
      setRealResponses(responsesResult.data ?? []);
    }

    const participantsList = participantsResult.error
      ? []
      : (participantsResult.data ?? []);
    const responsesList = responsesResult.error
      ? []
      : (responsesResult.data ?? []);

    if (participantsList.length > 0 || responsesList.length > 0) {
      logOnaClientMetrics(
        "fetchGroupData",
        computeOnaClientMetrics(participantsList, responsesList),
      );
    }

    if (IS_LOCAL_DEV) {
      setError(null);
    }
  }, [groupId, numericGroupId, supabase]);

  const demoDataset = useMemo(
    () => buildDemoDatasetForGroup(selectedDemoOrg, groupId),
    [selectedDemoOrg, groupId],
  );

  const fetchData = useCallback(async () => {
    if (numericGroupId === null) {
      return;
    }

    console.log("ID del grupo detectado en la URL:", numericGroupId);

    const loadMetricsForGroup = async (targetGroupId: number) => {
      const [participantsResult, responsesResult] = await Promise.all([
        supabase
          .from("participants")
          .select("id, name, group_id")
          .eq("group_id", targetGroupId),
        supabase
          .from("responses")
          .select(RESPONSE_COLUMNS)
          .eq("group_id", targetGroupId),
      ]);

      console.log("Datos devueltos (participants):", participantsResult.data);
      console.log("Datos devueltos (responses):", responsesResult.data);

      if (participantsResult.error) {
        if (IS_LOCAL_DEV) {
          console.warn(
            "[fetchData] Dev bypass: error en participants —",
            participantsResult.error.message,
          );
          setMetrics(null);
          setEdtMetrics(null);
          setMetricsError(null);
          return;
        }

        setMetricsError(participantsResult.error.message);
        setMetrics(null);
        setEdtMetrics(null);
        return;
      }

      if (responsesResult.error) {
        if (IS_LOCAL_DEV) {
          console.warn(
            "[fetchData] Dev bypass: error en responses —",
            responsesResult.error.message,
          );
          setMetrics(null);
          setEdtMetrics(null);
          setMetricsError(null);
          return;
        }

        setMetricsError(responsesResult.error.message);
        setMetrics(null);
        setEdtMetrics(null);
        return;
      }

      const participantsList = participantsResult.data ?? [];
      const responsesList = responsesResult.data ?? [];

      logOnaClientMetrics(
        "fetchData",
        computeOnaClientMetrics(participantsList, responsesList),
      );

      const calculatedMetrics = calculateNetworkMetrics(
        participantsList,
        responsesList,
      );
      const calculatedEdtMetrics = computeEdtMetrics(
        responsesList.map((response) => ({ answers: response.answers })),
      );

      console.log("Datos devueltos (métricas ONA):", calculatedMetrics);
      console.log("Datos devueltos (métricas EDT):", calculatedEdtMetrics);
      setMetrics(calculatedMetrics);
      setEdtMetrics(calculatedEdtMetrics);
      setMetricsError(null);

      const { data, error: metricsRpcError } = await supabase.rpc(
        "get_team_network_metrics",
        {
          target_group_id: targetGroupId,
        },
      );

      console.log("Datos devueltos (RPC):", data);

      if (metricsRpcError) {
        console.error(
          "Error real de Supabase:",
          JSON.stringify(metricsRpcError, null, 2),
        );
        setRpcMetrics([]);
      } else {
        setRpcMetrics(data || []);
      }
    };

    try {
      if (IS_LOCAL_DEV) {
        console.warn(
          "[fetchData] Dev bypass: validación tenant omitida — tenant de pruebas:",
          FALLBACK_TEST_TENANT_ID,
        );
        setError(null);
        setMetricsError(null);
        await loadMetricsForGroup(numericGroupId);
        return;
      }

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setError(TENANT_ACCESS_DENIED_MESSAGE);
        setMetricsError(TENANT_ACCESS_DENIED_MESSAGE);
        setMetrics(null);
        setEdtMetrics(null);
        setRpcMetrics([]);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile?.tenant_id) {
        console.error("[fetchData] Perfil sin tenant válido:", {
          userId: user.id,
          profileError,
        });
        setError(TENANT_ACCESS_DENIED_MESSAGE);
        setMetricsError(TENANT_ACCESS_DENIED_MESSAGE);
        setMetrics(null);
        setEdtMetrics(null);
        setRpcMetrics([]);
        return;
      }

      const { data: groupRow, error: groupError } = await supabase
        .from("groups")
        .select("id, tenant_id")
        .eq("id", numericGroupId)
        .eq("tenant_id", profile.tenant_id)
        .maybeSingle();

      if (groupError || !groupRow) {
        console.error("[fetchData] Acceso denegado al grupo:", {
          groupId: numericGroupId,
          tenantId: profile.tenant_id,
          groupError,
        });
        setError(TENANT_ACCESS_DENIED_MESSAGE);
        setMetricsError(TENANT_ACCESS_DENIED_MESSAGE);
        setMetrics(null);
        setEdtMetrics(null);
        setRpcMetrics([]);
        return;
      }

      await loadMetricsForGroup(numericGroupId);
    } catch (err: any) {
      console.error("Error inesperado:", err);

      if (IS_LOCAL_DEV) {
        console.warn("[fetchData] Dev bypass: error inesperado — sin bloqueo de UI.");
        setMetricsError(null);
        return;
      }

      setMetricsError(err.message || "Error");
      setMetrics(null);
      setEdtMetrics(null);
    }
  }, [numericGroupId, supabase]);

  const participants = demoModeEnabled
    ? demoDataset.participants
    : realParticipants;

  const responses = demoModeEnabled ? demoDataset.responses : realResponses;

  const displayedEdtMetrics = useMemo(() => {
    if (edtMetrics && !demoModeEnabled) {
      return edtMetrics;
    }

    return computeEdtMetrics(
      responses.map((response) => ({ answers: response.answers })),
    );
  }, [demoModeEnabled, edtMetrics, responses]);

  const groupName = demoModeEnabled
    ? `${demoDataset.teamName} · ${demoDataset.organizationName}`
    : realGroupName;

  function handleSelectDemoOrg(orgId: DemoOrgId) {
    setSelectedDemoOrg(orgId);
    setAiInsight(null);
    setAiReport(null);
    setSelectedParticipant(null);
    setIndividualInsight(null);
  }

  function handleToggleDemoMode(enabled: boolean) {
    setDemoModeEnabled(enabled);
    setAiInsight(null);
    setAiReport(null);
    setSelectedParticipant(null);
    setIndividualInsight(null);
    if (enabled) {
      setImportSuccessMessage(null);
    }
  }

  async function handleGenerateOnaInsight() {
    if (isGeneratingInsight) {
      return;
    }

    if (participants.length === 0) {
      setError("No hay colaboradores en el equipo para generar el diagnóstico.");
      return;
    }

    setIsGeneratingInsight(true);
    setAiInsight(null);
    setError(null);

    try {
      const response = await fetch("/api/team-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "group",
          groupName: groupName ?? `Equipo ${groupId}`,
          indegree: onaMetrics.indegree,
          reciprocity: onaMetrics.reciprocity,
          density: onaMetrics.density,
          silos: networkSilos,
          participants: participants.map((participant) => ({
            id: String(participant.id),
            name: participant.name,
          })),
        }),
      });

      const data = (await response.json()) as {
        insight?: string | null;
        error?: string;
        fallback?: boolean;
      };

      if (!response.ok || !data.insight) {
        setAiInsight(
          data.error ??
            AI_MAINTENANCE_MESSAGE,
        );
        return;
      }

      setAiInsight(data.insight);
    } catch {
      setAiInsight(AI_MAINTENANCE_MESSAGE);
    } finally {
      setIsGeneratingInsight(false);
    }
  }

  async function handleImportVotes(
    file: File,
    reportProgress: (label: string) => void,
  ) {
    reportProgress("Leyendo archivo…");

    const { participants: importedParticipants, responses: importedResponses } =
      await parseVotesImportFile(file, groupId);

    reportProgress("Guardando en base de datos…");

    const persisted = await persistVotesImportToSupabase({
      groupId,
      demoOrgId: selectedDemoOrg,
      participants: importedParticipants,
      responses: importedResponses,
    });

    setDemoModeEnabled(false);
    setRealParticipants(persisted.participants);
    setRealResponses(persisted.responses);
    setAiInsight(null);
    setError(null);
    setImportSuccessMessage(
      "¡Datos guardados con éxito en Supabase para la organización seleccionada!",
    );

    await Promise.all([fetchGroupData(), fetchData()]);
  }

  useEffect(() => {
    if (!paramsReady) {
      return;
    }

    if (numericGroupId === null) {
      setIsLoading(false);
      setError(INVALID_GROUP_ID_MESSAGE);
      setMetricsError(INVALID_GROUP_ID_MESSAGE);
      return;
    }

    async function load() {
      setIsLoading(true);
      setError(null);
      await Promise.all([fetchGroupData(), fetchData()]);
      setIsLoading(false);
    }

    load();
  }, [paramsReady, numericGroupId, fetchGroupData, fetchData]);

  async function handleSimulateVotes() {
    if (isSimulating) {
      return;
    }

    setIsSimulating(true);
    setError(null);

    try {
      const result = await simulateDevVotesForGroup(getSupabase(), groupId);

      setDemoModeEnabled(false);
      setAiReport(null);
      setAiInsight(null);
      setImportSuccessMessage(
        `${result.responseCount} respuestas simuladas insertadas (${result.participantCount} colaboradores ficticios · survey ${result.surveyId.slice(0, 8)}…).`,
      );

      await Promise.all([fetchGroupData(), fetchData()]);
      router.refresh();
    } catch (err) {
      console.error("[resultados] Error simulando votos:", err);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron simular los votos de prueba.",
      );
    } finally {
      setIsSimulating(false);
    }
  }

  const participantNameLookup = useMemo(
    () => buildParticipantNameLookup(participants),
    [participants],
  );

  const nameById = participantNameLookup.nameById;

  const ranking = useMemo(
    () => buildRanking(participants, responses),
    [participants, responses],
  );

  const voteDetails = useMemo(
    () => buildVoteDetails(responses, participantNameLookup),
    [responses, participantNameLookup],
  );

  const onaMetrics = useMemo(
    () => computeOnaClientMetrics(participants, responses),
    [participants, responses],
  );

  const graphLinks = onaMetrics.links;
  const indegreeMap = onaMetrics.indegree;
  const networkDensity = onaMetrics.density;

  const averageResponseTime = useMemo(
    () => calculateAverageResponseTime(responses),
    [responses],
  );

  useEffect(() => {
    if (participants.length === 0 && responses.length === 0) {
      return;
    }

    console.log("[CLIENTE ONA]", {
      indegree: onaMetrics.indegree,
      reciprocity: onaMetrics.reciprocity,
      density: onaMetrics.density,
      nodes: onaMetrics.nodes,
      links: onaMetrics.links,
    });
  }, [onaMetrics, participants.length, responses.length]);

  const affinityGraphData = useMemo(
    () => buildEdtAffinityGraphData(participants, responses),
    [participants, responses],
  );

  const influenceLeaders = useMemo(
    () => buildInfluenceLeaders(graphLinks, nameById),
    [graphLinks, nameById],
  );

  const reciprocityLeaders = useMemo(
    () => buildReciprocityLeaders(graphLinks, nameById),
    [graphLinks, nameById],
  );

  const isolatedParticipants = useMemo(
    () => calculateIsolation(participants, indegreeMap),
    [participants, indegreeMap],
  );

  const networkSilos = useMemo(
    () => detectNetworkSilos(participants, graphLinks),
    [participants, graphLinks],
  );

  const participantsWithResponses = useMemo(() => {
    const ids = new Set<string>();
    for (const response of responses) {
      if (response.participant_id) {
        ids.add(normalizeParticipantId(String(response.participant_id)));
      }
    }
    return ids;
  }, [responses]);

  function closeIndividualInsightModal() {
    setSelectedParticipant(null);
    setIndividualInsight(null);
    setIsGeneratingIndividual(false);
  }

  async function handleGenerateIndividualInsight(entry: RankingEntry) {
    if (isGeneratingIndividual) {
      return;
    }

    if (
      !participantsWithResponses.has(normalizeParticipantId(entry.id))
    ) {
      return;
    }

    const participantId = entry.id;
    const normalizedParticipantId = normalizeParticipantId(participantId);
    const teamOnaMetrics = computeOnaClientMetrics(participants, responses);
    const participantIndegree =
      teamOnaMetrics.indegree[normalizedParticipantId] ??
      indegreeMap[normalizedParticipantId] ??
      entry.votes;
    const participantReciprocity =
      teamOnaMetrics.reciprocity[normalizedParticipantId] ?? 0;
    const participantSilo = resolveParticipantSiloLabel(
      participantId,
      networkSilos,
    );
    const participantResponse = responses.find(
      (response) =>
        response.participant_id !== null &&
        normalizeParticipantId(String(response.participant_id)) ===
          normalizedParticipantId,
    );

    const profile: SelectedParticipantProfile = {
      id: participantId,
      name: entry.name,
      indegree: participantIndegree,
      reciprocity: participantReciprocity,
      silo: participantSilo,
    };

    setSelectedParticipant(profile);
    setIndividualInsight(null);
    setIsGeneratingIndividual(true);
    setError(null);

    try {
      const res = await fetch("/api/team-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "individual",
          groupName: groupName ?? `Equipo ${groupId}`,
          participantId: profile.id,
          participantName: profile.name,
          participantIndegree: profile.indegree,
          participantReciprocity: profile.reciprocity,
          participantSilo: profile.silo,
          networkDensityPercent: teamOnaMetrics.density.densityPercent,
          density: teamOnaMetrics.density,
          participants: participants.map((participant) => ({
            id: String(participant.id),
            name: participant.name,
          })),
          responses: responses.map((response) => ({
            participant_id: response.participant_id,
            answers: response.answers,
          })),
          participantAnswers: participantResponse?.answers ?? null,
        }),
      });

      const data = (await res.json()) as {
        insight?: string | null;
        error?: string;
        fallback?: boolean;
      };

      if (res.ok && typeof data.insight === "string" && data.insight.trim()) {
        setIndividualInsight(data.insight.trim());
        return;
      }

      setIndividualInsight(data.error?.trim() || AI_MAINTENANCE_MESSAGE);
    } catch (fetchError) {
      console.error("[resultados] Error al generar radiografía individual:", fetchError);
      setIndividualInsight(AI_MAINTENANCE_MESSAGE);
    } finally {
      setIsGeneratingIndividual(false);
    }
  }

  async function handleGenerateReport() {
    if (generating) {
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/generate-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groupName: groupName ?? "Equipo",
          edt: {
            entornoMedia: displayedEdtMetrics.entornoMedia,
            direccionMedia: displayedEdtMetrics.direccionMedia,
            talentoMedia: displayedEdtMetrics.talentoMedia,
            transversalMedia: displayedEdtMetrics.transversalMedia,
            mediaGlobalSistema: displayedEdtMetrics.mediaGlobalSistema,
          },
          ona: {
            density:
              metrics?.team.densityPercent ?? networkDensity.densityPercent,
            leaders: influenceLeaders.map((leader) => leader.name),
            isolated: isolatedParticipants.map(
              (participant) => participant.name,
            ),
            silosCount: networkSilos.length,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Error al generar el informe IA");
      }

      setAiReport(data);
    } catch (err) {
      console.error("[resultados] Error generando informe IA:", err);
      setError(
        err instanceof Error ? err.message : "Error al generar el informe IA",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadPDF() {
    if (isDownloadingPdf) {
      return;
    }

    const element =
      pdfExportRef.current ??
      document.getElementById(RESULTADOS_PDF_EXPORT_ID);

    if (!element) {
      setError("No se encontró el contenedor del informe para exportar.");
      return;
    }

    setIsDownloadingPdf(true);
    setError(null);

    try {
      // Breve pausa para que el grafo ONA (canvas) termine de renderizar
      await new Promise((resolve) => setTimeout(resolve, 450));

      const html2pdf = (await import("html2pdf.js")).default;

      const safeName = (groupName ?? `equipo_${groupId}`)
        .replace(/[^\w\s\-·]/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 48);

      await html2pdf()
        .set({
          margin: 15,
          filename: `ElevateX_Informe_${safeName || "Equipo"}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: "#020617",
            logging: false,
            scrollX: 0,
            scrollY: -window.scrollY,
            windowWidth: element.scrollWidth,
            windowHeight: element.scrollHeight,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(element)
        .save();
    } catch (err) {
      console.error("[resultados] Error generando PDF:", err);
      setError(
        err instanceof Error ? err.message : "No se pudo generar el PDF.",
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  }

  const maxVotes = ranking[0]?.votes ?? 0;

  return (
    <div className="min-h-full bg-slate-50 print:bg-white">
      <header className="border-b border-slate-200 bg-white print:border-slate-300">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <Link
            href={numericGroupId ? `/group/${numericGroupId}` : "/"}
            className="mb-3 inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 print:hidden"
          >
            ← Volver al equipo
          </Link>
          {isLoading && !demoModeEnabled ? (
            <div className="h-8 w-64 animate-pulse rounded bg-slate-200 print:hidden" />
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Análisis de Redes
                  </h1>
                  {groupName && (
                    <p className="mt-1 text-sm text-slate-500">{groupName}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row print:hidden">
                  <button
                    type="button"
                    onClick={handleDownloadPDF}
                    disabled={isDownloadingPdf}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDownloadingPdf ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                        Generando PDF...
                      </>
                    ) : (
                      "Descargar Informe PDF"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateOnaInsight}
                    disabled={isGeneratingInsight || participants.length === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-100 active:bg-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isGeneratingInsight ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-700" />
                        Generando diagnóstico...
                      </>
                    ) : (
                      "Generar Diagnóstico IA"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={generating}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 active:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {generating ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Analizando datos con IA...
                      </>
                    ) : (
                      "Generar Informe IA ✨"
                    )}
                  </button>
                  {!demoModeEnabled && (
                    <button
                      type="button"
                      onClick={handleSimulateVotes}
                      disabled={isSimulating}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSimulating ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Simulando...
                        </>
                      ) : (
                        "Simular Votos (Dev)"
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-5 print:hidden">
                <DemoModePanel
                  selectedOrgId={selectedDemoOrg}
                  onSelectOrg={handleSelectDemoOrg}
                  demoModeEnabled={demoModeEnabled}
                  onToggleDemoMode={handleToggleDemoMode}
                />
              </div>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10 print:space-y-6 print:py-6">
        {error &&
          !(IS_LOCAL_DEV && error === TENANT_ACCESS_DENIED_MESSAGE) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">
            {error}
          </div>
        )}

        {aiInsight && (
          <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm print:border-slate-200 print:shadow-none">
            <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-slate-50 px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                  People Analytics · ONA
                </span>
                <span className="text-xs text-slate-500">
                  Diagnóstico generado por IA
                </span>
              </div>
              <h2 className="mt-2 text-lg font-semibold text-slate-900">
                Diagnóstico ejecutivo del equipo
              </h2>
            </div>
            <div className="px-6 py-5">
              <p className="whitespace-pre-line text-base leading-relaxed text-slate-700">
                {aiInsight}
              </p>
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:hidden">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Importar Votaciones del Equipo
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Carga masiva de respuestas desde Excel o CSV para actualizar el
              análisis de redes del equipo.
            </p>
          </div>

          <div className="p-6">
            <TeamVotesImportZone
              onProcess={handleImportVotes}
              successMessage={importSuccessMessage}
            />
          </div>
        </section>

        <div
          ref={pdfExportRef}
          id={RESULTADOS_PDF_EXPORT_ID}
          className="space-y-8 rounded-2xl bg-slate-950 p-6 ring-1 ring-violet-500/40 shadow-[0_0_40px_rgba(139,92,246,0.18)]"
        >
          <header className="border-b border-violet-500/30 pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
              ElevateX · Informe de Diagnóstico
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
              {groupName ?? "Equipo"}
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Métricas EDT · Análisis de Redes ONA · Consultoría IA
            </p>
          </header>

        <EdtExecutiveDashboard metrics={displayedEdtMetrics} />

        <section className="overflow-hidden rounded-xl border border-violet-500/40 bg-slate-900 shadow-[0_0_24px_rgba(139,92,246,0.15)]">
          <div className="border-b border-violet-500/30 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">
              Mapa de Conexiones del Equipo
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Visualización interactiva de afinidad EDT entre colaboradores
              (coincidencias A–D en preguntas 1–28, umbral ≥ 18).
            </p>
          </div>

          <div className="p-6">
            {isLoading && !demoModeEnabled ? (
              <div className="flex h-[480px] items-center justify-center rounded-xl bg-slate-950 text-sm text-slate-400">
                Cargando mapa de conexiones…
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="space-y-6">
                  <div className="rounded-xl border border-violet-500/25 bg-slate-950/80 p-5 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-300">
                      Densidad de Red
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Proporción de conexiones reales frente al máximo posible
                      en la red ({networkDensity.linkCount} enlaces ·{" "}
                      {networkDensity.nodeCount} nodos).
                    </p>
                    <div className="mt-4 flex items-end gap-3">
                      <p className="text-3xl font-semibold text-white">
                        {networkDensity.densityPercent}%
                      </p>
                      <p className="pb-1 text-xs text-slate-500">
                        {networkDensity.linkCount}/{networkDensity.maxPossibleLinks}{" "}
                        posibles
                      </p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.6)] transition-all"
                        style={{ width: `${networkDensity.densityPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-violet-500/25 bg-slate-950/80 p-5 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-300">
                      Tiempo Promedio de Respuesta
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {averageResponseTime.validCount > 0
                        ? `Duración media entre abrir y enviar el cuestionario (${averageResponseTime.validCount} respuesta${averageResponseTime.validCount === 1 ? "" : "s"} válida${averageResponseTime.validCount === 1 ? "" : "s"}).`
                        : "Duración media entre abrir y enviar el cuestionario."}
                    </p>
                    <div className="mt-4 flex items-end gap-3">
                      <p className="text-3xl font-semibold text-white">
                        {averageResponseTime.display}
                      </p>
                    </div>
                    {averageResponseTime.isFastReflection ? (
                      <p className="mt-3 text-xs text-amber-500/90">
                        Respuestas rápidas - Posible baja reflexión
                      </p>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-cyan-500/25 bg-slate-950/80 p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-300">
                      Silos Detectados
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Subgrupos conectados internamente pero separados del resto
                      de la organización.
                    </p>

                    {networkSilos.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-400">
                        No hay silos significativos: la red está integrada o aún
                        no hay suficientes respuestas.
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-3">
                        {networkSilos.map((silo) => (
                          <li
                            key={silo.id}
                            className="rounded-lg border border-cyan-500/20 bg-slate-900 px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-cyan-400/80">
                                  {silo.id.toUpperCase()}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-100">
                                  {silo.memberNames.join(", ")}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300">
                                {silo.size} miembros
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl border border-violet-500/25 bg-slate-950/80 p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-300">
                      Líderes de Influencia
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Top 3 colaboradores con más conexiones recibidas.
                    </p>

                    {influenceLeaders.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-400">
                        Aún no hay datos suficientes para identificar líderes.
                      </p>
                    ) : (
                      <ol className="mt-4 space-y-3">
                        {influenceLeaders.map((leader, index) => (
                          <li
                            key={`${leader.id}-${index}`}
                            className="rounded-lg border border-violet-500/20 bg-slate-900 px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-slate-500">
                                  #{index + 1}
                                </p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                                  {leader.name}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-300">
                                {leader.votes}{" "}
                                {leader.votes === 1 ? "conexión" : "conexiones"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div className="rounded-xl border border-violet-500/25 bg-slate-950/80 p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-300">
                      Conexiones Fuertes (Reciprocidad)
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Top 3 colaboradores con más votos mutuos en el equipo.
                    </p>

                    {reciprocityLeaders.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-400">
                        Aún no hay conexiones mutuas en este equipo
                      </p>
                    ) : (
                      <ol className="mt-4 space-y-3">
                        {reciprocityLeaders.map((leader, index) => (
                          <li
                            key={`${leader.id}-${index}`}
                            className="rounded-lg border border-violet-500/20 bg-slate-900 px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-slate-500">
                                  #{index + 1}
                                </p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                                  {leader.name}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                                {leader.mutualConnections}{" "}
                                {leader.mutualConnections === 1
                                  ? "mutua"
                                  : "mutuas"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div className="rounded-xl border border-red-500/25 bg-slate-950/80 p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-red-400">
                      Atención Requerida (Aislamiento)
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Miembros sin conexiones entrantes en la red del equipo.
                    </p>

                    {isolatedParticipants.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-400">
                        Todos los miembros están integrados en la red
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-3">
                        {isolatedParticipants.map((participant, index) => (
                          <li
                            key={`${participant.id}-${index}`}
                            className="flex items-center justify-between rounded-lg border border-red-500/20 bg-slate-900 px-4 py-3 shadow-sm"
                          >
                            <p className="text-sm font-semibold text-slate-100">
                              {participant.name}
                            </p>
                            <span className="inline-flex shrink-0 rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-300">
                              Aislado
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </aside>

                <div className="overflow-hidden rounded-xl border border-violet-500/30 bg-slate-950 shadow-[0_0_20px_rgba(139,92,246,0.12)]">
                  <SociogramGraph graphData={affinityGraphData} />
                </div>
              </div>
            )}
          </div>
        </section>

        {aiReport && (
          <section className="overflow-hidden rounded-2xl border border-violet-500/60 bg-slate-950 shadow-[0_0_32px_rgba(139,92,246,0.35),0_0_64px_rgba(139,92,246,0.12)]">
            <div className="border-b border-violet-500/30 bg-gradient-to-br from-slate-950 via-violet-950/40 to-slate-950 px-6 py-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-violet-400/50 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-300 shadow-[0_0_12px_rgba(167,139,250,0.25)]">
                  ElevateX · Consultoría IA
                </span>
                <span className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
                  EDT + ONA
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">
                Diagnóstico Estratégico Automatizado
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                Motor de consultoría integrado — cruce Entorno, Dirección, Talento
                y anomalías sociométricas.
              </p>
            </div>

            <div className="space-y-5 p-6">
              <article className="rounded-xl border border-violet-500/30 bg-slate-900/80 p-6 shadow-[inset_0_1px_0_rgba(167,139,250,0.08)]">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
                  Resumen Ejecutivo
                </h3>
                <p className="mt-4 text-base leading-relaxed text-slate-200">
                  {aiReport.resumenEjecutivo}
                </p>
              </article>

              <article className="rounded-xl border border-violet-500/30 bg-slate-900/80 p-6 shadow-[inset_0_1px_0_rgba(167,139,250,0.08)]">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
                  Principales Riesgos
                </h3>
                <ul className="mt-4 space-y-3">
                  {Array.isArray(aiReport.principalesRiesgos) &&
                    aiReport.principalesRiesgos.map(
                      (riesgo: string, index: number) => (
                        <li
                          key={`${index}-${riesgo.slice(0, 32)}`}
                          className="flex gap-3 rounded-lg border border-red-500/20 bg-slate-950/60 px-4 py-3"
                        >
                          <span className="inline-flex shrink-0 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                            Riesgo {index + 1}
                          </span>
                          <p className="text-sm leading-relaxed text-slate-300">
                            {riesgo}
                          </p>
                        </li>
                      ),
                    )}
                </ul>
              </article>

              <article className="rounded-xl border border-violet-500/30 bg-slate-900/80 p-6 shadow-[inset_0_1px_0_rgba(167,139,250,0.08)]">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  Plan de Acción Inmediato
                </h3>
                <ol className="mt-4 space-y-3">
                  {Array.isArray(aiReport.planAccionInmediato) &&
                    aiReport.planAccionInmediato.map(
                      (iniciativa: string, index: number) => (
                        <li
                          key={`${index}-${iniciativa.slice(0, 32)}`}
                          className="flex gap-4 rounded-lg border border-cyan-500/20 bg-slate-950/60 px-4 py-4"
                        >
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-500/10 text-xs font-bold text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.2)]">
                            {index + 1}
                          </span>
                          <p className="text-sm leading-relaxed text-slate-300">
                            <span className="mr-2 text-cyan-400">▸</span>
                            {iniciativa}
                          </p>
                        </li>
                      ),
                    )}
                </ol>
              </article>
            </div>
          </section>
        )}

        </div>

        {generating && !aiReport && (
          <section className="overflow-hidden rounded-2xl border border-violet-500/40 bg-slate-950 p-8 shadow-[0_0_24px_rgba(139,92,246,0.25)] print:hidden">
            <div className="flex items-center justify-center gap-3 text-sm font-medium text-violet-300">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
              Analizando datos con IA...
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Ranking de Conexión
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Colaboradores ordenados por número total de conexiones recibidas
              en el equipo.
            </p>
          </div>

          {isLoading && !demoModeEnabled ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              Cargando resultados…
            </div>
          ) : ranking.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No hay colaboradores en este equipo.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Posición
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Colaborador
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Conexiones
                    </th>
                    <th
                      scope="col"
                      className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Proporción
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {ranking.map((entry, index) => {
                    const hasCompletedSurvey = participantsWithResponses.has(
                      normalizeParticipantId(entry.id),
                    );

                    return (
                    <tr key={`${entry.id}-${index}`} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-500">
                        #{index + 1}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="whitespace-nowrap">{entry.name}</span>
                          <div className="group relative inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleGenerateIndividualInsight(entry)}
                              disabled={
                                isGeneratingIndividual || !hasCompletedSurvey
                              }
                              title={
                                hasCompletedSurvey
                                  ? undefined
                                  : "Pendiente de realizar test"
                              }
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                hasCompletedSurvey
                                  ? "border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-300 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 opacity-50"
                              }`}
                            >
                              {isGeneratingIndividual &&
                              selectedParticipant?.id === entry.id ? (
                                <>
                                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
                                  Analizando…
                                </>
                              ) : (
                                "Analizar Perfil con IA"
                              )}
                            </button>
                            {!hasCompletedSurvey ? (
                              <span className="text-xs text-slate-400 group-hover:text-slate-500">
                                Pendiente de realizar test
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700">
                          {entry.votes}{" "}
                          {entry.votes === 1 ? "conexión" : "conexiones"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-indigo-500 transition-all"
                              style={{
                                width:
                                  maxVotes > 0
                                    ? `${(entry.votes / maxVotes) * 100}%`
                                    : "0%",
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Mapa de Relaciones
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Respuestas individuales de cada colaborador que completó la
              dinámica de equipo.
            </p>
          </div>

          {isLoading && !demoModeEnabled ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              Cargando detalle…
            </div>
          ) : voteDetails.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              Aún no hay respuestas. Comparte el enlace de la dinámica con los
              colaboradores del equipo.
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {voteDetails.map((detail, index) => (
                <li key={`${detail.voterId}-${index}`} className="px-6 py-5">
                  <p className="text-sm font-semibold text-slate-900">
                    {detail.voterName}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Se alinea con:{" "}
                    <span className="font-medium text-slate-700">
                      {detail.choices.length > 0
                        ? detail.choices.join(", ")
                        : "Sin selección"}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {selectedParticipant && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="individual-insight-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/55 backdrop-blur-[1px]"
            aria-label="Cerrar radiografía del colaborador"
            onClick={closeIndividualInsightModal}
          />
          <section className="relative max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl">
            <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-6 py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-700">
                    Diagnóstico por Persona
                  </span>
                  <h2
                    id="individual-insight-title"
                    className="mt-3 text-xl font-semibold text-slate-900"
                  >
                    Radiografía de {selectedParticipant.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Indegree {selectedParticipant.indegree} · Reciprocidad{" "}
                    {selectedParticipant.reciprocity} ·{" "}
                    {selectedParticipant.silo}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeIndividualInsightModal}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
              {isGeneratingIndividual && !individualInsight ? (
                <div className="flex items-center justify-center gap-3 py-10 text-sm font-medium text-violet-700">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
                  Generando radiografía con IA…
                </div>
              ) : individualInsight ? (
                <article className="rounded-xl border border-violet-100 bg-gradient-to-br from-slate-50 via-white to-violet-50/40 p-5 shadow-sm">
                  <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                    {individualInsight}
                  </p>
                </article>
              ) : (
                <p className="py-6 text-center text-sm text-slate-500">
                  No se pudo cargar el diagnóstico individual.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
