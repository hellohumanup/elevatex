"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchGroupsForTenant, insertGroup, type GroupRecord } from "@/lib/groups";

type Group = GroupRecord;

export default function Home() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setError(null);
    const { data, error: fetchError } = await fetchGroupsForTenant();

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setGroups(data ?? []);
  }, []);

  useEffect(() => {
    async function loadGroups() {
      setIsLoading(true);
      await fetchGroups();
      setIsLoading(false);
    }

    loadGroups();
  }, [fetchGroups]);

  function openForm() {
    setName("");
    setAgeBand("");
    setError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setName("");
    setAgeBand("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim() || !ageBand.trim()) {
      setError("Completa todos los campos.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const { error: insertError } = await insertGroup({
      name: name.trim(),
      age_band: ageBand.trim(),
    });

    setIsSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    closeForm();
    await fetchGroups();
  }

  function formatDate(isoDate: string) {
    return new Date(isoDate).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Vínculo - Panel de Control
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              ONA · Admin
            </Link>
            <button
              type="button"
              onClick={openForm}
              className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              Crear Nuevo Equipo
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {error && !showForm && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Tus Equipos</h2>
            <p className="mt-1 text-sm text-slate-500">
              Administra tus equipos y colaboradores desde un solo lugar.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Nombre
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Perfil del equipo
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Creado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-6 py-12 text-center text-sm text-slate-500"
                    >
                      Cargando equipos…
                    </td>
                  </tr>
                ) : groups.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-6 py-12 text-center text-sm text-slate-500"
                    >
                      Aún no tienes equipos. Pulsa &quot;Crear Nuevo Equipo&quot;
                      para empezar.
                    </td>
                  </tr>
                ) : (
                  groups.map((group) => (
                    <tr
                      key={group.id}
                      onClick={() => router.push(`/group/${group.id}`)}
                      className="cursor-pointer transition-colors hover:bg-indigo-50"
                    >
                      <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-indigo-600">
                        {group.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                        {group.age_band}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500">
                        {formatDate(group.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={closeForm}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">
                Nuevo Equipo
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="group-name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Nombre del equipo
                </label>
                <input
                  id="group-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej. Equipo Comercial Norte"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="age-band"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Perfil del equipo
                </label>
                <input
                  id="age-band"
                  type="text"
                  value={ageBand}
                  onChange={(event) => setAgeBand(event.target.value)}
                  placeholder="Ej. Mid-level · Operaciones"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
