"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchGroupById } from "@/lib/groups";
import { getSupabase } from "@/lib/supabase";

type Participant = {
  id: string;
  name: string;
  group_id: string;
};

function parseNames(text: string): string[] {
  return text
    .split(/[,\n]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export default function GroupPage() {
  const params = useParams();
  const groupId = params.id as string;

  const [groupName, setGroupName] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [namesText, setNamesText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const fetchGroup = useCallback(async () => {
    const { data, error: fetchError } = await fetchGroupById(groupId);

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setGroupName(data.name);
  }, [groupId]);

  const fetchParticipants = useCallback(async () => {
    const { data, error: fetchError } = await getSupabase()
      .from("participants")
      .select("id, name, group_id")
      .eq("group_id", groupId)
      .order("name", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setParticipants(data ?? []);
  }, [groupId]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      await Promise.all([fetchGroup(), fetchParticipants()]);
      setIsLoading(false);
    }

    load();
  }, [fetchGroup, fetchParticipants]);

  async function handleAddParticipants() {
    const names = parseNames(namesText);

    if (names.length === 0) {
      setError("Introduce al menos un nombre de colaborador.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const { error: insertError } = await getSupabase()
      .from("participants")
      .insert(names.map((name) => ({ name, group_id: groupId })));

    setIsSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNamesText("");
    await fetchParticipants();
  }

  async function handleCopyStudentLink() {
    const url = `${window.location.origin}/cuestionario/${groupId}`;

    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      setError("No se pudo copiar el enlace. Inténtalo de nuevo.");
    }
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <Link
            href="/"
            className="mb-3 inline-flex items-center text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-500"
          >
            ← Volver al panel
          </Link>
          {isLoading ? (
            <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {groupName ?? "Equipo no encontrado"}
            </h1>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-amber-900">
                Dinámica de Equipo
              </h2>
              <p className="mt-1 text-sm text-amber-800/80">
                Comparte este enlace con los colaboradores del equipo para que
                completen el análisis de redes.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleCopyStudentLink}
                className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-amber-400 hover:shadow-lg active:scale-[0.98]"
              >
                {linkCopied ? "¡Enlace copiado!" : "Copiar Enlace para Colaboradores"}
              </button>
              <Link
                href={`/group/${groupId}/resultados`}
                className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-lg active:scale-[0.98]"
              >
                Ver Resultados
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Añadir colaboradores
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Pega aquí los nombres de los colaboradores separados por comas o
            saltos de línea.
          </p>

          <textarea
            value={namesText}
            onChange={(event) => setNamesText(event.target.value)}
            rows={6}
            placeholder={"Ana Martínez, Luis Fernández\nCarla Ruiz"}
            className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={handleAddParticipants}
              disabled={isSaving}
              className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Añadiendo…" : "Añadir Colaboradores"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Colaboradores del equipo
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {participants.length}{" "}
              {participants.length === 1 ? "colaborador" : "colaboradores"}{" "}
              registrados.
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {isLoading ? (
                  <tr>
                    <td className="px-6 py-12 text-center text-sm text-slate-500">
                      Cargando colaboradores…
                    </td>
                  </tr>
                ) : participants.length === 0 ? (
                  <tr>
                    <td className="px-6 py-12 text-center text-sm text-slate-500">
                      Aún no hay colaboradores en este equipo.
                    </td>
                  </tr>
                ) : (
                  participants.map((participant) => (
                    <tr key={participant.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900">
                        {participant.name}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
