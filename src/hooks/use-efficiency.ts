// Efficiency / savings programme (NHS-4 part 2): queries and mutations for the phasing grid, the
// targets editor and the year summary. Every change refreshes all of the organisation's efficiency
// queries, since a value or target changes the scheme, the summary and the dashboard together.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOrgId } from "@/components/auth/organisation-provider";
import { useModule } from "@/lib/modules";
import type { GridChange } from "@/data/efficiency";
import {
  getEfficiencySettings,
  getEfficiencySummary,
  listSchemeValues,
  listSchemes,
  listTargets,
  removeTarget,
  saveGridChanges,
  saveTarget,
  validateActuals,
} from "@/services/efficiency";
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
  };
}
