export type DemoOrgId = "tech-solutions" | "global-retail";

export type DemoParticipant = {
  id: string;
  name: string;
  group_id: string;
};

export type DemoResponse = {
  id: string;
  group_id: string;
  participant_id: string;
  answers: string[];
};

export type DemoOrganizationData = {
  id: DemoOrgId;
  organizationName: string;
  teamName: string;
  participants: Omit<DemoParticipant, "group_id">[];
  responses: Omit<DemoResponse, "group_id">[];
  aiInsight: string;
};

const TECH_SOLUTIONS: DemoOrganizationData = {
  id: "tech-solutions",
  organizationName: "Tech Solutions",
  teamName: "Equipo Producto Digital",
  participants: [
    { id: "tech-1", name: "Merche" },
    { id: "tech-2", name: "Lucía" },
    { id: "tech-3", name: "Pedro" },
    { id: "tech-4", name: "Ana" },
    { id: "tech-5", name: "Diego" },
    { id: "tech-6", name: "Elena" },
  ],
  responses: [
    { id: "tr-1", participant_id: "tech-3", answers: ["tech-1", "tech-2", "tech-4"] },
    { id: "tr-2", participant_id: "tech-4", answers: ["tech-1", "tech-2", "tech-6"] },
    { id: "tr-3", participant_id: "tech-5", answers: ["tech-2", "tech-1", "tech-3"] },
    { id: "tr-4", participant_id: "tech-6", answers: ["tech-1", "tech-2", "tech-4"] },
    { id: "tr-5", participant_id: "tech-1", answers: ["tech-2", "tech-4", "tech-6"] },
    { id: "tr-6", participant_id: "tech-2", answers: ["tech-1", "tech-4", "tech-3"] },
  ],
  aiInsight:
    "El equipo de Tech Solutions muestra una red altamente cohesionada centrada en Merche y Lucía, "
    + "quienes concentran la mayoría de las conexiones entrantes y actúan como referentes naturales "
    + "del clima colaborativo. La reciprocidad entre ambas refuerza puentes de confianza clave en "
    + "Producto Digital. No se detectan perfiles aislados; se recomienda mantener dinámicas que "
    + "distribuyan visibilidad hacia perfiles intermedios como Pedro y Ana.",
};

const GLOBAL_RETAIL: DemoOrganizationData = {
  id: "global-retail",
  organizationName: "Global Retail",
  teamName: "Equipo Operaciones Comerciales",
  participants: [
    { id: "ret-1", name: "Carlos" },
    { id: "ret-2", name: "Sofía" },
    { id: "ret-3", name: "Juan" },
    { id: "ret-4", name: "Marta" },
    { id: "ret-5", name: "Luis" },
    { id: "ret-6", name: "Irene" },
  ],
  responses: [
    { id: "rr-1", participant_id: "ret-2", answers: ["ret-1", "ret-3", "ret-4"] },
    { id: "rr-2", participant_id: "ret-3", answers: ["ret-1", "ret-2", "ret-6"] },
    { id: "rr-3", participant_id: "ret-4", answers: ["ret-1", "ret-3", "ret-2"] },
    { id: "rr-4", participant_id: "ret-6", answers: ["ret-1", "ret-2", "ret-3"] },
    { id: "rr-5", participant_id: "ret-1", answers: ["ret-2", "ret-3", "ret-4"] },
    { id: "rr-6", participant_id: "ret-5", answers: ["ret-1", "ret-4", "ret-6"] },
  ],
  aiInsight:
    "En Global Retail, Carlos emerge como núcleo de influencia del equipo comercial, con Sofía y Juan "
    + "como co-líderes operativos que sostienen la coordinación transversal. Existe reciprocidad "
    + "sólida entre el trío directivo informal, aunque Luis presenta conectividad entrante limitada, "
    + "lo que sugiere un riesgo de desalineación. Se aconseja un plan de integración específico "
    + "para reforzar su participación en proyectos estratégicos.",
};

export function getDemoOrganization(orgId: DemoOrgId): DemoOrganizationData {
  return orgId === "global-retail" ? GLOBAL_RETAIL : TECH_SOLUTIONS;
}

export function buildDemoDatasetForGroup(
  orgId: DemoOrgId,
  groupId: string,
): {
  organizationName: string;
  teamName: string;
  participants: DemoParticipant[];
  responses: DemoResponse[];
  aiInsight: string;
} {
  const org = getDemoOrganization(orgId);

  return {
    organizationName: org.organizationName,
    teamName: org.teamName,
    aiInsight: org.aiInsight,
    participants: org.participants.map((participant) => ({
      ...participant,
      group_id: groupId,
    })),
    responses: org.responses.map((response) => ({
      ...response,
      group_id: groupId,
    })),
  };
}
