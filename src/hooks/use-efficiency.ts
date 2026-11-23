// Efficiency / savings programme (NHS-4 parts 2–4): queries and mutations for the pipeline board,
// the scheme page, the phasing grid, the targets editor and the year summary. Every change refreshes all of the organisation's efficiency
// queries, since a value or target changes the scheme, the summary and the dashboard together.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOrgId } from "@/components/auth/organisation-provider";
import { useModule } from "@/lib/modules";
import { STAGE_LABELS, type EfficiencyStage, type GridChange } from "@/data/efficiency";
import {
  createScheme,
  getEfficiencySettings,
  getScheme,
  loadSchemeOptions,
  stageCheck,
  updateScheme,
  validateScheme,
  type SchemeEdit,
  getEfficiencySummary,
  getSchemesAtRisk,
  listSchemeValues,
  listSchemes,
  listTargets,
  removeTarget,
  saveGridChanges,
  saveTarget,
  validateActuals,
} from "@/services/efficiency";
import {
  importSchemes,
  importValues,
  type ImportValue,
  type SchemeImportValues,
} from "@/services/efficiency-import";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";

export function useEfficiencySchemes() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.efficiency.schemes(orgId),
    queryFn: () => listSchemes(orgId),
    enabled: useModule("efficiency"),
  });
}

export function useScheme(schemeId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.efficiency.scheme(orgId, schemeId),
    queryFn: () => getScheme(schemeId),
    enabled: Boolean(schemeId),
  });
}

/** People, categories and linkable records for the scheme form. */
export function useSchemeOptions(enabled = true) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.efficiency.options(orgId),
    queryFn: () => loadSchemeOptions(orgId),
    enabled,
    staleTime: 60_000,
  });
}

export function useSchemeValues(schemeId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.efficiency.values(orgId, schemeId),
    queryFn: () => listSchemeValues(schemeId),
    enabled: Boolean(schemeId),
  });
}

export function useEfficiencyTargets() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.efficiency.targets(orgId),
    queryFn: () => listTargets(orgId),
    enabled: useModule("efficiency"),
  });
}

export function useEfficiencySettings() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.efficiency.settings(orgId),
    queryFn: () => getEfficiencySettings(orgId),
  });
}

/** The year summary; `year` null = the current financial year. */
export function useEfficiencySummary(year: number | null, workspaceId: string | null = null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.efficiency.summary(orgId, year, workspaceId),
    queryFn: () => getEfficiencySummary(orgId, year ?? undefined, workspaceId ?? undefined),
    enabled: useModule("efficiency"),
  });
}

/** Schemes off track this year (the "schemes at risk" report block's rules). */
export function useSchemesAtRisk() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.efficiency.atRisk(orgId),
    queryFn: () => getSchemesAtRisk(orgId),
    enabled: useModule("efficiency"),
  });
}

export function useEfficiencyMutations() {
  const orgId = useOrgId();
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: qk.efficiency.all(orgId) });
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const options = { meta: { silent: true }, onError } as const;
  return {
    /** Saves the grid's changed cells; a part-saved grid still refreshes, then reports the error. */
    saveGrid: useMutation({
      ...options,
      mutationFn: async (input: { schemeId: string; changes: GridChange[] }) => {
        const result = await saveGridChanges(input.schemeId, input.changes);
        if (result.error) {
          await refresh();
          throw result.error;
        }
        return result.saved;
      },
      onSuccess: async (saved) => {
        await refresh();
        toast.success(saved === 1 ? "1 value saved." : `${saved} values saved.`);
      },
    }),
    validateActuals: useMutation({
      ...options,
      mutationFn: (input: { schemeId: string; months?: string[] }) =>
        validateActuals(input.schemeId, input.months),
      onSuccess: async (count) => {
        await refresh();
        toast.success(count === 1 ? "1 actual validated." : `${count} actuals validated.`);
      },
    }),
    createScheme: useMutation({
      ...options,
      mutationFn: (input: { workspaceId: string; edit: SchemeEdit & { title: string } }) =>
        createScheme(input.workspaceId, input.edit),
      onSuccess: refresh,
    }),
    updateScheme: useMutation({
      ...options,
      mutationFn: (input: { id: string; edit: SchemeEdit; lastSeen: string }) =>
        updateScheme(input.id, input.edit, input.lastSeen),
      onSuccess: async () => {
        await refresh();
        toast.success("Scheme saved.");
      },
    }),
    /** Moves a scheme to a stage. Asks the database what's missing first, so a refused move says
     *  what to add instead of failing; the stage trigger still decides. */
    moveStage: useMutation({
      ...options,
      mutationFn: async (input: { id: string; stage: EfficiencyStage; lastSeen: string }) => {
        const missing = await stageCheck(input.id, input.stage);
        if (missing.length)
          throw new Error(
            `Before ${STAGE_LABELS[input.stage]} this scheme needs ${missing.join(", ")}.`,
          );
        return updateScheme(input.id, { stage: input.stage }, input.lastSeen);
      },
      onSuccess: async (_written, input) => {
        await refresh();
        toast.success(`Moved to ${STAGE_LABELS[input.stage]}.`);
      },
    }),
    validateScheme: useMutation({
      ...options,
      mutationFn: (input: { id: string; validate: boolean; comment?: string; lastSeen?: string }) =>
        validateScheme(input.id, input.validate, input.comment, input.lastSeen),
      onSuccess: async (_v, input) => {
        await refresh();
        toast.success(input.validate ? "Scheme validated." : "Validation withdrawn.");
      },
    }),
    saveTarget: useMutation({
      ...options,
      mutationFn: (input: {
        workspaceId: string;
        financialYear: number;
        businessUnit: string | null;
        amount: number;
        note?: string | null;
        existing?: { id: string; updatedAt: string };
      }) => saveTarget(input.workspaceId, input, input.existing),
      onSuccess: refresh,
    }),
    removeTarget: useMutation({
      ...options,
      mutationFn: (id: string) => removeTarget(id),
      onSuccess: refresh,
    }),
    /** Part 5: the scheme and values imports (one insert each; all or none). The import panel
     *  shows a failure itself, so these don't toast it. */
    importSchemes: useMutation({
      meta: { silent: true },
      mutationFn: (input: { workspaceId: string; rows: SchemeImportValues[] }) =>
        importSchemes(input.workspaceId, input.rows),
      onSuccess: refresh,
    }),
    importValues: useMutation({
      meta: { silent: true },
      mutationFn: (values: ImportValue[]) => importValues(values),
      onSuccess: refresh,
    }),
  };
}
