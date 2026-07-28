import Link from "next/link";
import { redirect } from "next/navigation";
import type {
  ManagerRecord,
  OrganizationRecord,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DashboardGroupRecord = {
  id: string | number;
  name: string;
  age_band: string;
  created_at: string;
  organization_id?: string | null;
  manager_id?: string | null;
};

function ManagerNotLinkedWarning() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">
          Acceso pendiente
        </p>
        <h1 className="mt-3 text-xl font-semibold text-slate-900">
          Cuenta sin organización asignada
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          Tu usuario aún no está asociado a ninguna organización. Contacta con
          soporte para que configuren tu cuenta de Manager.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex text-sm font-medium text-violet-600 hover:text-violet-500"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}

function EmptyTeamsState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-8 py-14 text-center">
      <p className="text-base font-medium text-slate-800">
        Aún no tienes equipos creados en tu organización
      </p>
      <p className="mt-2 text-sm text-slate-500">
        Crea tu primer equipo para comenzar a medir clima, ONA y resultados EDT.
      </p>
      <a
        href="#"
        className="mt-6 inline-flex rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
      >
        Crear Nuevo Equipo
      </a>
    </div>
  );
}

function TeamCard({ group }: { group: DashboardGroupRecord }) {
  const groupId = String(group.id);

  return (
    <article className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="text-lg font-semibold text-slate-900">{group.name}</h3>
      <p className="mt-2 text-sm text-slate-500">
        Rango de edad:{" "}
        <span className="font-medium text-slate-700">{group.age_band}</span>
      </p>
      <div className="mt-4 flex items-center gap-2">
        <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
          Equipo activo
        </span>
      </div>
      <div className="mt-6 pt-2">
        <Link
          href={`/group/${groupId}/resultados`}
          className="inline-flex w-full items-center justify-center rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
        >
          Ver resultados ONA
        </Link>
      </div>
    </article>
  );
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: manager, error: managerError } = await supabase
    .from("managers")
    .select("id, name, organization_id, email")
    .eq("user_id", user.id)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle<ManagerRecord>();

  if (managerError) {
    console.error("[dashboard] Error consultando managers:", managerError.message);
  }

  if (!manager) {
    return <ManagerNotLinkedWarning />;
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", manager.organization_id)
    .maybeSingle<OrganizationRecord>();

  if (organizationError) {
    console.error(
      "[dashboard] Error consultando organizations:",
      organizationError.message,
    );
  }

  const { data: groups, error: groupsError } = await supabase
    .from("groups")
    .select("id, name, age_band, created_at")
    .eq("organization_id", manager.organization_id)
    .order("created_at", { ascending: false })
    .returns<DashboardGroupRecord[]>();

  if (groupsError) {
    console.error("[dashboard] Error consultando groups:", groupsError.message);
  }

  const teamList = groups ?? [];
  const organizationName = organization?.name ?? "Organización sin nombre";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">
            Vínculo HR SaaS
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            Bienvenido de nuevo, {manager.name}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Organización actual:{" "}
            <span className="font-medium text-slate-900">{organizationName}</span>
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Equipos de tu organización
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {teamList.length}{" "}
              {teamList.length === 1 ? "equipo disponible" : "equipos disponibles"}
            </p>
          </div>
          <a
            href="#"
            className="inline-flex shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          >
            Crear Nuevo Equipo
          </a>
        </div>

        {teamList.length === 0 ? (
          <EmptyTeamsState />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {teamList.map((group) => (
              <TeamCard key={String(group.id)} group={group} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
