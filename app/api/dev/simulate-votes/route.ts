import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { toNumericSupabaseGroupId } from "@/lib/groupId";
import { simulateDevVotesForGroup } from "@/lib/simulateDevVotes";

export const dynamic = "force-dynamic";

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { success: false, error: "Simulación de votos solo disponible en desarrollo." },
      { status: 403 },
    );
  }

  const supabase = createServiceRoleSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local. Añádela desde Supabase → Settings → API y reinicia el servidor.",
      },
      { status: 503 },
    );
  }

  let body: { groupId?: string };

  try {
    body = (await request.json()) as { groupId?: string };
  } catch {
    return NextResponse.json(
      { success: false, error: "Petición no válida." },
      { status: 400 },
    );
  }

  const groupId = typeof body.groupId === "string" ? body.groupId.trim() : "";

  if (!groupId) {
    return NextResponse.json(
      { success: false, error: "groupId es obligatorio." },
      { status: 400 },
    );
  }

  const numericGroupId = toNumericSupabaseGroupId(groupId);

  if (numericGroupId === null) {
    return NextResponse.json(
      {
        success: false,
        error: "groupId debe ser un identificador numérico válido de la URL.",
      },
      { status: 400 },
    );
  }

  try {
    const result = await simulateDevVotesForGroup(
      supabase,
      String(numericGroupId),
    );
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[api/dev/simulate-votes]", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudieron simular los votos de prueba.",
      },
      { status: 500 },
    );
  }
}
