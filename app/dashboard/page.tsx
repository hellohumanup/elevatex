import Link from "next/link";
import { redirect } from "next/navigation";
import FormSubmitButton from "@/app/dashboard/FormSubmitButton";
import SignOutButton from "@/app/dashboard/SignOutButton";
import type {
  ManagerInsert,
  ManagerRecord,
  OrganizationInsert,
  OrganizationRecord,
} from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?:
    | Promise<{ error?: string }>
    | { error?: string };
};

type DashboardGroupRecord = {
  id: string | number;
  name: string;
  organization_id?: string | null;
  manager_id?: string | null;
};

function slugifyOrganizationName(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "empresa"
  );
}

function buildOrganizationSlug(companyName: string, userId: string): string {
  const baseSlug = slugifyOrganizationName(companyName);
  const userSuffix = userId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);

  return userSuffix ? `${baseSlug}-${userSuffix}` : baseSlug;
}

async function createOrganizationAndManager(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const companyName = String(formData.get("companyName") ?? "").trim();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  if (!companyName) {
    redirect("/dashboard?error=Introduce+el+nombre+de+la+empresa");
  }

  const companySlug = buildOrganizationSlug(companyName, user.id);

  try {
    const { data: existingManager, error: managerLookupError } = await supabase
      .from("managers")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (managerLookupError) {
      throw new Error(managerLookupError.message);
    }

    if (existingManager?.id) {
      redirect("/dashboard");
    }

    const organizationInsert: Pick<OrganizationInsert, "name" | "slug"> = {
      name: companyName,
      slug: companySlug,
    };

    const { data: org, error: organizationError } = await supabase
      .from("organizations")
      .insert(organizationInsert)
      .select("id")
      .single<OrganizationRecord>();

    if (organizationError) {
      throw new Error(
        `Error creando la empresa: ${organizationError.message}`,
      );
    }

    if (!org?.id) {
      throw new Error(
        "La empresa se creo, pero Supabase no devolvio un id valido.",
      );
    }

    const managerInsert: ManagerInsert = {
      id: user.id,
      user_id: user.id,
      organization_id: org.id,
      role: "admin",
      full_name: user.email?.trim() || "Administrador",
      name:
        user.user_metadata?.full_name?.trim?.() ||
        user.email?.split("@")[0]?.trim() ||
        "Administrador",
      email: user.email ?? null,
    };

    const { error: managerInsertError } = await supabase
      .from("managers")
      .insert(managerInsert);

    if (managerInsertError) {
      const { error: rollbackError } = await supabase
        .from("organizations")
        .delete()
        .eq("id", org.id);

      if (rollbackError) {
        console.error(
          "[dashboard] No se pudo revertir organization tras fallo en managers:",
          rollbackError.message,
        );
      }

      throw new Error(
        `Error creando el manager: ${managerInsertError.message}`,
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo completar el onboarding inicial.";

    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }

  redirect("/dashboard");
}

async function createGroup(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  const groupName = String(formData.get("groupName") ?? "").trim();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  if (!groupName) {
    redirect("/dashboard?error=Introduce+el+nombre+del+equipo");
  }

  try {
    const { data: manager, error: managerError } = await supabase
      .from("managers")
      .select("id, organization_id")
      .eq("id", user.id)
      .maybeSingle<{ id: string; organization_id: string | null }>();

    if (managerError) {
      throw new Error(`Error consultando el manager: ${managerError.message}`);
    }

    if (!manager?.id || !manager.organization_id) {
      throw new Error(
        "No se encontro un manager con organization_id configurado.",
      );
    }

    const { error: insertError } = await supabase
      .from("groups")
      .insert({
        name: groupName,
        organization_id: manager.organization_id,
        manager_id: manager.id,
      });

    if (insertError) {
      throw new Error(`Error creando el equipo: ${insertError.message}`);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo crear el equipo.";

    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }

  redirect("/dashboard");
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  const email = user.email?.trim() || "usuario";
  const errorMessage = resolvedSearchParams?.error?.trim() || null;

  const { data: manager, error: managerError } = await supabase
    .from("managers")
    .select("id, organization_id, role, full_name, user_id, name, email")
    .eq("id", user.id)
    .maybeSingle<ManagerRecord>();

  if (managerError) {
    console.error("[dashboard] Error consultando managers:", managerError.message);
  }

  if (!manager) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="mb-4">Bienvenido al Dashboard, {email}</p>
        <p className="mb-4">
          Completa la configuracion inicial de tu organizacion.
        </p>
        {errorMessage ? (
          <p
            role="alert"
            className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {errorMessage}
          </p>
        ) : null}
        <form action={createOrganizationAndManager} className="space-y-4">
          <div>
            <label
              htmlFor="companyName"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Nombre de la Empresa
            </label>
            <input
              id="companyName"
              name="companyName"
              type="text"
              required
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Mi Empresa"
            />
          </div>
          <FormSubmitButton
            idleText="Crear empresa y continuar"
            pendingText="Creando empresa..."
          />
        </form>
        <div className="mt-4">
          <SignOutButton />
        </div>
      </main>
    );
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id, name, created_at")
    .eq("id", manager.organization_id)
    .maybeSingle<OrganizationRecord>();

  if (organizationError) {
    console.error(
      "[dashboard] Error consultando organizations:",
      organizationError.message,
    );
  }

  const organizationName = organization?.name?.trim() || "Sin empresa";

  const { data: groups, error: groupsError } = await supabase
    .from("groups")
    .select("id, name, organization_id, manager_id")
    .eq("organization_id", manager.organization_id)
    .order("name", { ascending: true })
    .returns<DashboardGroupRecord[]>();

  if (groupsError) {
    console.error("[dashboard] Error consultando groups:", groupsError.message);
  }

  const teamList = groups ?? [];

  return (
    <main className="p-6">
      <p>Bienvenido, {email}. Empresa: {organizationName}</p>
      {errorMessage ? (
        <p
          role="alert"
          className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-slate-700">
          Equipos de tu organizacion
        </p>
        {teamList.length > 0 ? (
          <ul className="space-y-2">
            {teamList.map((group) => {
              const groupId = String(group.id);

              return (
                <li key={groupId} className="rounded border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">{group.name}</p>
                  <div className="mt-1 flex gap-3 text-sm">
                    <Link className="text-violet-600 underline" href={`/group/${groupId}`}>
                      Gestionar
                    </Link>
                    <Link
                      className="text-violet-600 underline"
                      href={`/group/${groupId}/resultados`}
                    >
                      Resultados
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Aun no hay equipos creados.</p>
        )}
      </div>

      <form action={createGroup} className="mt-6 max-w-md space-y-4">
        <div>
          <label
            htmlFor="groupName"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Crear Nuevo Equipo
          </label>
          <input
            id="groupName"
            name="groupName"
            type="text"
            required
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="Nombre del equipo"
          />
        </div>
        <FormSubmitButton idleText="Crear equipo" pendingText="Creando equipo..." />
      </form>

      <SignOutButton />
    </main>
  );
}
