"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchGroupById } from "@/lib/groups";
import { toSupabaseGroupId } from "@/lib/groupId";
import { fetchQuestionnaireResponseCountForGroup } from "@/lib/questionnaire";
import { getSupabase } from "@/lib/supabase";

type Participant = {
  id: string;
  name: string;
  email: string | null;
  group_id: string;
};

type ParsedParticipantRow = {
  name: string;
  email: string | null;
};

function parseParticipantRows(text: string): ParsedParticipantRow[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const commaIndex = line.indexOf(",");

      if (commaIndex === -1) {
        return { name: line.trim(), email: null };
      }

      const name = line.slice(0, commaIndex).trim();
      const email = line.slice(commaIndex + 1).trim();

      return {
        name,
        email: email.length > 0 ? email : null,
      };
    })
    .filter((row) => row.name.length > 0);
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
  const [responseCount, setResponseCount] = useState(0);
  const [isLoadingResponses, setIsLoadingResponses] = useState(true);
  const [isSendingInvitations, setIsSendingInvitations] = useState(false);
  const [deletingParticipantId, setDeletingParticipantId] = useState<
    string | null
  >(null);

  const isParticipantActionDisabled =
    isLoading ||
    isSaving ||
    isSendingInvitations ||
    deletingParticipantId !== null;

  const fetchGroup = useCallback(async () => {
    const { data, error: fetchError } = await fetchGroupById(groupId);

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setGroupName(data.name);
  }, [groupId]);

  const fetchParticipants = useCallback(async () => {
    const databaseGroupId = toSupabaseGroupId(groupId);

    const { data, error: fetchError } = await getSupabase()
      .from("participants")
      .select("*")
      .eq("group_id", databaseGroupId)
      .order("name", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    setParticipants(
      (data ?? []).map((participant) => ({
        id: String(participant.id),
        name: participant.name,
        email:
          typeof participant.email === "string" && participant.email.trim()
            ? participant.email.trim()
            : null,
        group_id: String(participant.group_id),
      })),
    );
  }, [groupId]);

  const fetchResponseCount = useCallback(async () => {
    setIsLoadingResponses(true);

    const { count, error: countError } =
      await fetchQuestionnaireResponseCountForGroup(groupId);

    if (countError) {
      setError(countError);
      setResponseCount(0);
    } else {
      setResponseCount(count);
    }

    setIsLoadingResponses(false);
  }, [groupId]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      await Promise.all([
        fetchGroup(),
        fetchParticipants(),
        fetchResponseCount(),
      ]);
      setIsLoading(false);
    }

    load();
  }, [fetchGroup, fetchParticipants, fetchResponseCount]);

  async function handleAddParticipants() {
    const rows = parseParticipantRows(namesText);

    if (rows.length === 0) {
      setError("Introduce al menos un nombre de colaborador.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const { error: insertError } = await getSupabase()
      .from("participants")
      .insert(
        rows.map((row) => ({
          name: row.name,
          email: row.email,
          group_id: toSupabaseGroupId(groupId),
        })),
      );

    setIsSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNamesText("");
    await fetchParticipants();
  }

  async function handleDeleteParticipant(participantId: string) {
    if (isParticipantActionDisabled) {
      return;
    }

    setDeletingParticipantId(participantId);
    setError(null);

    const { error: deleteError } = await getSupabase()
      .from("participants")
      .delete()
      .eq("id", participantId);

    setDeletingParticipantId(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setParticipants((current) =>
      current.filter((participant) => participant.id !== participantId),
    );
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

  async function handleSendInvitations() {
    setIsSendingInvitations(true);

    try {
      await fetch("/api/send-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
    } catch (error) {
      console.error("[GroupPage] Error al enviar:", error);
    } finally {
      setIsSendingInvitations(false);
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

        <section className="rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 shadow-sm">
          <div className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div className="min-w-0 flex-1 md:max-w-md md:pr-6">
              <h2 className="text-lg font-semibold tracking-tight text-amber-900">
                Dinámica de Equipo
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-amber-800/80">
                Comparte el enlace o envía invitaciones por correo con el token
                único de cada colaborador.
              </p>
            </div>

            <div className="flex w-full shrink-0 flex-wrap items-center gap-3 md:w-auto md:justify-end">
              <button
                type="button"
                onClick={handleSendInvitations}
                disabled={isSendingInvitations || isLoading}
                className="inline-flex h-14 min-h-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-violet-500 px-5 text-sm font-bold text-white shadow-md shadow-violet-500/25 transition-all hover:from-violet-500 hover:to-violet-400 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSendingInvitations ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Enviando invitaciones…
                  </span>
                ) : (
                  "Enviar Invitaciones por Email"
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyStudentLink}
                className="inline-flex h-14 min-h-14 shrink-0 items-center justify-center rounded-xl bg-amber-500 px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-amber-400 hover:shadow-lg active:scale-[0.98]"
              >
                {linkCopied ? "¡Enlace copiado!" : "Copiar Enlace para Colaboradores"}
              </button>

              {isLoadingResponses ? (
                <span className="inline-flex h-14 min-h-14 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 px-5 text-sm font-semibold text-slate-500">
                  Verificando respuestas…
                </span>
              ) : responseCount > 0 ? (
                <Link
                  href={`/group/${groupId}/resultados`}
                  className="inline-flex h-14 min-h-14 shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-lg active:scale-[0.98]"
                >
                  Ver Resultados
                </Link>
              ) : (
                <span
                  className="inline-flex h-14 min-h-14 shrink-0 cursor-not-allowed items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-5 text-sm font-semibold text-slate-400"
                  role="status"
                  aria-disabled="true"
                >
                  Pendiente de Respuestas
                </span>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Añadir colaboradores
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Pega un colaborador por línea en formato{" "}
            <span className="font-medium text-slate-700">Nombre, email</span>.
            Si omites el correo, se guardará solo el nombre.
          </p>

          <textarea
            value={namesText}
            onChange={(event) => setNamesText(event.target.value)}
            rows={6}
            placeholder={
              "Ana Martínez, ana@empresa.com\nLuis Fernández, luis@empresa.com"
            }
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
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Correo Electrónico
                  </th>
                  <th scope="col" className="px-6 py-3">
                    <span className="sr-only">Acciones</span>
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
                      Cargando colaboradores…
                    </td>
                  </tr>
                ) : participants.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-6 py-12 text-center text-sm text-slate-500"
                    >
                      Aún no hay colaboradores en este equipo.
                    </td>
                  </tr>
                ) : (
                  participants.map((participant) => (
                    <tr key={participant.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900">
                        {participant.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">
                        {participant.email || "Sin correo"}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteParticipant(participant.id)
                          }
                          disabled={isParticipantActionDisabled}
                          className="text-xs font-medium text-red-600 transition-colors hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {deletingParticipantId === participant.id
                            ? "Eliminando…"
                            : "Eliminar"}
                        </button>
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
