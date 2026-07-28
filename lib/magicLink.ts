import { resolveAppBaseUrl } from "@/lib/invitationEmail";
import type { SupabaseClient } from "@supabase/supabase-js";

const ACCESS_TOKEN_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type MagicLinkBootstrap = {
  participantId: string;
  participantName: string;
  groupId: string;
  groupName: string | null;
  alreadyCompleted: boolean;
};

export type MagicLinkErrorStatus = 400 | 404 | 410;

export type MagicLinkResolution =
  | { ok: true; data: MagicLinkBootstrap }
  | { ok: false; status: MagicLinkErrorStatus; error: string };

type ParticipantMagicLinkRow = {
  id: string | number;
  name: string | null;
  group_id: string | number | null;
  survey_completed_at: string | null;
  magic_token?: string | null;
  access_token?: string | null;
  survey_status?: string | null;
  invite_expires_at?: string | null;
  groups?: { name: string | null } | { name: string | null }[] | null;
};

export function normalizeAccessToken(raw: string): string {
  return raw.trim();
}

export function isValidAccessTokenFormat(token: string): boolean {
  return ACCESS_TOKEN_UUID_REGEX.test(token);
}

export function buildMagicLinkUrl(accessToken: string): string {
  const normalizedToken = normalizeAccessToken(accessToken);

  if (!isValidAccessTokenFormat(normalizedToken)) {
    throw new Error("accessToken debe ser un UUID válido para construir el magic link.");
  }

  const baseUrl = resolveAppBaseUrl();
  return `${baseUrl}/votar/${encodeURIComponent(normalizedToken)}`;
}

export function isInviteExpired(
  inviteExpiresAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!inviteExpiresAt) {
    return false;
  }

  const expiresAt = new Date(inviteExpiresAt);

  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt.getTime() < now.getTime();
}

function extractGroupName(
  groups: ParticipantMagicLinkRow["groups"],
): string | null {
  const groupRecord = Array.isArray(groups) ? groups[0] : groups;

  if (!groupRecord || typeof groupRecord.name !== "string") {
    return null;
  }

  const trimmed = groupRecord.name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function resolveParticipantByAccessToken(
  supabase: SupabaseClient,
  rawToken: string,
): Promise<MagicLinkResolution> {
  const token = normalizeAccessToken(rawToken);

  if (!token) {
    return {
      ok: false,
      status: 400,
      error: "Token de acceso requerido.",
    };
  }

  if (!isValidAccessTokenFormat(token)) {
    return {
      ok: false,
      status: 400,
      error: "Formato de enlace inválido.",
    };
  }

  const selectColumns =
    "id, name, group_id, survey_completed_at, magic_token, access_token, survey_status, groups(name)";

  // Preferencia: magic_token → access_token (legacy) → id
  let participant: ParticipantMagicLinkRow | null = null;

  const { data: byMagicToken, error: magicError } = await supabase
    .from("participants")
    .select(selectColumns)
    .eq("magic_token", token)
    .maybeSingle();

  if (!magicError && byMagicToken?.id) {
    participant = byMagicToken as ParticipantMagicLinkRow;
  } else {
    const { data: byAccessToken, error: accessError } = await supabase
      .from("participants")
      .select(selectColumns)
      .eq("access_token", token)
      .maybeSingle();

    if (!accessError && byAccessToken?.id) {
      participant = byAccessToken as ParticipantMagicLinkRow;
    } else {
      const { data: byId, error: idError } = await supabase
        .from("participants")
        .select(selectColumns)
        .eq("id", token)
        .maybeSingle();

      if (idError) {
        console.error("[magicLink] Error al resolver token:", idError);
        return {
          ok: false,
          status: 404,
          error: "Enlace inválido o no encontrado.",
        };
      }

      if (byId?.id) {
        participant = byId as ParticipantMagicLinkRow;
      }
    }
  }

  if (!participant?.id) {
    if (magicError) {
      console.error("[magicLink] Error al resolver magic_token:", magicError);
    }

    return {
      ok: false,
      status: 404,
      error: "Enlace inválido o no encontrado.",
    };
  }

  const row = participant;

  if (isInviteExpired(row.invite_expires_at)) {
    return {
      ok: false,
      status: 410,
      error:
        "Este enlace ha expirado. Solicita un nuevo enlace a la persona responsable de tu equipo.",
    };
  }

  const participantName =
    typeof row.name === "string" ? row.name.trim() : "";

  if (!participantName) {
    return {
      ok: false,
      status: 404,
      error: "No se pudo verificar tu identidad en el equipo.",
    };
  }

  const groupId = String(row.group_id ?? "").trim();

  if (!groupId) {
    return {
      ok: false,
      status: 404,
      error: "Equipo no asociado a este enlace.",
    };
  }

  return {
    ok: true,
    data: {
      participantId: String(row.id),
      participantName,
      groupId,
      groupName: extractGroupName(row.groups),
      alreadyCompleted:
        Boolean(row.survey_completed_at) || row.survey_status === "completed",
    },
  };
}
