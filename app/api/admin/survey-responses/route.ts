import { NextResponse } from "next/server";
import {
  buildIdentityLabelMap,
  enrichSurveyResponseRows,
  toGraphSurveyRows,
  type ParticipantRecord,
  type ProfileRecord,
  type RawSurveyResponseRow,
} from "@/lib/enrichSurveyResponses";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SURVEY_WITH_PROFILE_SELECT = `
  id,
  organization_id,
  responder_id,
  p1_votes,
  p2_votes,
  p3_votes,
  p1_voto1,
  p1_voto2,
  p1_voto3,
  p2_voto1,
  p2_voto2,
  p2_voto3,
  p3_voto1,
  p3_voto2,
  p3_voto3,
  created_at,
  profiles:responder_id (
    id,
    email,
    full_name,
    display_name
  )
`;

const SURVEY_FALLBACK_SELECT = "*";

async function fetchProfiles(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<ProfileRecord[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, display_name");

  if (error) {
    console.warn("[admin/survey-responses] profiles fetch:", error.message);
    return [];
  }

  return (data ?? []) as ProfileRecord[];
}

async function fetchParticipants(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<ParticipantRecord[]> {
  const { data, error } = await supabase.from("participants").select("id, name");

  if (error) {
    console.warn("[admin/survey-responses] participants fetch:", error.message);
    return [];
  }

  return (data ?? []) as ParticipantRecord[];
}

async function fetchSurveyRows(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<{ rows: RawSurveyResponseRow[]; fetchMode: string; error: string | null }> {
  const joined = await supabase
    .from("survey_responses")
    .select(SURVEY_WITH_PROFILE_SELECT)
    .order("created_at", { ascending: false });

  if (!joined.error && joined.data) {
    return {
      rows: joined.data as RawSurveyResponseRow[],
      fetchMode: "join:profiles!responder_id",
      error: null,
    };
  }

  console.warn(
    "[admin/survey-responses] JOIN profiles falló, usando select('*'):",
    joined.error?.message,
  );

  const fallback = await supabase
    .from("survey_responses")
    .select(SURVEY_FALLBACK_SELECT)
    .order("created_at", { ascending: false });

  if (fallback.error) {
    return {
      rows: [],
      fetchMode: "failed",
      error: fallback.error.message,
    };
  }

  return {
    rows: (fallback.data ?? []) as RawSurveyResponseRow[],
    fetchMode: "select:*",
    error: null,
  };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  console.log(
    "[admin/survey-responses] session:",
    session?.user?.email ?? "sin sesión (RLS puede bloquear lecturas)",
  );

  const [surveyResult, profiles, participants] = await Promise.all([
    fetchSurveyRows(supabase),
    fetchProfiles(supabase),
    fetchParticipants(supabase),
  ]);

  if (surveyResult.error) {
    console.error("[admin/survey-responses] error:", surveyResult.error);
    return NextResponse.json(
      { error: surveyResult.error, data: [], graphRows: [] },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      },
    );
  }

  const identityMap = buildIdentityLabelMap(profiles, participants);
  const enrichedRows = enrichSurveyResponseRows(surveyResult.rows, identityMap);
  const graphRows = toGraphSurveyRows(enrichedRows);

  const payload = {
    fetchMode: surveyResult.fetchMode,
    rawCount: surveyResult.rows.length,
    profileCount: profiles.length,
    participantCount: participants.length,
    enriched: enrichedRows,
    graphRows,
  };

  console.log("[admin/survey-responses] payload:", JSON.stringify(payload, null, 2));

  return NextResponse.json(
    {
      error: null,
      fetchMode: surveyResult.fetchMode,
      rawCount: surveyResult.rows.length,
      data: enrichedRows,
      graphRows,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    },
  );
}
