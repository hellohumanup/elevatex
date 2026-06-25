import {
  extractSurveyVoteGroups,
  type SurveyResponseRow,
} from "@/lib/surveyResponseGraph";

export type ProfileRecord = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  display_name?: string | null;
};

export type ParticipantRecord = {
  id: string;
  name: string;
};

export type RawSurveyResponseRow = SurveyResponseRow & {
  created_at?: string | null;
  profiles?: ProfileRecord | ProfileRecord[] | null;
  responder?: ProfileRecord | ProfileRecord[] | null;
};

export type EnrichedSurveyResponseRow = SurveyResponseRow & {
  responder_label: string;
  responder_email: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

function pickProfile(
  value: ProfileRecord | ProfileRecord[] | null | undefined,
): ProfileRecord | null {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function profileLabel(profile: ProfileRecord): string | null {
  const email = profile.email?.trim();
  if (email) {
    return email;
  }

  const fullName = profile.full_name?.trim();
  if (fullName) {
    return fullName;
  }

  const displayName = profile.display_name?.trim();
  if (displayName) {
    return displayName;
  }

  return null;
}

/** Mapa id/email/nombre → etiqueta visible (prioriza email). */
export function buildIdentityLabelMap(
  profiles: readonly ProfileRecord[],
  participants: readonly ParticipantRecord[],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const profile of profiles) {
    const label = profileLabel(profile) ?? profile.id;
    map.set(profile.id, label);

    if (profile.email?.trim()) {
      map.set(profile.email.trim().toLowerCase(), label);
    }
  }

  for (const participant of participants) {
    map.set(String(participant.id), participant.name.trim());
    map.set(participant.name.trim(), participant.name.trim());
  }

  return map;
}

export function resolveIdentityLabel(
  rawValue: string,
  identityMap: Map<string, string>,
): string {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return trimmed;
  }

  const direct = identityMap.get(trimmed);
  if (direct) {
    return direct;
  }

  const byLower = identityMap.get(trimmed.toLowerCase());
  if (byLower) {
    return byLower;
  }

  return trimmed;
}

export function resolveIdentityEmail(
  rawValue: string,
  identityMap: Map<string, string>,
): string | null {
  const label = resolveIdentityLabel(rawValue, identityMap);
  return label.includes("@") ? label : null;
}

function normalizeVoteIds(
  votes: readonly string[],
  identityMap: Map<string, string>,
): string[] {
  return votes.map((vote) => resolveIdentityLabel(vote, identityMap));
}

/** Traduce UUIDs a emails/etiquetas y unifica el formato para el grafo. */
export function enrichSurveyResponseRows(
  rows: readonly RawSurveyResponseRow[],
  identityMap: Map<string, string>,
): EnrichedSurveyResponseRow[] {
  return rows.map((row) => {
    const embeddedProfile =
      pickProfile(row.profiles) ?? pickProfile(row.responder);
    const embeddedLabel = embeddedProfile ? profileLabel(embeddedProfile) : null;

    const responderLabel =
      embeddedLabel ??
      resolveIdentityLabel(String(row.responder_id), identityMap);
    const responderEmail =
      embeddedProfile?.email?.trim() ??
      resolveIdentityEmail(String(row.responder_id), identityMap);

    const { p1, p2, p3 } = extractSurveyVoteGroups(row);
    const normalizedP1 = normalizeVoteIds(p1, identityMap);
    const normalizedP2 = normalizeVoteIds(p2, identityMap);
    const normalizedP3 = normalizeVoteIds(p3, identityMap);

    return {
      ...row,
      responder_id: String(row.responder_id).trim(),
      responder_label: responderLabel,
      responder_email: responderEmail,
      p1_votes: normalizedP1,
      p2_votes: normalizedP2,
      p3_votes: normalizedP3,
      p1_voto1: normalizedP1[0] ?? null,
      p1_voto2: normalizedP1[1] ?? null,
      p1_voto3: normalizedP1[2] ?? null,
      p2_voto1: normalizedP2[0] ?? null,
      p2_voto2: normalizedP2[1] ?? null,
      p2_voto3: normalizedP2[2] ?? null,
      p3_voto1: normalizedP3[0] ?? null,
      p3_voto2: normalizedP3[1] ?? null,
      p3_voto3: normalizedP3[2] ?? null,
    };
  });
}

/** Filas listas para mathEngine: etiquetas visibles (email/nombre). */
export function toGraphSurveyRows(
  enrichedRows: readonly EnrichedSurveyResponseRow[],
): SurveyResponseRow[] {
  return enrichedRows.map((row) => ({
    id: row.id,
    organization_id: row.organization_id,
    responder_id: row.responder_label,
    p1_voto1: row.p1_voto1,
    p1_voto2: row.p1_voto2,
    p1_voto3: row.p1_voto3,
    p2_voto1: row.p2_voto1,
    p2_voto2: row.p2_voto2,
    p2_voto3: row.p2_voto3,
    p3_voto1: row.p3_voto1,
    p3_voto2: row.p3_voto2,
    p3_voto3: row.p3_voto3,
    p1_votes: row.p1_votes,
    p2_votes: row.p2_votes,
    p3_votes: row.p3_votes,
  }));
}
