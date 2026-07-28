import { NextResponse } from "next/server";
import { resolveParticipantByAccessToken } from "@/lib/magicLink";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const supabase = createSupabaseServiceRoleClient();

  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error:
          "SUPABASE_SERVICE_ROLE_KEY no configurada. Añádela en .env.local y reinicia el servidor.",
      },
      { status: 503 },
    );
  }

  const { token } = await context.params;
  const resolution = await resolveParticipantByAccessToken(supabase, token);

  if (!resolution.ok) {
    return NextResponse.json(
      { success: false, error: resolution.error },
      { status: resolution.status },
    );
  }

  return NextResponse.json(
    {
      success: true,
      ...resolution.data,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
