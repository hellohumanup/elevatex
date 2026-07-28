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
  buildFallbackTeamDiagnosisMarkdown,
} from "@/lib/services/aiDiagnosis";
import {
  buildGraphLinksFromResponses,
  buildGraphNodes,
  buildParticipantNameLookup,
  calculateIndegree,
  calculateIsolation,
  calculateNetworkDensity,
  calculateNetworkMetrics,
  calculateNetworkReciprocity,
  calculateReciprocity,
  calculateWeightedIndegree,
  detectNetworkSilos,
  extractRespondentNameFromAnswers,
  normalizeParticipantId,
  parseResponseAnswers,
  resolveParticipantDisplayName,
  toAiDiagnosisMetricsPayload,
  type CalculatedNetworkMetrics,
  type GraphLink,
  type IndegreeMap,
  type NetworkDensity,
  type NetworkSilo,
  type ParticipantNameLookup,
  type ReciprocityMap,
  type SociogramNode,
  type WeightedIndegreeMap,
} from "@/lib/mathEngine";
import { getSupabase } from "@/lib/supabase";
import { computeEdtMetrics, type EdtMetricsResult } from "@/lib/edtMetrics";
import type { ElevateXOnaDiagnostics } from "@/lib/elevatexOnaEngine";
import { resolveRouteGroupId } from "@/lib/groupId";
import { FALLBACK_TEST_TENANT_ID } from "@/lib/groups";
import type { NetworkMetricsResult } from "@/lib/networkMetrics";
import { calculateNetworkDensity as calculateOnaNetworkDensity } from "@/lib/utils/onaMetrics";

/** Bypass de validación multi-tenant en desarrollo local. */
const IS_LOCAL_DEV = process.env.NODE_ENV === "development";

/** UUID de la organización piloto (Piloto BetaX) — aislamiento multi-tenant. */
const ACTIVE_ORGANIZATION_ID = "11111111-1111-1111-1111-111111111111";

const TENANT_ACCESS_DENIED_MESSAGE =
  "No tienes permisos para acceder a los datos de este equipo o el grupo no pertenece a tu organización.";

const INVALID_GROUP_ID_MESSAGE =
  "El enlace no incluye un ID de equipo válido. Abre esta página desde el panel del equipo (por ejemplo /group/123/resultados).";

const RESULTADOS_PDF_EXPORT_ID = "resultados-dashboard-pdf";

const GROUP_NAME_COLUMNS = "id, name";

/** Render Markdown ligero (##, listas, negrita) sin dependencia externa. */
function renderExecutiveMarkdown(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withInline = escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /`([^`]+)`/g,
      '<code class="break-all rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">$1</code>',
    );

  const withHeadings = withInline
    .replace(
      /^### (.+)$/gm,
      '<h3 class="mt-5 break-words text-base font-semibold text-slate-900">$1</h3>',
    )
    .replace(
      /^## (.+)$/gm,
      '<h2 class="mt-6 break-words text-lg font-semibold tracking-tight text-slate-900 first:mt-0">$1</h2>',
    )
    .replace(
      /^> (.+)$/gm,
      '<p class="mt-3 break-words rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">$1</p>',
    );

  const withLists = withHeadings.replace(
    /(?:^|\n)((?:(?:- |\d+\. ).+(?:\n|$))+)/g,
    (block) => {
      const lines = block.trim().split("\n").filter(Boolean);
      const isOrdered = /^\d+\.\s/.test(lines[0] ?? "");
      const items = lines
        .map((line) => line.replace(/^(- |\d+\. )/, "").trim())
        .filter(Boolean)
        .map(
          (item) =>
            `<li class="break-words leading-relaxed">${item}</li>`,
        )
        .join("");
      return isOrdered
        ? `\n<ol class="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">${items}</ol>\n`
        : `\n<ul class="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700">${items}</ul>\n`;
    },
  );

  return withLists
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      if (
        chunk.startsWith("<h2") ||
        chunk.startsWith("<h3") ||
        chunk.startsWith("<ul") ||
        chunk.startsWith("<ol") ||
        chunk.startsWith("<p class=")
      ) {
        return chunk;
      }
      return `<p class="mt-3 break-words text-sm leading-relaxed text-slate-700">${chunk.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");
}

type ExecutiveDiagnosisReport = {
  resumen_ejecutivo: string;
  puntos_fuertes: string[];
  riesgos_detectados: string[];
  recomendaciones_accionables: string[];
};

function formatExecutiveReportToMarkdown(
  report: ExecutiveDiagnosisReport,
): string {
  const section = (title: string, items: string[]) =>
    items.length > 0
      ? `## ${title}\n${items.map((item) => `- ${item}`).join("\n")}`
      : `## ${title}\n- Sin hallazgos destacados en esta categoría.`;

  return [
    "## Resumen ejecutivo",
    report.resumen_ejecutivo,
    section("Puntos fuertes", report.puntos_fuertes),
    section("Riesgos detectados", report.riesgos_detectados),
    section("Recomendaciones accionables", report.recomendaciones_accionables),
  ].join("\n\n");
}

