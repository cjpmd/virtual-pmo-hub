// TanStack Query hooks over src/services/financials.ts. Every financial write can move a
// project's EAC, and with it financial health and the programme and portfolio roll-ups, so
// each mutation ends by refreshing the project's financials and the roll-ups.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  addBaseline,
  addCostLine,
  closeFinancialPeriod,
  commitActualsImport,
  getPortfolioFinancials,
  getProgrammeFinancials,
  listBaselinedChangeIds,
  listFinancialPeriods,
  listLookupOptions,
  listProjectFinancials,
  loadProjectFinancials,
  reopenFinancialPeriod,
  saveCell,
  updateCostLine,
  type BaselineInput,
  type CellWrite,
  type CostLineInput,
  type ImportMode,
} from "@/services/financials";
import type { CommitRow } from "@/services/actuals-import";
import { qk } from "@/services/query-keys";
import { invalidateRollups } from "./use-project-records";

export function useProjectFinancials(projectId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.financials(orgId, projectId),
    queryFn: () => loadProjectFinancials(orgId, projectId),
  });
}

export function useProgrammeFinancials(programmeId: string) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.programmes.financials(orgId, programmeId),
    queryFn: () => getProgrammeFinancials(programmeId),
    enabled: Boolean(programmeId),
  });
}

export function usePortfolioFinancials(portfolioId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.portfolios.financials(orgId, portfolioId ?? ""),
    queryFn: () => getPortfolioFinancials(portfolioId ?? ""),
    enabled: Boolean(portfolioId),
  });
}

export function useProjectFinancialsList(filter: {
  programmeId?: string;
  portfolioId?: string;
  projectIds?: string[];
}) {
  const orgId = useOrgId();
  const scope = filter.programmeId
    ? `programme:${filter.programmeId}`
    : `portfolio:${filter.portfolioId ?? ""}`;
  const projectScope = filter.projectIds ? [...filter.projectIds].sort().join(",") : "all";
  return useQuery({
    queryKey: qk.projects.financialsList(orgId, `${scope}:${projectScope}`),
    queryFn: () => listProjectFinancials(filter),
    enabled: Boolean(filter.programmeId || filter.portfolioId),
  });
}

export function useFinancialPeriods() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.financialPeriods(orgId),
    queryFn: () => listFinancialPeriods(orgId),
  });
}

export function useBaselinedChanges() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.projects.baselinedChanges(orgId),
    queryFn: () => listBaselinedChangeIds(orgId),
  });
}

export function useLookupOptions(listKey: "cost_category" | "funding_source") {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.lookups(orgId, listKey),
    queryFn: () => listLookupOptions(orgId, listKey),
    staleTime: 5 * 60_000,
  });
}

export function useFinancialMutations(projectId?: string) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  // Roll-ups cover every project key, including this project's financials. Not awaited: the
  // health views can take a while to refetch, and the write itself is done (the grid's queue
  // and the import dialog shouldn't wait for every list on the page to reload).
  const onSettled = () => {
    void invalidateRollups(queryClient, orgId);
  };
  return {
    saveCell: useMutation({ mutationFn: (cell: CellWrite) => saveCell(cell), onSettled }),
    addLine: useMutation({
      mutationFn: ({
        input,
        sortOrder,
      }: {
        input: CostLineInput & { name: string; categoryId: string };
        sortOrder: number;
      }) => addCostLine(projectId ?? "", input, sortOrder),
      onSettled,
    }),
    updateLine: useMutation({
      mutationFn: ({
        id,
        input,
        lastSeen,
      }: {
        id: string;
        input: CostLineInput;
        lastSeen: string | null;
      }) => updateCostLine(id, input, lastSeen),
      onSettled,
    }),
    addBaseline: useMutation({
      mutationFn: (input: BaselineInput) => addBaseline(input),
      onSettled,
    }),
    closePeriod: useMutation({
      mutationFn: (month: string) => closeFinancialPeriod(orgId, month),
      onSettled,
    }),
    reopenPeriod: useMutation({
      mutationFn: ({ month, reason }: { month: string; reason: string }) =>
        reopenFinancialPeriod(orgId, month, reason),
      onSettled,
    }),
    commitImport: useMutation({
      mutationFn: ({
        workspaceId,
        fileName,
        mode,
        rows,
      }: {
        workspaceId: string;
        fileName: string;
        mode: ImportMode;
        rows: CommitRow[];
      }) => commitActualsImport(workspaceId, fileName, mode, rows),
      onSettled,
    }),
  };
}
