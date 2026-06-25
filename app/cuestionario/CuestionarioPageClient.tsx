"use client";

import { useSearchParams } from "next/navigation";
import SociometricNativeQuestionnaire from "@/components/SociometricNativeQuestionnaire";
import { getDefaultOrganizationId } from "@/lib/tenant";

function parseOrganizationId(value: string | null): number {
  if (!value) {
    return getDefaultOrganizationId();
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : getDefaultOrganizationId();
}

export default function CuestionarioPageClient() {
  const searchParams = useSearchParams();
  const organizationId = parseOrganizationId(searchParams.get("organization_id"));

  return <SociometricNativeQuestionnaire organizationId={organizationId} />;
}
