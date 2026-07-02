import { NextResponse } from "next/server";
import { ensureOrganizationWithServiceRole } from "@/lib/organizations-admin";

export const dynamic = "force-dynamic";

type EnsureOrganizationBody = {
  id?: string | null;
  name?: string | null;
};

/** Asegura tenant en organizations con service_role — bypass RLS en desarrollo local. */
export async function POST(request: Request) {
  let body: EnsureOrganizationBody;

  try {
    body = (await request.json()) as EnsureOrganizationBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  const result = await ensureOrganizationWithServiceRole({
    id: body.id,
    name: body.name,
  });

  if (result.error || !result.id) {
    return NextResponse.json(
      { error: result.error ?? "No se pudo asegurar la organización." },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { id: result.id }, error: null });
}
