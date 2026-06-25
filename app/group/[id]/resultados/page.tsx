"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import DemoModePanel from "@/components/DemoModePanel";
import SociogramGraph from "@/components/SociogramGraph";
import TeamVotesImportZone from "@/components/TeamVotesImportZone";
import {
  buildDemoDatasetForGroup,
  type DemoOrgId,
} from "@/lib/demoOrganizations";
import { fetchGroupById } from "@/lib/groups";
import { parseVotesImportFile } from "@/lib/parseVotesImportFile";
import { persistVotesImportToSupabase } from "@/lib/persistVotesImport";
import {
  AI_MAINTENANCE_MESSAGE,
  buildTeamInsightPayload,
} from "@/lib/teamInsights";
import {
  buildGraphLinksFromResponses,
  buildGraphNodes,
  calculateIndegree,
  calculateIsolation,
  calculateNetworkDensity,
  calculateReciprocity,
  detectNetworkSilos,
  parseResponseAnswers,
  type GraphLink,
} from "@/lib/mathEngine";
import {
  buildSurveyNetworkData,
  buildVoteDetailsFromSurveyRows,
  fetchAllSurveyResponses,
  fetchSurveyResponsesForOrganization,
  surveyRowsToLegacyResponses,
  type SurveyResponseRow,
} from "@/lib/surveyResponseGraph";
import { getSupabase } from "@/lib/supabase";

type Participant = {
  id: string;
  name: string;
  group_id: string;
};

type Response = {
  id: string;
  group_id: string;
  participant_id: string;
  answers: unknown;
};

