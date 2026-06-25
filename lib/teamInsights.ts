export const AI_MAINTENANCE_MESSAGE =
  "(Servicio de IA en mantenimiento. El grafo matemático y el análisis de líderes funcionan correctamente)";

export type TeamInsightPayload = {
  leaders: Array<{ id: string; name: string; votes?: number }>;
  strongConnections: Array<{
    id: string;
    name: string;
    mutualConnections?: number;
  }>;
  isolated: Array<{ id: string; name: string }>;
};

export function buildTeamInsightPayload(input: {
  influenceLeaders: Array<{ id: string; name: string; votes: number }>;
  reciprocityLeaders: Array<{
    id: string;
    name: string;
    mutualConnections: number;
  }>;
  isolatedParticipants: Array<{ id: string; name: string }>;
}): TeamInsightPayload {
  return {
    leaders: input.influenceLeaders.map((leader) => ({
      id: leader.id,
      name: leader.name,
      votes: leader.votes,
    })),
    strongConnections: input.reciprocityLeaders.map((leader) => ({
      id: leader.id,
      name: leader.name,
      mutualConnections: leader.mutualConnections,
    })),
    isolated: input.isolatedParticipants.map((participant) => ({
      id: participant.id,
      name: participant.name,
    })),
  };
}