type Participant = {
  id: string;
  name: string;
  group_id: string;
  email?: string;
  survey_status?: "pending_send" | "sent" | "completed";
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

/** Filas crudas hidratadas desde elevatex-metrics (bypass RLS en servidor). */
type ElevateXRawParticipant = {
  id: string;
  name: string;
  group_id: string;
  email?: string | null;
  survey_status?: "pending_send" | "sent" | "completed" | string | null;
};

type ElevateXRawResponse = {
  id: string;
  group_id: string;
  participant_id: string | null;
  respondent_name: string | null;
  answers: unknown;
  started_at: string | null;
  completed_at: string | null;
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
  /** Influencia ponderada (suma de pesos 1.0 / 0.7 / 0.4). */
  weightedIndegree: number;
  /** Conexiones mutuas (conteo legacy). */
  reciprocity: number;
  /** % de aristas incidentes correspondidas (0–100). */
  reciprocityPercent: number;
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
  /** Suma de pesos posicionales recibidos (1.0 / 0.7 / 0.4). */
  weightedIndegree: WeightedIndegreeMap;
  reciprocity: ReciprocityMap;
  density: NetworkDensity;
};

/** Fallback seguro mientras cargan o fallan las métricas ONA. */
const EMPTY_NETWORK_DENSITY: NetworkDensity = {
  nodeCount: 0,
  linkCount: 0,
  maxPossibleLinks: 0,
  density: 0,
  densityPercent: 0,
};

const EMPTY_ONA_METRICS: OnaClientMetrics = {
  links: [],
  nodes: [],
  indegree: {},
  weightedIndegree: {},
  reciprocity: {},
  density: EMPTY_NETWORK_DENSITY,
};

/** Transforma participants + responses de Supabase al grafo ONA y ejecuta el motor matemático. */
function computeOnaClientMetrics(
  participants: Participant[],
  responses: Response[],
): OnaClientMetrics {
  try {
    const safeParticipants = Array.isArray(participants) ? participants : [];
    const safeResponses = Array.isArray(responses) ? responses : [];
    const links = buildGraphLinksFromResponses(safeParticipants, safeResponses);
    const nodes = buildGraphNodes(safeParticipants, links);
    const indegree = calculateIndegree(links);
    const weightedIndegree = calculateWeightedIndegree(links);
    const reciprocity = calculateReciprocity(links);
    const density =
      calculateNetworkDensity(safeParticipants.length, links) ??
      EMPTY_NETWORK_DENSITY;

    return {
      links: Array.isArray(links) ? links : [],
      nodes: Array.isArray(nodes) ? nodes : [],
      indegree: indegree ?? {},
      weightedIndegree: weightedIndegree ?? {},
      reciprocity: reciprocity ?? {},
      density,
    };
  } catch (error) {
    console.error("[CLIENTE ONA] Error calculando métricas locales:", error);
    return EMPTY_ONA_METRICS;
  }
}

function logOnaClientMetrics(
  source: string,
  metrics: OnaClientMetrics,
): void {
  console.log("[CLIENTE ONA]", source, {
    indegree: metrics.indegree,
    weightedIndegree: metrics.weightedIndegree,
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
  silos: NetworkSilo[] | null | undefined,
): string {
  const normalizedId = normalizeParticipantId(participantId);
  const silo = (silos ?? []).find((candidate) =>
    (candidate?.memberIds ?? []).some(
      (memberId) => normalizeParticipantId(memberId) === normalizedId,
    ),
  );

  if (!silo) {
    return "Sin silo aislado (integrado en la red general del equipo)";
  }

  return `Silo ${(silo.id ?? "x").toUpperCase()} (${silo.size ?? silo.memberIds?.length ?? 0} miembros)`;
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
  /** Firma de hidratación: fuerza remount del SociogramGraph al llegar datos reales. */
  const [graphHydrationKey, setGraphHydrationKey] = useState("empty");
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [selectedDemoOrg, setSelectedDemoOrg] = useState<DemoOrgId>(
    "tech-solutions",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  /** Diagnóstico ElevateX (markdown) desde /api/ai-diagnosis. */
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [aiReportOpen, setAiReportOpen] = useState(true);
  const [aiUsedFallback, setAiUsedFallback] = useState(false);
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
  const [isSendingInvites, setIsSendingInvites] = useState(false);
  const [sendingMessage, setSendingMessage] = useState<string | null>(null);
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
  const [onaDiagnostics, setOnaDiagnostics] =
    useState<ElevateXOnaDiagnostics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);

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

    // Solo cabecera: el roster y las respuestas llegan vía elevatex-metrics
    // (service role) para evitar bloqueos RLS en el cliente.
    const groupResult = await supabase
      .from("groups")
      .select(GROUP_NAME_COLUMNS)
      .eq("id", numericGroupId)
      .maybeSingle<{ id: string | number; name: string | null }>();

    console.log("Datos devueltos (groups):", groupResult.data);

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
      setRealGroupName(
        typeof groupResult.data.name === "string" &&
          groupResult.data.name.trim().length > 0
          ? groupResult.data.name.trim()
          : `Equipo ${groupId}`,
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
    if (numericGroupId === null || !groupId.trim()) {
      return;
    }

    setIsLoadingMetrics(true);
    setMetricsError(null);

    try {
      let response: globalThis.Response;
      try {
        response = await fetch(
          `/api/groups/${encodeURIComponent(groupId)}/elevatex-metrics`,
          { cache: "no-store" },
        );
      } catch (networkError) {
        throw new Error(
          networkError instanceof Error
            ? `No se pudo contactar con la API de métricas: ${networkError.message}`
            : "No se pudo contactar con la API de métricas.",
        );
      }

      let payload: {
        success?: boolean;
        error?: string;
        details?: string;
        groupName?: string;
        edt?: EdtMetricsResult;
        ona?: ElevateXOnaDiagnostics;
        rawParticipants?: ElevateXRawParticipant[];
        rawResponses?: ElevateXRawResponse[];
      };

      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        throw new Error(
          `La API de métricas devolvió una respuesta no válida (HTTP ${response.status}).`,
        );
      }

      if (!response.ok || !payload.success || !payload.edt || !payload.ona) {
        const message =
          payload.error ??
          `No se pudieron calcular las métricas del equipo (HTTP ${response.status}).`;
        throw new Error(
          payload.details ? `${message} (${payload.details})` : message,
        );
      }

      const ona = payload.ona;
      const rawParticipants = Array.isArray(payload.rawParticipants)
        ? payload.rawParticipants
        : [];
      const rawResponses = Array.isArray(payload.rawResponses)
        ? payload.rawResponses
        : [];

      console.log("[fetchData] Métricas servidor (EDT):", payload.edt);
      console.log("[fetchData] Métricas servidor (ONA):", ona);
      console.log("[fetchData] rawParticipants:", rawParticipants.length);
      console.log("[fetchData] rawResponses:", rawResponses.length);

      const normalizedParticipants: Participant[] = rawParticipants.map(
        (participant) => {
          // Fallback seguro: columnas nuevas (email / survey_status) pueden
          // no existir aún si la migración de BD está en curso.
          const rawStatus =
            participant != null &&
            typeof participant === "object" &&
            "survey_status" in participant
              ? (participant as { survey_status?: unknown }).survey_status
              : undefined;
          const surveyStatus: Participant["survey_status"] =
            rawStatus === "sent" ||
            rawStatus === "completed" ||
            rawStatus === "pending_send"
              ? rawStatus
              : "pending_send";

          const rawEmail =
            participant != null &&
            typeof participant === "object" &&
            "email" in participant
              ? (participant as { email?: unknown }).email
              : undefined;
          const email =
            typeof rawEmail === "string" ? rawEmail.trim() : "";

          return {
            id: String(participant.id),
            name:
              typeof participant.name === "string" &&
              participant.name.trim().length > 0
                ? participant.name.trim()
                : String(participant.id),
            group_id: String(participant.group_id ?? groupId),
            email,
            survey_status: surveyStatus,
          };
        },
      );

      const normalizedResponses: Response[] = rawResponses.map(
        (responseRow, index) => ({
          id: String(responseRow.id ?? `response-${index}`),
          group_id: String(responseRow.group_id ?? groupId),
          participant_id:
            responseRow.participant_id === null ||
            responseRow.participant_id === undefined
              ? null
              : String(responseRow.participant_id),
          respondent_name: responseRow.respondent_name ?? null,
          answers: responseRow.answers,
          started_at: responseRow.started_at ?? null,
          completed_at: responseRow.completed_at ?? null,
        }),
      );

      const nextHydrationKey = [
        "api",
        groupId,
        `p${normalizedParticipants.length}`,
        `r${normalizedResponses.length}`,
        normalizedParticipants.map((participant) => participant.id).join(","),
        normalizedResponses
          .map(
            (responseRow) =>
              `${responseRow.id}:${responseRow.participant_id ?? "null"}`,
          )
          .join(","),
      ].join("|");

      // Hidratación atómica del roster real → el grafo debe redibujar en el mismo commit.
      setRealParticipants(normalizedParticipants);
      setRealResponses(normalizedResponses);
      setGraphHydrationKey(nextHydrationKey);

      console.log("[fetchData] Hidratación React OK:", {
        hydrationKey: nextHydrationKey,
        realParticipants: normalizedParticipants.length,
        realResponses: normalizedResponses.length,
        sampleParticipant: normalizedParticipants[0] ?? null,
        sampleResponse: normalizedResponses[0]
          ? {
              id: normalizedResponses[0].id,
              participant_id: normalizedResponses[0].participant_id,
              hasInfluencia:
                !!normalizedResponses[0].answers &&
                typeof normalizedResponses[0].answers === "object" &&
                "influencia" in
                  (normalizedResponses[0].answers as Record<string, unknown>),
            }
          : null,
      });

      if (
        typeof payload.groupName === "string" &&
        payload.groupName.trim().length > 0
      ) {
        setRealGroupName(payload.groupName.trim());
      }

      if (
        normalizedParticipants.length > 0 ||
        normalizedResponses.length > 0
      ) {
        try {
          logOnaClientMetrics(
            "fetchData/raw",
            computeOnaClientMetrics(
              normalizedParticipants,
              normalizedResponses,
            ),
          );
        } catch (metricsLogError) {
          console.warn(
            "[fetchData] No se pudieron loguear métricas ONA locales:",
            metricsLogError,
          );
        }
      }

      setEdtMetrics(payload.edt);
      setOnaDiagnostics(ona);

      try {
        setMetrics({
          participants: (ona.talento?.participants ?? []).map((participant) => ({
            id: participant.id,
            name: participant.name,
            inDegree: participant.inDegree,
            outDegree: participant.outDegree,
            centralityIndex: participant.centralityIndex,
          })),
          team: {
            nodeCount: ona.cultura?.networkDensity?.nodeCount ?? 0,
            linkCount: ona.cultura?.networkDensity?.linkCount ?? 0,
            maxPossibleLinks:
              ona.cultura?.networkDensity?.maxPossibleLinks ?? 0,
            density: ona.cultura?.networkDensity?.density ?? 0,
            densityPercent: ona.cultura?.networkDensity?.densityPercent ?? 0,
            reciprocity: ona.cultura?.reciprocityRatio ?? 0,
            reciprocityPercent: ona.cultura?.reciprocityPercent ?? 0,
            mutualLinkCount: ona.cultura?.mutualLinkCount ?? 0,
          },
        });

        setRpcMetrics(
          (ona.talento?.participants ?? []).map((participant) => ({
            participant_name: participant.name,
            indegree_count: participant.inDegree,
            relative_centrality: participant.centralityIndex,
          })),
        );
      } catch (mapError) {
        console.warn(
          "[fetchData] Error mapeando paneles ONA — se continúa con EDT:",
          mapError,
        );
        setMetrics(null);
        setRpcMetrics([]);
      }

      setMetricsError(null);
    } catch (err) {
      console.error("[fetchData] Error cargando métricas del servidor:", err);

      const message =
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las métricas del equipo.";

      // Evitar spinner infinito: vaciar roster y liberar estados de carga.
      setRealParticipants([]);
      setRealResponses([]);
      setGraphHydrationKey(`error|${groupId}|${Date.now()}`);
      setMetrics(null);
      setEdtMetrics(null);
      setOnaDiagnostics(null);
      setRpcMetrics([]);
      setMetricsError(message);
      setError(message);
      setIsLoading(false);
      setIsLoadingMetrics(false);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [groupId, numericGroupId]);

  const participants = demoModeEnabled
    ? demoDataset.participants
    : realParticipants;

  const responses = demoModeEnabled ? demoDataset.responses : realResponses;

  const pendingInviteCount = useMemo(
    () =>
      realParticipants.filter(
        (participant) =>
          (participant.survey_status ?? "pending_send") === "pending_send" &&
          typeof participant.email === "string" &&
          participant.email.includes("@"),
      ).length,
    [realParticipants],
  );

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
      setOnaDiagnostics(null);
      setGraphHydrationKey(`demo-${selectedDemoOrg}-${Date.now()}`);
    } else {
      setGraphHydrationKey(`live-${graphHydrationKey}-${Date.now()}`);
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
          indegree: onaMetrics?.indegree ?? {},
          reciprocity: onaMetrics?.reciprocity ?? {},
          density: onaMetrics?.density ?? EMPTY_NETWORK_DENSITY,
          silos: networkSilos ?? [],
          participants: (participants ?? []).map((participant) => ({
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
    setGraphHydrationKey(
      `import|${groupId}|p${persisted.participants.length}|r${persisted.responses.length}|${Date.now()}`,
    );
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

    if (numericGroupId === null) {
      setError("El ID del equipo en la URL no es válido.");
      return;
    }

    setIsSimulating(true);
    setError(null);

    try {
      const response = await fetch(
        `${window.location.origin}/api/dev/simulate-votes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ groupId: String(numericGroupId) }),
        },
      );

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        participantCount?: number;
        responseCount?: number;
        surveyId?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error ?? "No se pudieron simular los votos de prueba.",
        );
      }

      const result = payload;

      setDemoModeEnabled(false);
      setAiReport(null);
      setAiInsight(null);
      setImportSuccessMessage(
        `${result.responseCount} respuestas simuladas insertadas (${result.participantCount} colaboradores ficticios · survey ${result.surveyId?.slice(0, 8)}…).`,
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

  const handleSendInvites = useCallback(async () => {
    if (isSendingInvites || demoModeEnabled || !groupId.trim()) {
      return;
    }

    setIsSendingInvites(true);
    setSendingMessage(null);
    setError(null);

    try {
      const response = await fetch(
        `/api/groups/${encodeURIComponent(groupId)}/send-invites`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        },
      );

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        sent?: number;
        simulated?: number;
      };

      if (!response.ok || !payload.success) {
        throw new Error(
          payload.error ?? "No se pudieron enviar las invitaciones.",
        );
      }

      const successText =
        typeof payload.message === "string" && payload.message.trim().length > 0
          ? payload.message.trim()
          : `Invitaciones despachadas: ${payload.sent ?? 0} enviadas, ${payload.simulated ?? 0} simuladas.`;

      setImportSuccessMessage(successText);
      setSendingMessage(successText);
      await Promise.all([fetchGroupData(), fetchData()]);
    } catch (err) {
      console.error("[resultados] Error enviando invitaciones:", err);
      setSendingMessage(null);
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron enviar las invitaciones.",
      );
    } finally {
      setIsSendingInvites(false);
    }
  }, [
    isSendingInvites,
    demoModeEnabled,
    groupId,
    fetchGroupData,
    fetchData,
  ]);

  const participantNameLookup = useMemo(
    () => buildParticipantNameLookup(participants),
    [participants],
  );

  const nameById = participantNameLookup.nameById;

  const ranking = useMemo(
    () => {
      try {
        return buildRanking(participants ?? [], responses ?? []) ?? [];
      } catch (error) {
        console.error("[CLIENTE ONA] Error en ranking:", error);
        return [];
      }
    },
    [participants, responses],
  );

  const voteDetails = useMemo(
    () => buildVoteDetails(responses, participantNameLookup),
    [responses, participantNameLookup],
  );

  const onaMetrics = useMemo((): OnaClientMetrics => {
    try {
      const clientGraph = computeOnaClientMetrics(participants, responses);

      if (demoModeEnabled || !onaDiagnostics) {
        return {
          ...clientGraph,
          links: Array.isArray(clientGraph.links) ? clientGraph.links : [],
          nodes: Array.isArray(clientGraph.nodes) ? clientGraph.nodes : [],
          indegree: clientGraph.indegree ?? {},
          weightedIndegree: clientGraph.weightedIndegree ?? {},
          reciprocity: clientGraph.reciprocity ?? {},
          density: clientGraph.density ?? EMPTY_NETWORK_DENSITY,
        };
      }

      const indegree: Record<string, number> = {};
      const serverParticipants = Array.isArray(
        onaDiagnostics.talento?.participants,
      )
        ? onaDiagnostics.talento.participants
        : [];

      for (const participant of serverParticipants) {
        if (participant?.id) {
          indegree[participant.id] = participant.inDegree ?? 0;
        }
      }

      return {
        links: Array.isArray(clientGraph.links) ? clientGraph.links : [],
        nodes: Array.isArray(clientGraph.nodes) ? clientGraph.nodes : [],
        indegree:
          Object.keys(indegree).length > 0
            ? indegree
            : (clientGraph.indegree ?? {}),
        weightedIndegree: clientGraph.weightedIndegree ?? {},
        reciprocity: clientGraph.reciprocity ?? {},
        density:
          onaDiagnostics.cultura?.networkDensity ??
          clientGraph.density ??
          EMPTY_NETWORK_DENSITY,
      };
    } catch (error) {
      console.error("[CLIENTE ONA] Error ensamblando onaMetrics:", error);
      return EMPTY_ONA_METRICS;
    }
  }, [demoModeEnabled, onaDiagnostics, participants, responses]);

  /** KPIs ONA del motor puro (`calculateNetworkMetrics`) sobre respuestas hidratadas. */
  const calculatedNetworkMetrics = useMemo((): CalculatedNetworkMetrics => {
    try {
      const roster = (participants ?? []).map((participant) => ({
        id: participant.id,
        name: participant.name,
      }));
      const responseRows = (responses ?? [])
        .filter(
          (response) =>
            response.participant_id !== null &&
            response.participant_id !== undefined,
        )
        .map((response) => ({
          participant_id: response.participant_id as string,
          answers: response.answers,
        }));

      return calculateNetworkMetrics(roster, responseRows);
    } catch (error) {
      console.error("[resultados] Error en calculateNetworkMetrics:", error);
      return {
        density: 0,
        inDegree: {},
        outDegree: {},
        degreeCentrality: { in: {}, out: {} },
        reciprocityRate: 0,
        betweenness: {},
        betweennessLeaders: [],
        isolatedParticipants: [],
        topInfluencers: [],
      };
    }
  }, [participants, responses]);

  useEffect(() => {
    const metrics = {
      density: calculatedNetworkMetrics.density,
      reciprocityRate: calculatedNetworkMetrics.reciprocityRate,
      inDegree: calculatedNetworkMetrics.inDegree,
      outDegree: calculatedNetworkMetrics.outDegree,
      isolatedParticipants: calculatedNetworkMetrics.isolatedParticipants,
      topInfluencers: calculatedNetworkMetrics.topInfluencers,
      // Contexto del grafo (misma fuente: participants + responses de Supabase).
      graph: {
        nodeCount: onaMetrics?.nodes?.length ?? 0,
        linkCount: onaMetrics?.links?.length ?? 0,
        densityPercent: onaMetrics?.density?.densityPercent ?? 0,
        weightedIndegree: onaMetrics?.weightedIndegree ?? {},
        reciprocity: onaMetrics?.reciprocity ?? {},
      },
      input: {
        participants: participants?.length ?? 0,
        responses: responses?.length ?? 0,
      },
    };

    console.log("📊 Métricas ONA:", {
      ...metrics,
      degreeCentrality: calculatedNetworkMetrics.degreeCentrality,
      betweenness: calculatedNetworkMetrics.betweenness,
      betweennessLeaders: calculatedNetworkMetrics.betweennessLeaders,
    });
  }, [calculatedNetworkMetrics, onaMetrics, participants, responses]);

  const graphLinks = Array.isArray(onaMetrics?.links) ? onaMetrics.links : [];
  const indegreeMap = onaMetrics?.indegree ?? {};
  const weightedIndegreeMap = onaMetrics?.weightedIndegree ?? {};
  const networkDensity =
    onaMetrics?.density ?? EMPTY_NETWORK_DENSITY;

  const individualReciprocityPercentMap = useMemo(() => {
    try {
      const fromServer =
        onaDiagnostics?.cultura?.individualReciprocityPercent ?? null;
      if (fromServer && Object.keys(fromServer).length > 0) {
        return fromServer;
      }

      const participantIds = (participants ?? []).map((participant) =>
        normalizeParticipantId(String(participant.id)),
      );
      return (
        calculateNetworkReciprocity(graphLinks, participantIds)
          .individualReciprocityPercent ?? {}
      );
    } catch (error) {
      console.error(
        "[CLIENTE ONA] Error calculando reciprocidad individual:",
        error,
      );
      return {};
    }
  }, [
    graphLinks,
    onaDiagnostics?.cultura?.individualReciprocityPercent,
    participants,
  ]);

  const onaUtilsNetworkDensity = useMemo(() => {
    try {
      return (
        calculateOnaNetworkDensity({
          participants: (participants ?? []).map((participant) => ({
            id: String(participant.id),
            name: participant.name,
          })),
          votes: (responses ?? [])
            .filter(
              (response) =>
                response.participant_id !== null &&
                response.participant_id !== undefined,
            )
            .map((response) => ({
              voterId: String(response.participant_id),
              nomineeIds: parseResponseAnswers(response.answers),
            })),
        }) ?? {
          nodeCount: 0,
          arcCount: 0,
          maxPossibleArcs: 0,
          density: 0,
          densityPercent: 0,
        }
      );
    } catch (error) {
      console.error("[CLIENTE ONA] Error en onaUtilsNetworkDensity:", error);
      return {
        nodeCount: 0,
        arcCount: 0,
        maxPossibleArcs: 0,
        density: 0,
        densityPercent: 0,
      };
    }
  }, [participants, responses]);

  const culturaMetrics = demoModeEnabled ? null : onaDiagnostics?.cultura ?? null;
  const direccionMetrics = demoModeEnabled
    ? null
    : onaDiagnostics?.direccion ?? null;
  const talentoMetrics = demoModeEnabled ? null : onaDiagnostics?.talento ?? null;

  const averageResponseTime = useMemo(
    () => calculateAverageResponseTime(responses ?? []),
    [responses],
  );

  useEffect(() => {
    if ((participants?.length ?? 0) === 0 && (responses?.length ?? 0) === 0) {
      return;
    }

    console.log("[CLIENTE ONA]", {
      indegree: onaMetrics?.indegree ?? {},
      weightedIndegree: onaMetrics?.weightedIndegree ?? {},
      reciprocity: onaMetrics?.reciprocity ?? {},
      density: onaMetrics?.density ?? EMPTY_NETWORK_DENSITY,
      nodes: onaMetrics?.nodes ?? [],
      links: onaMetrics?.links ?? [],
    });
  }, [onaMetrics, participants, responses]);

  const onaGraphData = useMemo(
    () => ({
      nodes: Array.isArray(onaMetrics?.nodes) ? [...onaMetrics.nodes] : [],
      links: Array.isArray(graphLinks) ? [...graphLinks] : [],
    }),
    [onaMetrics?.nodes, graphLinks, graphHydrationKey],
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    console.log("[resultados] onaGraphData → SociogramGraph:", {
      nodes: onaGraphData.nodes.length,
      links: onaGraphData.links.length,
      hasOnaGraphData:
        onaGraphData.nodes.length > 0 || onaGraphData.links.length > 0,
    });
  }, [onaGraphData]);

  const sociogramInstanceKey = useMemo(() => {
    if (demoModeEnabled) {
      return `demo-${selectedDemoOrg}-p${participants.length}-r${responses.length}-l${graphLinks.length}`;
    }

    return `ona-${graphHydrationKey}-n${onaGraphData.nodes.length}-l${onaGraphData.links.length}`;
  }, [
    demoModeEnabled,
    selectedDemoOrg,
    participants.length,
    responses.length,
    graphLinks.length,
    graphHydrationKey,
    onaGraphData.nodes.length,
    onaGraphData.links.length,
  ]);

  const hasHydratedRoster =
    (realParticipants?.length ?? 0) > 0 || (realResponses?.length ?? 0) > 0;

  const influenceLeaders = useMemo((): InfluenceLeader[] => {
    try {
      if (talentoMetrics) {
        const leaders = Array.isArray(talentoMetrics.informalLeaders)
          ? talentoMetrics.informalLeaders
          : [];
        return leaders.map((leader) => ({
          id: leader.id,
          name: leader.name,
          votes: leader.inDegree ?? 0,
        }));
      }

      return buildInfluenceLeaders(graphLinks, nameById) ?? [];
    } catch (error) {
      console.error("[CLIENTE ONA] Error en influenceLeaders:", error);
      return [];
    }
  }, [talentoMetrics, graphLinks, nameById]);

  const reciprocityLeaders = useMemo((): ReciprocityLeader[] => {
    try {
      return buildReciprocityLeaders(graphLinks, nameById) ?? [];
    } catch (error) {
      console.error("[CLIENTE ONA] Error en reciprocityLeaders:", error);
      return [];
    }
  }, [graphLinks, nameById]);

  const isolatedParticipants = useMemo(() => {
    try {
      if (talentoMetrics) {
        return Array.isArray(talentoMetrics.isolatedParticipants)
          ? talentoMetrics.isolatedParticipants
          : [];
      }

      return calculateIsolation(participants ?? [], indegreeMap) ?? [];
    } catch (error) {
      console.error("[CLIENTE ONA] Error en isolatedParticipants:", error);
      return [];
    }
  }, [talentoMetrics, participants, indegreeMap]);

  const saturatedParticipants = useMemo(
    () =>
      Array.isArray(talentoMetrics?.saturatedParticipants)
        ? talentoMetrics.saturatedParticipants
        : [],
    [talentoMetrics],
  );

  const networkSilos = useMemo((): NetworkSilo[] => {
    try {
      if (direccionMetrics) {
        return Array.isArray(direccionMetrics.silos)
          ? direccionMetrics.silos
          : [];
      }

      return detectNetworkSilos(participants ?? [], graphLinks) ?? [];
    } catch (error) {
      console.error("[CLIENTE ONA] Error en networkSilos:", error);
      return [];
    }
  }, [direccionMetrics, participants, graphLinks]);

  const hasOnaGraphData =
    (onaGraphData.nodes?.length ?? 0) > 0 ||
    (onaGraphData.links?.length ?? 0) > 0;
  const hasRankingData = Array.isArray(ranking) && ranking.length > 0;
  /** No ocultar el mapa si ya hidratamos roster real (evita unmount del canvas). */
  const showMapSkeleton =
    !demoModeEnabled &&
    !hasOnaGraphData &&
    !hasHydratedRoster &&
    (isLoadingMetrics || isLoading);

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

  function buildSelectedParticipantProfile(
    participantId: string,
    participantName: string,
  ): SelectedParticipantProfile {
    const normalizedParticipantId = normalizeParticipantId(participantId);
    const teamOnaMetrics = computeOnaClientMetrics(participants, responses);
    const indegree =
      teamOnaMetrics?.indegree?.[normalizedParticipantId] ??
      indegreeMap?.[normalizedParticipantId] ??
      0;
    const weightedIndegree =
      teamOnaMetrics?.weightedIndegree?.[normalizedParticipantId] ??
      weightedIndegreeMap?.[normalizedParticipantId] ??
      0;
    const reciprocity =
      teamOnaMetrics?.reciprocity?.[normalizedParticipantId] ?? 0;
    const reciprocityPercent =
      individualReciprocityPercentMap?.[normalizedParticipantId] ??
      culturaMetrics?.individualReciprocityPercent?.[normalizedParticipantId] ??
      0;
    const silo = resolveParticipantSiloLabel(
      participantId,
      networkSilos ?? [],
    );

    return {
      id: participantId,
      name: participantName,
      indegree,
      weightedIndegree:
        Math.round((Number(weightedIndegree) || 0) * 1000) / 1000,
      reciprocity,
      reciprocityPercent: Math.round(Number(reciprocityPercent) || 0),
      silo,
    };
  }

  function handleSociogramNodeClick(node: SociogramNode) {
    const participantId = String(node?.id ?? "").trim();
    if (!participantId) {
      return;
    }

    const profile = buildSelectedParticipantProfile(
      participantId,
      typeof node.name === "string" && node.name.trim().length > 0
        ? node.name.trim()
        : participantId,
    );

    setSelectedParticipant(profile);
    setIndividualInsight(null);
    setIsGeneratingIndividual(false);
    setError(null);
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
    const profile = buildSelectedParticipantProfile(entry.id, entry.name);
    const participantResponse = (responses ?? []).find(
      (response) =>
        response.participant_id !== null &&
        normalizeParticipantId(String(response.participant_id)) ===
          normalizedParticipantId,
    );

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
          networkDensityPercent:
            teamOnaMetrics?.density?.densityPercent ??
            networkDensity?.densityPercent ??
            0,
          density: teamOnaMetrics?.density ?? EMPTY_NETWORK_DENSITY,
          participants: (participants ?? []).map((participant) => ({
            id: String(participant.id),
            name: participant.name,
          })),
          responses: (responses ?? []).map((response) => ({
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

  async function handleGenerateAiDiagnosis() {
    if (isLoadingAi) {
      return;
    }

    if (!groupId.trim()) {
      setError("No se pudo resolver el ID del equipo para el diagnóstico IA.");
      return;
    }

    setIsLoadingAi(true);
    setError(null);
    setAiReportOpen(true);

    const metricsPayload = toAiDiagnosisMetricsPayload(
      calculatedNetworkMetrics,
      {
        groupId,
        teamName: groupName ?? `Equipo ${groupId}`,
        rosterSize: participants?.length ?? 0,
      },
    );

    try {
      let response: globalThis.Response;
      try {
        response = await fetch("/api/ai-diagnosis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(metricsPayload),
        });
      } catch (networkError) {
        throw new Error(
          networkError instanceof Error
            ? `No se pudo contactar con el servicio de diagnóstico: ${networkError.message}`
            : "No se pudo contactar con el servicio de diagnóstico.",
        );
      }

      let data: {
        success?: boolean;
        error?: string;
        diagnosis?: string;
        report?: ExecutiveDiagnosisReport;
        usedFallback?: boolean;
        model?: string | null;
      };

      try {
        data = (await response.json()) as typeof data;
      } catch {
        throw new Error(
          "El servicio de diagnóstico devolvió una respuesta no válida.",
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ??
            "No se pudo generar el diagnóstico ejecutivo en este momento.",
        );
      }

      const diagnosisText =
        (typeof data.diagnosis === "string" && data.diagnosis.trim().length > 0
          ? data.diagnosis.trim()
          : null) ??
        (data.report
          ? formatExecutiveReportToMarkdown(data.report)
          : null);

      if (!diagnosisText) {
        throw new Error("El diagnóstico IA llegó vacío.");
      }

      // Liberar loading en cuanto llega la respuesta válida.
      setIsLoadingAi(false);
      setAiReport(diagnosisText);
      setAiUsedFallback(Boolean(data.usedFallback));
      setAiReportOpen(true);

      console.log("[ai-diagnosis] Informe generado:", {
        groupId,
        model: data.model,
        usedFallback: data.usedFallback ?? false,
        chars: diagnosisText.length,
        report: data.report ?? null,
        payloadKeys: Object.keys(metricsPayload),
      });
    } catch (err) {
      console.error("[resultados] Error en handleGenerateAiDiagnosis:", err);
      setIsLoadingAi(false);

      // No tumbar la UI: informe de prueba estructurado + aviso amigable.
      const fallbackMarkdown = buildFallbackTeamDiagnosisMarkdown({
        teamName: metricsPayload.teamName,
        density: {
          nodeCount: metricsPayload.rosterSize,
          linkCount: 0,
          maxPossibleLinks:
            metricsPayload.rosterSize > 1
              ? metricsPayload.rosterSize * (metricsPayload.rosterSize - 1)
              : 0,
          density: metricsPayload.density / 100,
          densityPercent: metricsPayload.density,
        },
        reciprocityRate: metricsPayload.reciprocityRate,
        isolatedParticipants: metricsPayload.isolatedParticipants,
        topInfluencers: metricsPayload.topInfluencers,
        leaders: metricsPayload.topInfluencers.map((influencer) => ({
          id: influencer.id,
          name: influencer.name,
          nominationsReceived: influencer.inDegree,
        })),
        fragmentation: {
          index: Math.min(
            1,
            metricsPayload.isolatedParticipants.length /
              Math.max(metricsPayload.rosterSize, 1),
          ),
        },
      });

      setAiReport(
        `${fallbackMarkdown}\n\n> *No pudimos completar la llamada a IA (${err instanceof Error ? err.message : "error desconocido"}). Se muestra un informe de prueba para no interrumpir tu análisis.*`,
      );
      setAiUsedFallback(true);
      setAiReportOpen(true);
      setError(null);
    } finally {
      setIsLoadingAi(false);
    }
  }

  /** Alias conservado por compatibilidad con handlers legacy. */
  async function handleGenerateReport() {
    await handleGenerateAiDiagnosis();
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

  const maxVotes = ranking?.[0]?.votes ?? 0;

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
                    onClick={handleGenerateAiDiagnosis}
                    disabled={
                      isLoadingAi ||
                      (!demoModeEnabled && participants.length === 0)
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(15,23,42,0.25)] ring-1 ring-slate-900/10 transition-all hover:from-slate-800 hover:to-slate-700 hover:shadow-[0_10px_28px_rgba(15,23,42,0.3)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoadingAi ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Generando diagnóstico ejecutivo…
                      </>
                    ) : (
                      "Generar Diagnóstico por IA"
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
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">
            {error}
          </div>
        ) : null}

        {metricsError && !demoModeEnabled && metricsError !== error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
            {metricsError}
          </div>
        ) : null}

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

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:hidden">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-slate-900">
                Control de Convocatoria y Enlaces Mágicos
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Gestiona el envío de invitaciones personalizadas por correo
                electrónico y monitoriza la participación en tiempo real.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSendInvites()}
              disabled={
                isSendingInvites ||
                demoModeEnabled ||
                pendingInviteCount === 0 ||
                !groupId.trim()
              }
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_18px_rgba(139,92,246,0.28)] transition-all hover:from-violet-500 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSendingInvites ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Despachando correos...
                </>
              ) : (
                "Enviar Invitaciones Pendientes (Resend)"
              )}
            </button>
          </div>

          <div className="space-y-4 p-6">
            {sendingMessage ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {sendingMessage}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th
                      scope="col"
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Colaborador
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Correo Electrónico
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Estado del Test
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {realParticipants.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-5 py-10 text-center text-sm text-slate-500"
                      >
                        Aún no hay colaboradores en este equipo.
                      </td>
                    </tr>
                  ) : (
                    realParticipants.map((participant) => {
                      const status =
                        participant.survey_status ?? "pending_send";

                      return (
                        <tr
                          key={participant.id}
                          className="hover:bg-slate-50/80"
                        >
                          <td className="whitespace-nowrap px-5 py-3.5 text-sm font-medium text-slate-900">
                            {participant.name}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5 text-sm text-slate-600">
                            {participant.email?.trim() || "Sin correo"}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3.5">
                            {status === "completed" ? (
                              <span
                                className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold"
                                style={{
                                  color: "#10B981",
                                  borderColor: "rgba(16, 185, 129, 0.35)",
                                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                                }}
                              >
                                Completado
                              </span>
                            ) : status === "sent" ? (
                              <span className="inline-flex rounded-full border border-amber-400/40 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-800">
                                Enviado / Pendiente de Voto
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                Sin enviar
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
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

        {isLoadingAi || aiReport ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.06)]">
            <button
              type="button"
              onClick={() => setAiReportOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 py-5 text-left transition-colors hover:from-slate-100 hover:to-slate-50"
              aria-expanded={aiReportOpen}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    People Analytics · HR
                  </p>
                  {isLoadingAi ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                      Generando…
                    </span>
                  ) : null}
                  {aiUsedFallback && !isLoadingAi ? (
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      Informe de prueba / sin API Key
                    </span>
                  ) : null}
                </div>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                    Informe Ejecutivo de Clima laboral y Red
                  </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Lectura corporativa de cohesión, reciprocidad, aislamiento e
                  influencia informal a partir del motor ONA.
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium text-slate-500">
                {aiReportOpen ? "Ocultar" : "Mostrar"}
              </span>
            </button>

            {aiReportOpen ? (
              <div className="min-w-0 overflow-hidden p-6">
                {isLoadingAi ? (
                  <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-6">
                    <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
                      La IA está redactando el diagnóstico ejecutivo…
                    </div>
                    <div className="space-y-3" aria-hidden="true">
                      <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-11/12 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
                      <div className="mt-4 h-4 w-1/3 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-10/12 animate-pulse rounded bg-slate-200" />
                      <div className="mt-4 h-4 w-2/5 animate-pulse rounded bg-slate-200" />
                      <div className="h-3 w-full animate-pulse rounded bg-slate-200" />
                    </div>
                  </div>
                ) : aiReport ? (
                  <article className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div
                      className="executive-ai-report w-full min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere] [&_*]:max-w-full [&_*]:break-words"
                      dangerouslySetInnerHTML={{
                        __html: renderExecutiveMarkdown(aiReport),
                      }}
                    />
                  </article>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="rounded-xl border border-violet-500/40 bg-slate-900 shadow-[0_0_24px_rgba(139,92,246,0.15)]">
          <div className="border-b border-violet-500/30 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">
              Mapa de Conexiones del Equipo
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Visualización interactiva de la red de influencia y colaboración
              real del equipo (Nombramientos ONA)
            </p>
          </div>

          <div className="p-6">
            {showMapSkeleton ? (
              <div className="flex h-[480px] flex-col items-center justify-center gap-4 rounded-xl bg-slate-950 text-sm text-slate-400">
                <span className="h-10 w-10 animate-spin rounded-full border-2 border-violet-500/30 border-t-violet-400" />
                <p>
                  {isLoadingMetrics
                    ? "Computando métricas ONA en el servidor…"
                    : "Cargando mapa de conexiones…"}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Cohesión de Equipo
                    </p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                      {calculatedNetworkMetrics.density.toFixed(1)}
                      <span className="ml-1 text-lg font-medium text-slate-500">
                        %
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Densidad de conexiones activas
                    </p>
                  </article>

                  <article className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Confianza Mutua
                    </p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                      {calculatedNetworkMetrics.reciprocityRate.toFixed(1)}
                      <span className="ml-1 text-lg font-medium text-slate-500">
                        %
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Relaciones bidireccionales
                    </p>
                  </article>

                  <article
                    className={`rounded-xl border px-4 py-4 shadow-sm ${
                      calculatedNetworkMetrics.isolatedParticipants.length > 0
                        ? "border-red-300 bg-red-50"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        calculatedNetworkMetrics.isolatedParticipants.length > 0
                          ? "text-red-700"
                          : "text-slate-500"
                      }`}
                    >
                      Riesgo de Aislamiento
                    </p>
                    <p
                      className={`mt-2 text-3xl font-semibold tracking-tight ${
                        calculatedNetworkMetrics.isolatedParticipants.length > 0
                          ? "text-red-700"
                          : "text-slate-900"
                      }`}
                    >
                      {calculatedNetworkMetrics.isolatedParticipants.length}
                    </p>
                    <p
                      className={`mt-1 truncate text-xs ${
                        calculatedNetworkMetrics.isolatedParticipants.length > 0
                          ? "text-red-600"
                          : "text-slate-500"
                      }`}
                    >
                      {calculatedNetworkMetrics.isolatedParticipants.length > 0
                        ? calculatedNetworkMetrics.isolatedParticipants
                            .map((participant) => participant.name)
                            .join(", ")
                        : "Sin colaboradores aislados"}
                    </p>
                  </article>

                  <article className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      Líderes Informales
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {calculatedNetworkMetrics.topInfluencers.length > 0 ? (
                        calculatedNetworkMetrics.topInfluencers.map(
                          (influencer, index) => (
                            <li
                              key={influencer.id}
                              className="flex items-baseline justify-between gap-2 text-sm text-slate-800"
                            >
                              <span className="truncate font-medium">
                                {index + 1}. {influencer.name}
                              </span>
                              <span className="shrink-0 text-xs text-slate-500">
                                {influencer.inDegree} votos
                              </span>
                            </li>
                          ),
                        )
                      ) : (
                        <li className="text-sm text-slate-500">
                          Sin datos suficientes
                        </li>
                      )}
                    </ul>
                  </article>
                </div>

              <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-stretch">
                <aside className="space-y-6">
                  <div className="rounded-xl border border-violet-500/25 bg-slate-950/80 p-5 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-violet-300">
                      Densidad de Red
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Proporción de conexiones reales frente al máximo posible
                      en la red ({networkDensity?.linkCount ?? 0} enlaces ·{" "}
                      {networkDensity?.nodeCount ?? 0} nodos).
                    </p>
                    <div className="mt-4 flex items-end gap-3">
                      <p className="text-3xl font-semibold text-white">
                        {networkDensity?.densityPercent ?? 0}%
                      </p>
                      <p className="pb-1 text-xs text-slate-500">
                        {networkDensity?.linkCount ?? 0}/
                        {networkDensity?.maxPossibleLinks ?? 0}{" "}
                        posibles
                      </p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.6)] transition-all"
                        style={{
                          width: `${networkDensity?.densityPercent ?? 0}%`,
                        }}
                      />
                    </div>
                    {culturaMetrics ? (
                      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-violet-500/20 pt-4">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Cohesión
                          </p>
                          <p className="mt-1 text-lg font-semibold text-white">
                            {culturaMetrics?.cohesionIndex ?? 0}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            Confianza
                          </p>
                          <p className="mt-1 text-lg font-semibold text-white">
                            {culturaMetrics?.trustIndex ?? 0}%
                          </p>
                        </div>
                      </div>
                    ) : null}
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
                      {direccionMetrics ? (
                        <>
                          {" "}
                          Fragmentación:{" "}
                          <span className="font-medium text-cyan-300">
                            {Math.round(
                              (direccionMetrics?.fragmentationIndex ?? 0) * 100,
                            )}
                            %
                          </span>
                        </>
                      ) : null}
                    </p>

                    {(networkSilos?.length ?? 0) === 0 ? (
                      <p className="mt-4 text-sm text-slate-400">
                        No hay silos significativos: la red está integrada o aún
                        no hay suficientes respuestas.
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-3">
                        {(networkSilos ?? []).map((silo) => (
                          <li
                            key={silo?.id ?? `silo-${silo?.size ?? 0}`}
                            className="rounded-lg border border-cyan-500/20 bg-slate-900 px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-cyan-400/80">
                                  {(silo?.id ?? "silo").toUpperCase()}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-100">
                                  {(silo?.memberNames ?? []).join(", ") ||
                                    "Sin miembros"}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-300">
                                {silo?.size ?? silo?.memberNames?.length ?? 0}{" "}
                                miembros
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

                    {(influenceLeaders?.length ?? 0) === 0 ? (
                      <p className="mt-4 text-sm text-slate-400">
                        Aún no hay datos suficientes para identificar líderes.
                      </p>
                    ) : (
                      <ol className="mt-4 space-y-3">
                        {(influenceLeaders ?? []).map((leader, index) => (
                          <li
                            key={`${leader?.id ?? "leader"}-${index}`}
                            className="rounded-lg border border-violet-500/20 bg-slate-900 px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-slate-500">
                                  #{index + 1}
                                </p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                                  {leader?.name ?? "Desconocido"}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 rounded-full border border-violet-400/30 bg-violet-500/15 px-2.5 py-1 text-xs font-semibold text-violet-300">
                                {leader?.votes ?? 0}{" "}
                                {(leader?.votes ?? 0) === 1
                                  ? "conexión"
                                  : "conexiones"}
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

                    {(reciprocityLeaders?.length ?? 0) === 0 ? (
                      <p className="mt-4 text-sm text-slate-400">
                        Aún no hay conexiones mutuas en este equipo
                      </p>
                    ) : (
                      <ol className="mt-4 space-y-3">
                        {(reciprocityLeaders ?? []).map((leader, index) => (
                          <li
                            key={`${leader?.id ?? "reciprocity"}-${index}`}
                            className="rounded-lg border border-violet-500/20 bg-slate-900 px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-slate-500">
                                  #{index + 1}
                                </p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-100">
                                  {leader?.name ?? "Desconocido"}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                                {leader?.mutualConnections ?? 0}{" "}
                                {(leader?.mutualConnections ?? 0) === 1
                                  ? "mutua"
                                  : "mutuas"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div className="rounded-xl border border-amber-500/25 bg-slate-950/80 p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-300">
                      Perfiles Saturados
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Alta carga relacional (in-degree y grado total elevados).
                    </p>

                    {(saturatedParticipants?.length ?? 0) === 0 ? (
                      <p className="mt-4 text-sm text-slate-400">
                        No se detectan perfiles saturados en este equipo.
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-3">
                        {(saturatedParticipants ?? []).map((participant) => (
                          <li
                            key={participant?.id ?? participant?.name}
                            className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-slate-900 px-4 py-3 shadow-sm"
                          >
                            <p className="text-sm font-semibold text-slate-100">
                              {participant?.name ?? "Desconocido"}
                            </p>
                            <span className="inline-flex shrink-0 rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                              {participant?.inDegree ?? 0}↓ ·{" "}
                              {participant?.outDegree ?? 0}↑
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl border border-red-500/25 bg-slate-950/80 p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-red-400">
                      Atención Requerida (Aislamiento)
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Miembros sin conexiones entrantes en la red del equipo.
                    </p>

                    {(isolatedParticipants?.length ?? 0) === 0 ? (
                      <p className="mt-4 text-sm text-slate-400">
                        Todos los miembros están integrados en la red
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-3">
                        {(isolatedParticipants ?? []).map(
                          (participant, index) => (
                          <li
                            key={`${participant?.id ?? "isolated"}-${index}`}
                            className="flex items-center justify-between rounded-lg border border-red-500/20 bg-slate-900 px-4 py-3 shadow-sm"
                          >
                            <p className="text-sm font-semibold text-slate-100">
                              {participant?.name ?? "Desconocido"}
                            </p>
                            <span className="inline-flex shrink-0 rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-300">
                              Aislado
                            </span>
                          </li>
                          ),
                        )}
                      </ul>
                    )}
                  </div>
                </aside>

                <div className="relative isolate flex flex-col rounded-xl border border-violet-500/30 bg-slate-950 shadow-[0_0_20px_rgba(139,92,246,0.12)]">
                  <div className="border-b border-violet-500/20 px-4 py-3 sm:px-5">
                    <p className="text-sm font-medium text-slate-200">
                    Densidad de la Red:{" "}
                    {onaUtilsNetworkDensity?.densityPercent ??
                      networkDensity?.densityPercent ??
                      0}
                    %
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Haz clic en un nodo para abrir la ficha individual.
                      Arrastra nodos y usa la rueda para hacer zoom.
                    </p>
                  </div>
                  <div className="relative w-full h-[500px] min-h-[500px] bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center">
                    {hasOnaGraphData ? (
                      <SociogramGraph
                        key={sociogramInstanceKey}
                        graphData={onaGraphData}
                        directed
                        graphKey={sociogramInstanceKey}
                        onNodeClick={handleSociogramNodeClick}
                        width={700}
                        height={480}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                        {hasHydratedRoster
                          ? "Roster hidratado, pero aún no hay nombramientos ONA para dibujar."
                          : "Aún no hay datos de red para visualizar el sociograma."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </div>
            )}
          </div>
        </section>

        </div>

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

          {isLoadingMetrics && !demoModeEnabled ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-slate-500">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
              Computando ranking ONA en el servidor…
            </div>
          ) : isLoading && !demoModeEnabled ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              Cargando resultados…
            </div>
          ) : !hasRankingData ? (
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
                  {(ranking ?? []).map((entry, index) => {
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

      {selectedParticipant ? (
        <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] transition-opacity"
            aria-label="Cerrar ficha del colaborador"
            onClick={closeIndividualInsightModal}
          />
          <aside
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-violet-500/20 bg-slate-900/90 text-slate-100 shadow-[-24px_0_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:max-w-lg"
            aria-labelledby="individual-profile-title"
          >
            <div className="flex items-start justify-between gap-4 border-b border-violet-500/15 px-6 py-5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300/90">
                  Ficha individual · ElevateX
                </p>
                <h2
                  id="individual-profile-title"
                  className="mt-2 truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl"
                >
                  {selectedParticipant.name}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedParticipant.silo}
                </p>
              </div>
              <button
                type="button"
                onClick={closeIndividualInsightModal}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-500/25 bg-slate-950/50 text-lg leading-none text-slate-300 transition-colors hover:border-violet-400/40 hover:bg-slate-800 hover:text-white"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-violet-500/20 bg-slate-950/55 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Indegree
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-violet-200">
                    {selectedParticipant.indegree}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Votos recibidos</p>
                </div>
                <div className="rounded-xl border border-violet-500/20 bg-slate-950/55 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Weighted Indegree
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-indigo-200">
                    {selectedParticipant.weightedIndegree}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Influencia ponderada
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-slate-950/55 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Reciprocidad
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-300">
                    {selectedParticipant.reciprocityPercent}%
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedParticipant.reciprocity} conexiones mutuas
                  </p>
                </div>
              </div>

              <section className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-slate-950/80 via-slate-900/40 to-violet-950/30 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-300/80">
                  Bondades y retos · IA
                </p>

                {individualInsight ? (
                  <article className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                    {individualInsight}
                  </article>
                ) : (
                  <div className="mt-4 space-y-4" aria-live="polite">
                    <div className="flex items-center gap-3 text-sm font-medium text-violet-200">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-300" />
                      Analizando fortalezas y retos con IA...
                    </div>
                    <div className="space-y-2.5">
                      <div className="h-3 w-[92%] animate-pulse rounded bg-slate-700/70" />
                      <div className="h-3 w-[78%] animate-pulse rounded bg-slate-700/55" />
                      <div className="h-3 w-[85%] animate-pulse rounded bg-slate-700/45" />
                      <div className="mt-4 h-3 w-[70%] animate-pulse rounded bg-violet-500/20" />
                      <div className="h-3 w-[60%] animate-pulse rounded bg-violet-500/15" />
                    </div>
                    {!isGeneratingIndividual ? (
                      <p className="pt-1 text-xs text-slate-500">
                        Espacio reservado para bondades y retos personalizados
                        del perfil.
                      </p>
                    ) : null}
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
