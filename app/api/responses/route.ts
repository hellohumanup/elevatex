import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type SubmitResponseBody = {
  surveyId?: string;
  groupId?: string | number;
  participantId?: string;
  respondentName?: string;
  answers?: Record<string, unknown>;
  started_at?: string | null;
  completed_at?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRespondentNameColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("respondent_name") &&
    (normalized.includes("column") || normalized.includes("schema cache"))
  );
}

function isResponseTimestampColumnError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("started_at") ||
    normalized.includes("completed_at") ||
    normalized.includes("schema cache")
  );
}

function isResponsesSchemaCacheError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("schema cache") ||
    normalized.includes("could not find") ||
    normalized.includes("responses")
  );
}

export async function POST(request: Request) {
  let body: SubmitResponseBody;

  try {
    body = (await request.json()) as SubmitResponseBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Petición no válida." },
      { status: 400 },
    );
  }

  const surveyId = typeof body.surveyId === "string" ? body.surveyId.trim() : "";
  const groupId =
    typeof body.groupId === "string" || typeof body.groupId === "number"
      ? String(body.groupId).trim()
      : "";
  const participantId =
    typeof body.participantId === "string" ? body.participantId.trim() : "";
  const respondentName =
    typeof body.respondentName === "string" ? body.respondentName.trim() : "";
  const answers = isRecord(body.answers) ? body.answers : null;

  if (!surveyId || !groupId || !participantId || !answers) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Faltan surveyId, groupId, participantId o answers válidos para guardar la respuesta.",
      },
      { status: 400 },
    );
  }

  const supabaseAdmin = createSupabaseServiceRoleClient();

  if (!supabaseAdmin) {
    return NextResponse.json(
      {
        success: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY no configurada. Añádela en .env.local y reinicia el servidor.",
      },
      { status: 503 },
    );
  }

  console.log("📥 [Respuesta Recibida]:", {
    groupId,
    participantId,
    answers,
  });

  const buildResponseRow = (options: {
    includeRespondentColumn: boolean;
    includeTimestamps: boolean;
  }): Record<string, unknown> => {
    const row: Record<string, unknown> = {
      survey_id: surveyId,
      group_id: groupId,
      participant_id: participantId,
      answers,
    };

    if (options.includeRespondentColumn && respondentName) {
      row.respondent_name = respondentName;
    }

    if (options.includeTimestamps) {
      if (body.started_at) {
        row.started_at = body.started_at;
      }
      if (body.completed_at) {
        row.completed_at = body.completed_at;
      }
    }

    return row;
  };

  const tryInsert = async (row: Record<string, unknown>) => {
    const { data, error } = await supabaseAdmin
      .from("responses")
      .insert(row)
      .select("id")
      .maybeSingle();

    return { data, error };
  };

  const insertVariants = [
    { includeRespondentColumn: true, includeTimestamps: true },
    { includeRespondentColumn: false, includeTimestamps: true },
    { includeRespondentColumn: true, includeTimestamps: false },
    { includeRespondentColumn: false, includeTimestamps: false },
  ] as const;

  try {
    for (let index = 0; index < insertVariants.length; index += 1) {
      const variant = insertVariants[index];
      const row = buildResponseRow(variant);
      const { data, error } = await tryInsert(row);

      if (!error) {
        return NextResponse.json({
          success: true,
          id: data?.id ?? null,
        });
      }

      const isLastVariant = index === insertVariants.length - 1;
      const canRetry =
        !isLastVariant &&
        (isRespondentNameColumnError(error.message) ||
          isResponseTimestampColumnError(error.message) ||
          isResponsesSchemaCacheError(error.message));

      if (!canRetry) {
        throw new Error(error.message);
      }

      console.warn(
        "[api/responses] Fallback de inserción en responses:",
        error.message,
      );
    }

    throw new Error("No se pudo guardar la respuesta.");
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo guardar la respuesta.",
      },
      { status: 400 },
    );
  }
}
