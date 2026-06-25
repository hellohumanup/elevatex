import { buildDemoDatasetForGroup } from "@/lib/demoOrganizations";
import {
  buildGraphLinksFromResponses,
  calculateIndegree,
  calculateReciprocity,
} from "@/lib/mathEngine";

export type IndividualOpportunity = {
  id: string;
  title: string;
  body: string;
};

export type IndividualEmployeeReport = {
  employeeName: string;
  teamName: string;
  organizationName: string;
  technicalIndegree: number;
  technicalIndegreeScore: number;
  technicalIndegreeLevel: string;
  reciprocityPercent: number;
  reciprocityMutualCount: number;
  culturalEnergyScore: number;
  culturalEnergyLabel: string;
  opportunities: IndividualOpportunity[];
};

const DEMO_EMPLOYEE = {
  id: "tech-1",
  name: "Merche",
  orgId: "tech-solutions" as const,
};

const HIGH_TECHNICAL_THRESHOLD = 80;
const LOW_RECIPROCITY_THRESHOLD = 70;
const MODERATE_CULTURAL_MAX = 65;

function resolveTechnicalLevel(score: number): string {
  if (score >= HIGH_TECHNICAL_THRESHOLD) {
    return "Referente de Apoyo Técnico";
  }

  if (score >= 60) {
    return "Conector de Equipo";
  }

  if (score >= 35) {
    return "Colaborador Activo";
  }

  return "Perfil en Desarrollo";
}

function resolveCulturalEnergyLabel(score: number): string {
  if (score >= 66) {
    return "Impulsor de Clima Positivo";
  }

  if (score >= 40) {
    return "Contribuidor de Cohesión";
  }

  return "Presencia en Consolidación";
}

function computeReciprocityPercent(
  incomingVotes: number,
  mutualConnections: number,
): number {
  if (incomingVotes === 0) {
    return 0;
  }

  const reciprocalBaseline = Math.max(incomingVotes - 1, 1);
  return Math.min(
    100,
    Math.round((mutualConnections / reciprocalBaseline) * 100),
  );
}

function computeCulturalEnergyScore(input: {
  reciprocityPercent: number;
  incomingVotes: number;
  teamSize: number;
}): number {
  const nominationWeight = Math.round(
    (input.incomingVotes / Math.max(input.teamSize - 1, 1)) * 55,
  );

  return Math.min(
    MODERATE_CULTURAL_MAX,
    Math.max(
      38,
      Math.round(nominationWeight * 0.45 + input.reciprocityPercent * 0.35),
    ),
  );
}

function buildOpportunities(input: {
  employeeName: string;
  technicalIndegreeScore: number;
  reciprocityPercent: number;
  culturalEnergyScore: number;
}): IndividualOpportunity[] {
  const opportunities: IndividualOpportunity[] = [];

  if (input.technicalIndegreeScore >= HIGH_TECHNICAL_THRESHOLD) {
    opportunities.push({
      id: "burnout-delegation",
      title: "Protege tu energía y delega con intención",
      body: `${input.employeeName}, tu In-Degree técnico es muy alto: el equipo depende de ti para resolver bloqueos. Para evitar el burnout, documenta soluciones recurrentes y delega acompañando en lugar de resolver siempre en primera línea.`,
    });
  }

  if (input.reciprocityPercent < LOW_RECIPROCITY_THRESHOLD) {
    opportunities.push({
      id: "align-expectations",
      title: "Alinea expectativas con tus compañeros",
      body: "Tu reciprocidad es baja en relación con la demanda que recibes. Reserva conversaciones 1:1 para clarificar cómo puedes ayudar y qué apoyo necesitas a cambio, fortaleciendo vínculos bidireccionales.",
    });
  } else {
    opportunities.push({
      id: "leverage-trust",
      title: "Capitaliza la confianza mutua",
      body: `Con un ${input.reciprocityPercent}% de reciprocidad, tus relaciones son sólidas. Usa esa base para co-crear acuerdos de colaboración que distribuyan mejor la carga técnica del equipo.`,
    });
  }

  if (input.culturalEnergyScore <= MODERATE_CULTURAL_MAX) {
    opportunities.push({
      id: "cultural-visibility",
      title: "Amplía tu impacto en el clima laboral",
      body: "Tu Energía Cultural es moderada: aportas estabilidad técnica, pero puedes reforzar el ánimo del grupo celebrando logros del equipo y facilitando espacios de reconocimiento entre pares.",
    });
  }

  return opportunities;
}

export function buildIndividualEmployeeReport(
  employeeId: string = DEMO_EMPLOYEE.id,
  employeeName: string = DEMO_EMPLOYEE.name,
): IndividualEmployeeReport {
  const dataset = buildDemoDatasetForGroup(DEMO_EMPLOYEE.orgId, "individual-report");
  const participants = dataset.participants;
  const responses = dataset.responses.map((response) => ({
    participant_id: response.participant_id,
    answers: response.answers,
  }));

  const links = buildGraphLinksFromResponses(participants, responses);
  const indegree = calculateIndegree(links);
  const reciprocity = calculateReciprocity(links);

  const technicalIndegree = indegree[employeeId] ?? 0;
  const reciprocityMutualCount = reciprocity[employeeId] ?? 0;
  const maxTeamIndegree = Math.max(...Object.values(indegree), 1);
  const teamSize = participants.length;

  const technicalIndegreeScore = Math.round(
    (technicalIndegree / maxTeamIndegree) * 100,
  );
  const reciprocityPercent = computeReciprocityPercent(
    technicalIndegree,
    reciprocityMutualCount,
  );
  const culturalEnergyScore = computeCulturalEnergyScore({
    reciprocityPercent,
    incomingVotes: technicalIndegree,
    teamSize,
  });

  return {
    employeeName,
    teamName: dataset.teamName,
    organizationName: dataset.organizationName,
    technicalIndegree,
    technicalIndegreeScore,
    technicalIndegreeLevel: resolveTechnicalLevel(technicalIndegreeScore),
    reciprocityPercent,
    reciprocityMutualCount,
    culturalEnergyScore,
    culturalEnergyLabel: resolveCulturalEnergyLabel(culturalEnergyScore),
    opportunities: buildOpportunities({
      employeeName,
      technicalIndegreeScore,
      reciprocityPercent,
      culturalEnergyScore,
    }),
  };
}

export function resolveDemoEmployeeFromQuery(name: string | null): {
  id: string;
  name: string;
} {
  const dataset = buildDemoDatasetForGroup(DEMO_EMPLOYEE.orgId, "individual-report");
  const normalizedQuery = name?.trim().toLowerCase();

  if (normalizedQuery) {
    const participant = dataset.participants.find(
      (entry) => entry.name.toLowerCase() === normalizedQuery,
    );

    if (participant) {
      return { id: participant.id, name: participant.name };
    }
  }

  return { id: DEMO_EMPLOYEE.id, name: DEMO_EMPLOYEE.name };
}

export function createDemoEmployeeReportState(): IndividualEmployeeReport {
  return buildIndividualEmployeeReport(DEMO_EMPLOYEE.id, DEMO_EMPLOYEE.name);
}
