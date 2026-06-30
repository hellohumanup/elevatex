"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  DEMO_DASHBOARD_ORGANIZATION_ID,
  fetchGroupsWithParticipantCounts,
  insertGroup,
  type GroupWithParticipantCount,
} from "@/lib/groups";

type Group = GroupWithParticipantCount;

function formatParticipantLabel(count: number): string {
  if (count === 0) {
    return "Sin colaboradores aún";
  }

  return count === 1
    ? "1 Colaborador añadido"
    : `${count} Colaboradores añadidos`;
}

export default function Home() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [ageBand, setAgeBand] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setError(null);

    const { data, error: fetchError } = await fetchGroupsWithParticipantCounts(
      DEMO_DASHBOARD_ORGANIZATION_ID,
    );

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setGroups(data);
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

    const { data: createdGroup, error: insertError } = await insertGroup({
      name: name.trim(),
      age_band: ageBand.trim(),
      organization_id: DEMO_DASHBOARD_ORGANIZATION_ID,
    });

    setIsSaving(false);

    if (insertError) {
      const message =
        typeof insertError.message === "string" && insertError.message.length > 0
          ? insertError.message
          : "No se pudo crear el equipo. Revisa la consola del navegador.";
      console.error("[Home] Error al crear equipo:", insertError);
      setError(message);
      return;
    }

    if (!createdGroup) {
      console.error(
        "[Home] insertGroup terminó sin error pero sin createdGroup.",
      );
      setError(
        "No se pudo confirmar la creación del equipo. Revisa la consola y las políticas RLS.",
      );
      return;
    }

    console.log("[Home] Equipo guardado en Supabase:", createdGroup);

    const newGroup: Group = {
      ...createdGroup,
      participant_count: 0,
    };

    setGroups((current) => [newGroup, ...current]);
    closeForm();
    await fetchGroups();
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">
              Vínculo HR · Multi-equipo
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Dashboard de Equipos
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Vista corporativa de equipos activos en tu organización.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
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

        <section>
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Equipos de la organización
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Accede al sociograma y al informe de clima con IA de cada equipo.
              </p>
            </div>
            {!isLoading && (
              <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:inline-flex">
                {groups.length}{" "}
                {groups.length === 1 ? "equipo activo" : "equipos activos"}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-52 animate-pulse rounded-xl border border-slate-200 bg-white shadow-sm"
                />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
              <p className="text-base font-medium text-slate-700">
                Aún no hay equipos en esta organización.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Pulsa &quot;Crear Nuevo Equipo&quot; para registrar el primero.
              </p>
              <button
                type="button"
                onClick={openForm}
                className="mt-6 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
              >
                Crear Nuevo Equipo
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {groups.map((group) => (
                <article
                  key={group.id}
                  className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {group.name}
                    </h3>
                    <span className="inline-flex shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-100">
                      {group.age_band}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <span
                      className={`inline-flex h-2.5 w-2.5 rounded-full ${
                        group.participant_count > 0
                          ? "bg-emerald-500"
                          : "bg-amber-400"
                      }`}
                      aria-hidden
                    />
                    <p className="text-sm text-slate-600">
                      {formatParticipantLabel(group.participant_count)}
                    </p>
                  </div>

                  <div className="mt-auto pt-6">
                    <Link
                      href={`/group/${group.id}/resultados`}
                      className="inline-flex w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      Ver Sociograma y Reporte IA
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
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
                  placeholder="Ej. Equipo de Desarrollo"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="age-band"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Banda de edad / departamento
                </label>
                <input
                  id="age-band"
                  type="text"
                  value={ageBand}
                  onChange={(event) => setAgeBand(event.target.value)}
                  placeholder="Ej. 25-35 · Producto"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

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
