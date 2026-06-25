import type { DemoOrgId } from "@/lib/demoOrganizations";

type DemoModePanelProps = {
  selectedOrgId: DemoOrgId;
  onSelectOrg: (orgId: DemoOrgId) => void;
  demoModeEnabled: boolean;
  onToggleDemoMode: (enabled: boolean) => void;
};

const ORG_OPTIONS: { id: DemoOrgId; label: string }[] = [
  { id: "tech-solutions", label: "Tech Solutions" },
  { id: "global-retail", label: "Global Retail" },
];

export default function DemoModePanel({
  selectedOrgId,
  onSelectOrg,
  demoModeEnabled,
  onToggleDemoMode,
}: DemoModePanelProps) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-100/80 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
              Super User
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Modo Demo · Multi-tenant
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            Con datos reales, el grafo se alimenta de{" "}
            <span className="font-medium">survey_responses</span> en Supabase.
            Activa el modo demo para usar datasets simulados multi-tenant.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={demoModeEnabled}
              onChange={(event) => onToggleDemoMode(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Activar datos simulados
          </label>

          <div
            className={`inline-flex rounded-lg border border-slate-300 bg-white p-1 shadow-sm ${demoModeEnabled ? "" : "pointer-events-none opacity-40"}`}
          >
            {ORG_OPTIONS.map((option) => {
              const isActive = selectedOrgId === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectOrg(option.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isActive
                      ? "bg-slate-800 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
