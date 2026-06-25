"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import SociometricNativeQuestionnaire from "@/components/SociometricNativeQuestionnaire";
import { fetchOrganizationIdForGroup } from "@/lib/surveyResponses";
import { getDefaultOrganizationId } from "@/lib/tenant";
import { getSupabase } from "@/lib/supabase";

type Participant = {
  id: string;
  name: string;
};

function parseOrganizationId(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export default function CuestionarioTeamPageClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const groupId = params.id as string;

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [organizationId, setOrganizationId] = useState<number>(
    parseOrganizationId(searchParams.get("organization_id")) ??
      getDefaultOrganizationId(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchParticipants = useCallback(async () => {
    const { data, error: fetchError } = await getSupabase()
      .from("participants")
      .select("id, name")
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

      const orgFromQuery = parseOrganizationId(
        searchParams.get("organization_id"),
      );

      if (orgFromQuery) {
        setOrganizationId(orgFromQuery);
      } else {
        const orgFromGroup = await fetchOrganizationIdForGroup(groupId);
        if (orgFromGroup) {
          setOrganizationId(orgFromGroup);
        }
      }

      await fetchParticipants();
      setIsLoading(false);
    }

    load();
  }, [fetchParticipants, groupId, searchParams]);

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-6">
        <p className="text-sm text-slate-500">Cargando cuestionario…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Todavía no hay colaboradores registrados en este equipo.
        </div>
      </div>
    );
  }

  return (
    <SociometricNativeQuestionnaire
      participants={participants}
      organizationId={organizationId}
    />
  );
}