type RankingEntry = {
  id: string;
  name: string;
  votes: number;
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

function buildVoteDetails(
  responses: Response[],
  nameById: Map<string, string>,
): VoteDetail[] {
  return responses
    .map((response) => ({
      voterId: String(response.participant_id),
      voterName: nameById.get(String(response.participant_id)) ?? "Desconocido",
      choices: parseResponseAnswers(response.answers).map(
        (id) => nameById.get(id) ?? "Desconocido",
      ),
    }))
    .sort((a, b) => a.voterName.localeCompare(b.voterName, "es"));
}

function shuffleArray<T>(items: readonly T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function pickRandomPeerIds(
  participantId: string,
  participantIds: readonly string[],
): string[] {
  const peers = participantIds.filter((id) => id !== participantId);

  if (peers.length === 0) {
    return [];
  }

  let voteCount: number;
  if (peers.length === 1) {
    voteCount = 1;
  } else if (peers.length === 2) {
    voteCount = 2;
  } else {
    voteCount = Math.random() < 0.5 ? 2 : 3;
  }

  return shuffleArray(peers).slice(0, voteCount);
}

function toStoredAnswerId(id: string): string | number {
  const numericId = Number(id);

  if (!Number.isNaN(numericId) && /^\d+$/.test(id)) {
    return numericId;
  }

  return id;
}

function buildSimulatedResponses(
  groupId: string,
  participants: Participant[],
): Array<{
  group_id: string;
  participant_id: string;
  answers: Array<string | number>;
}> {
  const participantIds = participants.map((participant) => String(participant.id));

  return participants
    .map((participant) => {
      const participantId = String(participant.id);
      const answers = pickRandomPeerIds(participantId, participantIds).map(
        toStoredAnswerId,
      );

      return {
        group_id: groupId,
        participant_id: participantId,
        answers,
      };
    })
    .filter((response) => response.answers.length > 0);
}

function buildInsightPayloadFromSurveyRows(rows: SurveyResponseRow[]) {
  const { participants, links } = buildSurveyNetworkData(rows);
  const nameById = new Map(
    participants.map((participant) => [participant.id, participant.name]),
  );

  return buildTeamInsightPayload({
    influenceLeaders: buildInfluenceLeaders(links, nameById),
    reciprocityLeaders: buildReciprocityLeaders(links, nameById),
    isolatedParticipants: calculateIsolation(
      participants,
      calculateIndegree(links),
    ),
  });
}

function buildInsightPayloadFromData(
  participants: Participant[],
  responses: Response[],
) {
  const nameById = new Map(
    participants.map((participant) => [String(participant.id), participant.name]),
  );
  const graphLinks = buildGraphLinksFromResponses(participants, responses);

  return buildTeamInsightPayload({
    influenceLeaders: buildInfluenceLeaders(graphLinks, nameById),
    reciprocityLeaders: buildReciprocityLeaders(graphLinks, nameById),
    isolatedParticipants: calculateIsolation(
      participants,
      calculateIndegree(graphLinks),
    ),
  });
}

export default function ResultadosPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.id as string;

  const [realGroupName, setRealGroupName] = useState<string | null>(null);
  const [realParticipants, setRealParticipants] = useState<Participant[]>([]);
  const [realResponses, setRealResponses] = useState<Response[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponseRow[]>(
    [],
  );
  const [demoModeEnabled, setDemoModeEnabled] = useState(false);
  const [selectedDemoOrg, setSelectedDemoOrg] = useState<DemoOrgId>(
    "tech-solutions",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [teamInsight, setTeamInsight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(
    null,
  );

  const fetchData = useCallback(async () => {
    setError(null);

    const [groupResult, participantsResult, responsesResult] =
      await Promise.all([
        fetchGroupById(groupId),
        getSupabase()
          .from("participants")
          .select("id, name, group_id")
          .eq("group_id", groupId)
          .order("name", { ascending: true }),
        getSupabase()
          .from("responses")
          .select("id, group_id, participant_id, answers")
          .eq("group_id", groupId),
      ]);

    if (groupResult.error) {
      setError(groupResult.error.message);
      return;
    }

    if (participantsResult.error) {
      setError(participantsResult.error.message);
      return;
    }

    if (responsesResult.error) {
      setError(responsesResult.error.message);
      return;
    }

    const organizationId = groupResult.data.organization_id;
    const surveyResult = organizationId
      ? await fetchSurveyResponsesForOrganization(organizationId)
      : await fetchAllSurveyResponses();

    if (surveyResult.error) {
      setError(surveyResult.error);
      return;
    }

    setRealGroupName(groupResult.data.name);
    setRealParticipants(participantsResult.data ?? []);
    setRealResponses(responsesResult.data ?? []);
    setSurveyResponses(surveyResult.data);
  }, [groupId]);

  const demoDataset = useMemo(
    () => buildDemoDatasetForGroup(selectedDemoOrg, groupId),
    [selectedDemoOrg, groupId],
  );

  const surveyNetwork = useMemo(
    () => buildSurveyNetworkData(surveyResponses),
    [surveyResponses],
  );

  const surveyParticipants = useMemo<Participant[]>(
    () =>
      surveyNetwork.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        group_id: groupId,
      })),
    [surveyNetwork.participants, groupId],
  );

  const surveyLegacyResponses = useMemo(
    () =>
      surveyRowsToLegacyResponses(surveyResponses).map((response) => ({
        id: `${response.participant_id}-survey`,
        group_id: groupId,
        participant_id: response.participant_id,
        answers: response.answers,
      })),
    [surveyResponses, groupId],
  );

  const participants = demoModeEnabled ? demoDataset.participants : surveyParticipants;
  const responses = demoModeEnabled ? demoDataset.responses : surveyLegacyResponses;
  const groupName = demoModeEnabled
    ? `${demoDataset.teamName} · ${demoDataset.organizationName}`
    : realGroupName;
  const usingSurveyData = !demoModeEnabled;

  function handleSelectDemoOrg(orgId: DemoOrgId) {
    setSelectedDemoOrg(orgId);
    setTeamInsight(null);
  }

  function handleToggleDemoMode(enabled: boolean) {
    setDemoModeEnabled(enabled);
    setTeamInsight(null);
    if (enabled) {
      setImportSuccessMessage(null);
    }
  }

  async function requestTeamInsightResilient(
    payload: ReturnType<typeof buildTeamInsightPayload>,
  ) {
    try {
      const response = await fetch("/api/team-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        insight?: string | null;
        fallback?: boolean;
      };

      setTeamInsight(data.insight ?? AI_MAINTENANCE_MESSAGE);
    } catch {
      setTeamInsight(AI_MAINTENANCE_MESSAGE);
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
    setTeamInsight(null);
    setError(null);
    setImportSuccessMessage(
      "¡Datos guardados con éxito en Supabase para la organización seleccionada!",
    );

    await fetchData();

    void requestTeamInsightResilient(
      buildInsightPayloadFromSurveyRows(surveyResponses),
    );
  }

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await fetchData();
      setIsLoading(false);
    }

    load();
  }, [fetchData]);

  async function handleSimulateVotes() {
    console.log("Generando votos de prueba...");

    if (isSimulating) {
      return;
    }

    setIsSimulating(true);
    setError(null);

    const { data: freshParticipants, error: participantsError } =
      await getSupabase()
        .from("participants")
        .select("id, name, group_id")
        .eq("group_id", groupId)
        .order("name", { ascending: true });

    if (participantsError) {
      setError(participantsError.message);
      setIsSimulating(false);
      return;
    }

    if (!freshParticipants || freshParticipants.length < 2) {
      setError("Se necesitan al menos 2 colaboradores para simular votos.");
      setIsSimulating(false);
      return;
    }

    const { error: deleteError } = await getSupabase()
      .from("responses")
      .delete()
      .eq("group_id", groupId);

    if (deleteError) {
      setError(deleteError.message);
      setIsSimulating(false);
      return;
    }

    const simulatedResponses = buildSimulatedResponses(
      groupId,
      freshParticipants,
    );

    if (simulatedResponses.length === 0) {
      setError("No se pudieron generar votos simulados para este equipo.");
      setIsSimulating(false);
      return;
    }

    const { error: insertError } = await getSupabase()
      .from("responses")
      .insert(simulatedResponses);

    if (insertError) {
      setError(insertError.message);
      setIsSimulating(false);
      return;
    }

    await fetchData();
    router.refresh();
    setIsSimulating(false);
  }

  const nameById = useMemo(
    () =>
      new Map(
        participants.map((participant) => [String(participant.id), participant.name]),
      ),
    [participants],
  );

  const ranking = useMemo(
    () => buildRanking(participants, responses),
    [participants, responses],
  );

  const voteDetails = useMemo(
    () => buildVoteDetails(responses, nameById),
    [responses, nameById],
  );

  const graphLinks = useMemo(
    () =>
      demoModeEnabled
        ? buildGraphLinksFromResponses(participants, responses)
        : surveyNetwork.links,
    [demoModeEnabled, participants, responses, surveyNetwork.links],
  );

  const graphNodes = useMemo(
    () =>
      demoModeEnabled
        ? buildGraphNodes(participants, graphLinks)
        : surveyNetwork.nodes,
    [demoModeEnabled, participants, graphLinks, surveyNetwork.nodes],
  );

  const influenceLeaders = useMemo(
    () => buildInfluenceLeaders(graphLinks, nameById),
    [graphLinks, nameById],
  );

  const reciprocityLeaders = useMemo(
    () => buildReciprocityLeaders(graphLinks, nameById),
    [graphLinks, nameById],
  );

  const indegreeMap = useMemo(
    () => calculateIndegree(graphLinks),
    [graphLinks],
  );

  const isolatedParticipants = useMemo(
    () => calculateIsolation(participants, indegreeMap),
    [participants, indegreeMap],
  );

  const networkDensity = useMemo(
    () => calculateNetworkDensity(participants.length, graphLinks),
    [participants.length, graphLinks],
  );

  const networkSilos = useMemo(
    () => detectNetworkSilos(participants, graphLinks),
    [participants, graphLinks],
  );

  const surveyVoteDetails = useMemo(
    () => buildVoteDetailsFromSurveyRows(surveyResponses),
    [surveyResponses],
  );

  async function handleGenerateInsight() {
    if (isGeneratingInsight) {
      return;
    }

    setIsGeneratingInsight(true);
    setError(null);

    if (demoModeEnabled) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      setTeamInsight(demoDataset.aiInsight);
      setIsGeneratingInsight(false);
      return;
    }

    await requestTeamInsightResilient(
      buildInsightPayloadFromSurveyRows(surveyResponses),
    );
    setIsGeneratingInsight(false);
  }

  function handleDownloadPdf() {
    window.print();
  }

  const maxVotes = ranking[0]?.votes ?? 0;

  return (
    <div className="min-h-full bg-slate-50 print:bg-white">
      <header className="border-b border-slate-200 bg-white print:border-slate-300">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <Link
            href={`/group/${groupId}`}
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
                    onClick={handleDownloadPdf}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100"
                  >
                    Descargar Informe PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateInsight}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-500 active:bg-violet-700"
                  >
                    {isGeneratingInsight ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        Analizando...
                      </>
                    ) : (
                      "Generar Informe IA ✨"
                    )}
                  </button>
                  {!demoModeEnabled && (
                    <button
                      type="button"
                      onClick={handleSimulateVotes}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 active:bg-indigo-700"
                    >
                      {isSimulating ? "Simulando…" : "Simular Votos (Dev)"}
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
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">
            {error}
          </div>
        )}

        {teamInsight && (
          <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-6 shadow-sm print:border-slate-200 print:bg-white print:shadow-none">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-violet-700 print:bg-slate-100 print:text-slate-700">
                Informe IA
              </span>
            </div>
            <p className="text-base leading-relaxed text-slate-700">
              {teamInsight}
            </p>
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

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Mapa de Conexiones del Equipo
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Visualización interactiva de las relaciones entre colaboradores
              {usingSurveyData ? " (datos en vivo desde survey_responses)" : ""}.
              Arrastra los nodos, haz zoom y pasa el cursor para ver detalles.
            </p>
          </div>

          <div className="p-6">
            {isLoading && !demoModeEnabled ? (
              <div className="flex h-[480px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
                Cargando mapa de conexiones…
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="space-y-6">
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Densidad de Red
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Proporción de conexiones reales frente al máximo posible
                      en la red ({networkDensity.linkCount} enlaces ·{" "}
                      {networkDensity.nodeCount} nodos).
                    </p>
                    <div className="mt-4 flex items-end gap-3">
                      <p className="text-3xl font-semibold text-slate-900">
                        {networkDensity.densityPercent}%
                      </p>
                      <p className="pb-1 text-xs text-slate-500">
                        {networkDensity.linkCount}/{networkDensity.maxPossibleLinks}{" "}
                        posibles
                      </p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${networkDensity.densityPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-sky-900/80">
                      Silos Detectados
                    </h3>
                    <p className="mt-1 text-xs text-sky-800/70">
                      Subgrupos conectados internamente pero separados del resto
                      de la organización.
                    </p>

                    {networkSilos.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-600">
                        No hay silos significativos: la red está integrada o aún
                        no hay suficientes respuestas.
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-3">
                        {networkSilos.map((silo) => (
                          <li
                            key={silo.id}
                            className="rounded-lg border border-sky-200/70 bg-white px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-sky-700/80">
                                  {silo.id.toUpperCase()}
                                </p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">
                                  {silo.memberNames.join(", ")}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                                {silo.size} miembros
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Líderes de Influencia
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Top 3 colaboradores con más conexiones recibidas.
                    </p>

                    {influenceLeaders.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-500">
                        Aún no hay datos suficientes para identificar líderes.
                      </p>
                    ) : (
                      <ol className="mt-4 space-y-3">
                        {influenceLeaders.map((leader, index) => (
                          <li
                            key={`${leader.id}-${index}`}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-slate-400">
                                  #{index + 1}
                                </p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                                  {leader.name}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                                {leader.votes}{" "}
                                {leader.votes === 1 ? "conexión" : "conexiones"}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Conexiones Fuertes (Reciprocidad)
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Top 3 colaboradores con más votos mutuos en el equipo.
                    </p>

                    {reciprocityLeaders.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-500">
                        Aún no hay conexiones mutuas en este equipo
                      </p>
                    ) : (
                      <ol className="mt-4 space-y-3">
                        {reciprocityLeaders.map((leader, index) => (
                          <li
                            key={`${leader.id}-${index}`}
                            className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-slate-400">
                                  #{index + 1}
                                </p>
                                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                                  {leader.name}
                                </p>
                              </div>
                              <span className="inline-flex shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
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

                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-5">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-800/80">
                      Atención Requerida (Aislamiento)
                    </h3>
                    <p className="mt-1 text-xs text-amber-700/70">
                      Miembros sin conexiones entrantes en la red del equipo.
                    </p>

                    {isolatedParticipants.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-600">
                        Todos los miembros están integrados en la red
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-3">
                        {isolatedParticipants.map((participant, index) => (
                          <li
                            key={`${participant.id}-${index}`}
                            className="flex items-center justify-between rounded-lg border border-amber-200/70 bg-white px-4 py-3 shadow-sm"
                          >
                            <p className="text-sm font-semibold text-slate-900">
                              {participant.name}
                            </p>
                            <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                              Aislado
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </aside>

                <SociogramGraph nodes={graphNodes} links={graphLinks} />
              </div>
            )}
          </div>
        </section>

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
                  {ranking.map((entry, index) => (
                    <tr key={`${entry.id}-${index}`} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-500">
                        #{index + 1}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900">
                        {entry.name}
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
                  ))}
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
          ) : usingSurveyData ? (
            surveyVoteDetails.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                Aún no hay respuestas en survey_responses. Comparte el enlace del
                cuestionario nativo con los colaboradores.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {surveyVoteDetails.map((detail, index) => (
                  <li key={`${detail.voterId}-${index}`} className="px-6 py-5">
                    <p className="text-sm font-semibold text-slate-900">
                      {detail.voterName}
                    </p>
                    <div className="mt-2 space-y-1 text-sm text-slate-600">
                      <p>
                        <span className="font-medium text-indigo-700">Técnico:</span>{" "}
                        {detail.technicalVotes.length > 0
                          ? detail.technicalVotes.join(", ")
                          : "Sin selección"}
                      </p>
                      <p>
                        <span className="font-medium text-emerald-700">Confianza:</span>{" "}
                        {detail.trustVotes.length > 0
                          ? detail.trustVotes.join(", ")
                          : "Sin selección"}
                      </p>
                      <p>
                        <span className="font-medium text-violet-700">Cultura:</span>{" "}
                        {detail.cultureVotes.length > 0
                          ? detail.cultureVotes.join(", ")
                          : "Sin selección"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )
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
    </div>
  );
}
