import { NextResponse } from "next/server";
import {
  DEMO_DASHBOARD_ORGANIZATION_ID,
  type GroupRecord,
} from "@/lib/groups";
import { normalizeOrganizationId } from "@/lib/organizations";
import { FALLBACK_TEST_TENANT_ID, createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type CreateGroupBody = {
  name?: string;
  age_band?: string;
  organization_id?: string | null;
  manager_id?: string | null;
};

const GROUP_COLUMNS =
  "id, name, age_band, created_at, organization_id, manager_id, tenant_id";

/** Insert server-side con service_role — bypass RLS en desarrollo local. */
export async function POST(request: Request) {
  const admin = createSupabaseServiceRoleClient();

  if (!admin) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY no configurada. Ejecuta la migración 010 o añade la clave en .env.local.",
      },
      { status: 503 },
    );
  }

  let body: CreateGroupBody;

  try {
    body = (await request.json()) as CreateGroupBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const ageBand = typeof body.age_band === "string" ? body.age_band.trim() : "";

  if (!name || !ageBand) {
    return NextResponse.json(
      { error: "name y age_band son obligatorios." },
      { status: 400 },
    );
  }

  const organizationId =
    normalizeOrganizationId(body.organization_id) ??
    DEMO_DASHBOARD_ORGANIZATION_ID;

  const managerId = normalizeOrganizationId(body.manager_id);

  console.log("[BACKEND MULTI-TENANT] Insertando grupo con tenant:", {
    organization_id: organizationId,
    manager_id: managerId,
  });

  const payload = {
    name,
    age_band: ageBand,
    organization_id: organizationId,
    manager_id: managerId,
    tenant_id: FALLBACK_TEST_TENANT_ID,
  };

  const { data, error } = await admin
    .from("groups")
    .insert(payload)
    .select(GROUP_COLUMNS)
    .single();

  if (error) {
    console.error("[api/groups] insert falló:", error);
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }

  return NextResponse.json({ data: data as GroupRecord, error: null });
}
