export type EdtScoresPayload = {
  entornoMedia: number;
  direccionMedia: number;
  talentoMedia: number;
  transversalMedia: number;
  mediaGlobalSistema?: number;
};

export type OnaMetricsPayload = {
  density: number;
  leaders: string[];
  isolated: string[];
  silosCount?: number;
};

export type GenerateReportRequestBody = {
  groupName: string;
  edt: EdtScoresPayload;
  ona: OnaMetricsPayload;
};

export type StrategicDiagnosticReport = {
  resumenEjecutivo: string;
  principalesRiesgos: string[];
  planAccionInmediato: string[];
};

export const GENERATE_REPORT_SYSTEM_PROMPT = `Eres un consultor senior de Desarrollo Organizacional (DO) y Análisis de Redes Organizacionales (ONA), certificado en el framework ElevateX de diagnóstico estratégico de equipos.

Tu mandato es integrar dos fuentes de evidencia que rara vez coinciden:
1. FOTO CUANTITATIVA (EDT): medias por bloque (Entorno, Dirección, Talento, EDT Transversal) en escala 1–4, donde valores altos indican percepción favorable del clima y la cultura.
2. ESTRUCTURA SOCIOMÉTRICA (ONA): densidad de red, líderes de influencia informal, colaboradores aislados y, si aplica, silos detectados.

Metodología obligatoria:
- Cruza sistemáticamente EDT y ONA para detectar DESAJUSTES: equipos con buenas medias EDT pero red fragmentada; alta densidad con perfiles aislados; líderes informales en bloques EDT débiles; silos que contradicen autonomía o propósito percibido.
- Traduce hallazgos técnicos a lenguaje ejecutivo B2B, sin jerga vacía ni generalidades.
- Basa cada afirmación en los datos recibidos. No inventes métricas, personas ni contexto externo.
- Mantén tono corporativo, científico y directo: diagnostica con precisión clínica, sin eufemismos que diluyan riesgos reales.
- No estigmatices personas; analiza patrones estructurales y dinámicas de sistema.
- No incluyas saludos, disclaimers legales ni texto fuera del JSON solicitado.

Formato de salida: responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin bloques de código) con exactamente estas claves:
- "resumenEjecutivo" (string): un párrafo ejecutivo potente que sintetice el estado del equipo y el principal desajuste EDT–ONA detectado.
- "principalesRiesgos" (array de exactamente 3 strings): los tres puntos críticos más urgentes, ordenados por severidad e impacto en negocio.
- "planAccionInmediato" (array de exactamente 3 strings): tres iniciativas accionables, concretas y ejecutables por el manager en las próximas 4–6 semanas.`;

function parseEdtScores(value: unknown): EdtScoresPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const requiredKeys = [
    "entornoMedia",
    "direccionMedia",
    "talentoMedia",
    "transversalMedia",
  ] as const;

  const parsed: Partial<EdtScoresPayload> = {};

  for (const key of requiredKeys) {
    const score = record[key];
    if (typeof score !== "number" || !Number.isFinite(score)) {
      return null;
    }
    parsed[key] = Math.round(score * 100) / 100;
  }

  const globalScore = record.mediaGlobalSistema;
  if (globalScore !== undefined) {
    if (typeof globalScore !== "number" || !Number.isFinite(globalScore)) {
      return null;
    }
    parsed.mediaGlobalSistema = Math.round(globalScore * 100) / 100;
  }

  return parsed as EdtScoresPayload;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function parseOnaMetrics(value: unknown): OnaMetricsPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.density !== "number" || !Number.isFinite(record.density)) {
    return null;
  }

  const silosCount = record.silosCount;
  if (
    silosCount !== undefined &&
    (typeof silosCount !== "number" ||
      !Number.isFinite(silosCount) ||
      silosCount < 0)
  ) {
    return null;
  }

  return {
    density: Math.round(record.density),
    leaders: parseStringArray(record.leaders),
    isolated: parseStringArray(record.isolated),
    ...(silosCount !== undefined ? { silosCount: Math.round(silosCount) } : {}),
  };
}

