import * as XLSX from "xlsx";

export type ImportedParticipant = {
  id: string;
  name: string;
  group_id: string;
};

export type ImportedResponse = {
  id: string;
  group_id: string;
  participant_id: string;
  answers: string[];
};

export type ParsedVotesImport = {
  participants: ImportedParticipant[];
  responses: ImportedResponse[];
};

const COLUMN_ALIASES = {
  empleado: ["empleado"],
  voto1: ["voto1", "voto 1"],
  voto2: ["voto2", "voto 2"],
  voto3: ["voto3", "voto 3"],
} as const;

type VoteRow = {
  empleado: string;
  voto1: string;
  voto2: string;
  voto3: string;
};

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
        return;
      }

      reject(new Error("No se pudo leer el archivo."));
    };

    reader.onerror = () => {
      reject(new Error("No se pudo leer el archivo."));
    };

    reader.readAsArrayBuffer(file);
  });
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function getCellValue(
  row: Record<string, unknown>,
  aliases: readonly string[],
): string {
  const aliasSet = new Set(aliases.map(normalizeKey));

  for (const [key, value] of Object.entries(row)) {
    if (aliasSet.has(normalizeKey(key))) {
      return String(value ?? "").trim();
    }
  }

  return "";
}

function parseVoteRow(row: Record<string, unknown>): VoteRow {
  return {
    empleado: getCellValue(row, COLUMN_ALIASES.empleado),
    voto1: getCellValue(row, COLUMN_ALIASES.voto1),
    voto2: getCellValue(row, COLUMN_ALIASES.voto2),
    voto3: getCellValue(row, COLUMN_ALIASES.voto3),
  };
}

function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function registerParticipantId(
  name: string,
  nameToId: Map<string, string>,
  usedIds: Set<string>,
): string {
  const normalizedName = normalizeKey(name);

  if (nameToId.has(normalizedName)) {
    return nameToId.get(normalizedName)!;
  }

  const base = slugifyName(name) || "colaborador";
  let candidateId = `import-${base}`;
  let suffix = 2;

  while (usedIds.has(candidateId)) {
    candidateId = `import-${base}-${suffix}`;
    suffix += 1;
  }

  nameToId.set(normalizedName, candidateId);
  usedIds.add(candidateId);

  return candidateId;
}

function resolveParticipantId(
  name: string,
  nameToId: Map<string, string>,
  usedIds: Set<string>,
): string | null {
  const trimmedName = name.trim();

  if (!trimmedName) {
    return null;
  }

  const normalizedName = normalizeKey(trimmedName);

  if (nameToId.has(normalizedName)) {
    return nameToId.get(normalizedName)!;
  }

  return registerParticipantId(trimmedName, nameToId, usedIds);
}

function hasRequiredColumns(rows: Record<string, unknown>[]): boolean {
  if (rows.length === 0) {
    return false;
  }

  const headers = Object.keys(rows[0]).map(normalizeKey);

  return (
    COLUMN_ALIASES.empleado.some((alias) => headers.includes(alias)) &&
    COLUMN_ALIASES.voto1.some((alias) => headers.includes(alias)) &&
    COLUMN_ALIASES.voto2.some((alias) => headers.includes(alias)) &&
    COLUMN_ALIASES.voto3.some((alias) => headers.includes(alias))
  );
}

export async function parseVotesImportFile(
  file: File,
  groupId: string,
): Promise<ParsedVotesImport> {
  const buffer = await readFileAsArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("El archivo no contiene hojas de datos.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  if (rawRows.length === 0) {
    throw new Error("El archivo está vacío.");
  }

  if (!hasRequiredColumns(rawRows)) {
    throw new Error(
      "Faltan columnas obligatorias. Usa: Empleado, Voto1, Voto2, Voto3.",
    );
  }

  const voteRows = rawRows
    .map(parseVoteRow)
    .filter((row) => row.empleado.length > 0);

  if (voteRows.length === 0) {
    throw new Error("No se encontraron filas con el nombre del empleado.");
  }

  const nameToId = new Map<string, string>();
  const usedIds = new Set<string>();
  const uniqueNames = new Set<string>();

  for (const row of voteRows) {
    uniqueNames.add(row.empleado);
    for (const voteName of [row.voto1, row.voto2, row.voto3]) {
      if (voteName) {
        uniqueNames.add(voteName);
      }
    }
  }

  for (const name of uniqueNames) {
    registerParticipantId(name, nameToId, usedIds);
  }

  const participants: ImportedParticipant[] = Array.from(uniqueNames)
    .map((name) => ({
      id: nameToId.get(normalizeKey(name))!,
      name: name.trim(),
      group_id: groupId,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const responses: ImportedResponse[] = voteRows.map((row, index) => {
    const participantId = nameToId.get(normalizeKey(row.empleado))!;
    const answers = [row.voto1, row.voto2, row.voto3]
      .map((voteName) => resolveParticipantId(voteName, nameToId, usedIds))
      .filter((voteId): voteId is string => voteId !== null);

    return {
      id: `import-response-${index + 1}`,
      group_id: groupId,
      participant_id: participantId,
      answers,
    };
  });

  return { participants, responses };
}
