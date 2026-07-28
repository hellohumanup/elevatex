/**
 * Parseo de listas de colaboradores pegadas por el mánager.
 * Formatos admitidos (una persona por línea):
 *   - Valeria Iglesias, valeria@empresa.com
 *   - Valeria Iglesias; valeria@empresa.com
 *   - Valeria Iglesias <valeria@empresa.com>
 *   - Valeria Iglesias (solo nombre)
 */

export type ParsedParticipantImportRow = {
  name: string;
  email: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function isValidParticipantEmail(value: string | null | undefined): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }

  return EMAIL_REGEX.test(value.trim());
}

function normalizeEmailCandidate(value: string): string | null {
  const trimmed = value.trim().replace(/^<|>$/g, "").trim();

  if (!trimmed || !isValidParticipantEmail(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

/**
 * Extrae nombre + email de una línea de importación.
 */
export function parseParticipantImportLine(
  line: string,
): ParsedParticipantImportRow | null {
  const raw = line.trim();

  if (!raw) {
    return null;
  }

  // Formato: Nombre <email@dominio.com>
  const angleMatch = raw.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angleMatch) {
    const name = angleMatch[1].trim();
    const email = normalizeEmailCandidate(angleMatch[2]);

    if (name.length === 0) {
      return null;
    }

    return { name, email };
  }

  // Separadores comunes: coma, punto y coma, tab
  const separatorMatch = raw.match(/^(.+?)[,;\t]\s*(.+)$/);
  if (separatorMatch) {
    const left = separatorMatch[1].trim();
    const right = separatorMatch[2].trim();
    const rightEmail = normalizeEmailCandidate(right);
    const leftEmail = normalizeEmailCandidate(left);

    // "Nombre, email"
    if (rightEmail && !leftEmail) {
      return { name: left, email: rightEmail };
    }

    // "email, Nombre" (por si pegan al revés)
    if (leftEmail && !rightEmail && right.length > 0) {
      return { name: right, email: leftEmail };
    }

    // Ambos o ninguno parecen email → nombre completo + email si right es válido
    if (rightEmail) {
      return { name: left, email: rightEmail };
    }

    return { name: left, email: null };
  }

  // Solo email en la línea
  const onlyEmail = normalizeEmailCandidate(raw);
  if (onlyEmail) {
    const localPart = onlyEmail.split("@")[0] ?? onlyEmail;
    return {
      name: localPart.replace(/[._]+/g, " ").trim() || onlyEmail,
      email: onlyEmail,
    };
  }

  return { name: raw, email: null };
}

export function parseParticipantImportText(
  text: string,
): ParsedParticipantImportRow[] {
  const seenEmails = new Set<string>();
  const seenNames = new Set<string>();
  const rows: ParsedParticipantImportRow[] = [];

  for (const line of text.split(/\r?\n+/)) {
    const parsed = parseParticipantImportLine(line);

    if (!parsed || parsed.name.length === 0) {
      continue;
    }

    const nameKey = parsed.name.trim().toLowerCase();
    const emailKey = parsed.email?.toLowerCase() ?? null;

    // Evitar duplicados exactos en el mismo pegado
    if (emailKey) {
      if (seenEmails.has(emailKey)) {
        continue;
      }
      seenEmails.add(emailKey);
    } else if (seenNames.has(nameKey)) {
      continue;
    }

    seenNames.add(nameKey);
    rows.push({
      name: parsed.name.trim(),
      email: emailKey,
    });
  }

  return rows;
}

/** Payload listo para INSERT en public.participants. */
export function toParticipantInsertRows(
  rows: readonly ParsedParticipantImportRow[],
  groupId: string | number,
): Array<{
  name: string;
  email: string | null;
  group_id: string | number;
  survey_status: "pending_send";
}> {
  return rows.map((row) => ({
    name: row.name,
    email: row.email,
    group_id: groupId,
    // magic_token lo genera Postgres (DEFAULT gen_random_uuid())
    survey_status: "pending_send" as const,
  }));
}