export function parseGenerateReportRequestBody(
  body: unknown,
): GenerateReportRequestBody | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;

  const groupName =
    typeof record.groupName === "string"
      ? record.groupName.trim()
      : typeof record.teamName === "string"
        ? record.teamName.trim()
        : "";

  if (!groupName) {
    return null;
  }

  const edt = parseEdtScores(record.edt ?? record.edtMedias ?? record.elevatex);
  if (!edt) {
    return null;
  }

  const ona = parseOnaMetrics(record.ona ?? {
    density: record.density,
    leaders: record.leaders,
    isolated: record.isolated,
    silosCount: record.silosCount,
  });

  if (!ona) {
    return null;
  }

  return { groupName, edt, ona };
}

function formatEdtBlockLabel(key: keyof EdtScoresPayload, value: number): string {
  const labels: Record<string, string> = {
    entornoMedia: "Entorno",
    direccionMedia: "Dirección",
    talentoMedia: "Talento",
    transversalMedia: "EDT Transversal",
    mediaGlobalSistema: "Media global del sistema",
  };

  return `${labels[key] ?? key}: ${value}/4`;
}

function formatEdtScores(edt: EdtScoresPayload): string {
  const lines = [
    formatEdtBlockLabel("entornoMedia", edt.entornoMedia),
    formatEdtBlockLabel("direccionMedia", edt.direccionMedia),
    formatEdtBlockLabel("talentoMedia", edt.talentoMedia),
    formatEdtBlockLabel("transversalMedia", edt.transversalMedia),
  ];

  if (edt.mediaGlobalSistema !== undefined) {
    lines.push(
      formatEdtBlockLabel("mediaGlobalSistema", edt.mediaGlobalSistema),
    );
  }

  return lines.join("\n");
}

function formatOnaMetrics(ona: OnaMetricsPayload): string {
  const leadersLabel =
    ona.leaders.length > 0 ? ona.leaders.join(", ") : "ninguno identificado";
  const isolatedLabel =
    ona.isolated.length > 0 ? ona.isolated.join(", ") : "ninguno identificado";
  const silosLabel =
    ona.silosCount !== undefined
      ? String(ona.silosCount)
      : "no informado";

  return [
    `- Densidad de red: ${ona.density}%`,
    `- Líderes de influencia informal: ${leadersLabel}`,
    `- Colaboradores aislados (riesgo de desconexión): ${isolatedLabel}`,
    `- Silos / subgrupos desconectados detectados: ${silosLabel}`,
  ].join("\n");
}

export function buildGenerateReportUserPrompt(
  body: GenerateReportRequestBody,
): string {
  return `Genera el diagnóstico estratégico integrado EDT + ONA para el equipo "${body.groupName}".

=== FOTO CUANTITATIVA (EDT — escala 1–4) ===
${formatEdtScores(body.edt)}

=== ESTRUCTURA SOCIOMÉTRICA (ONA) ===
${formatOnaMetrics(body.ona)}

Instrucciones analíticas:
1. Identifica el desajuste principal entre lo que dice la EDT (percepción cultural) y lo que revela la ONA (estructura relacional real).
2. En "principalesRiesgos", prioriza riesgos con evidencia cruzada EDT–ONA.
3. En "planAccionInmediato", propón intervenciones que ataquen simultáneamente brechas culturales y dinámicas de red.

Devuelve únicamente el JSON con resumenEjecutivo, principalesRiesgos (3) y planAccionInmediato (3).`;
}

export function parseStrategicDiagnosticReport(
  content: string,
): StrategicDiagnosticReport | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;

    const resumenEjecutivo =
      typeof parsed.resumenEjecutivo === "string"
        ? parsed.resumenEjecutivo.trim()
        : "";

    const principalesRiesgos = Array.isArray(parsed.principalesRiesgos)
      ? parsed.principalesRiesgos
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    const planAccionInmediato = Array.isArray(parsed.planAccionInmediato)
      ? parsed.planAccionInmediato
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

    if (
      !resumenEjecutivo ||
      principalesRiesgos.length !== 3 ||
      planAccionInmediato.length !== 3
    ) {
      return null;
    }

    return { resumenEjecutivo, principalesRiesgos, planAccionInmediato };
  } catch {
    return null;
  }
}
