import { useQuery } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { loadProgressInputs } from "@/services/progress-chart";
import { listForecastHistory } from "@/services/overview-panels";
import {
  getPortfolioOverviewData,
  getWorkspaceId,
} from "@/services/portfolio-overview-rpc";

/** The current organisation's workspace id (one per organisation today). */
export function useWorkspaceId() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["org", orgId, "workspace"] as const,
    queryFn: () => getWorkspaceId(orgId),
    staleTime: 30 * 60_000,
  });
}

/**
 * The whole portfolio overview in one RPC call (spec §6): chart inputs, snapshot history,
 * forecast history, as-of and the organisation's today.
 */
export function usePortfolioOverviewData(portfolioId: string | undefined) {
  const orgId = useOrgId();
  const workspace = useWorkspaceId();
  return useQuery({
    queryKey: ["org", orgId, "portfolios", "overview-rpc", portfolioId ?? ""] as const,
    queryFn: () => getPortfolioOverviewData(workspace.data as string, portfolioId as string),
    enabled: Boolean(workspace.data && portfolioId),
  });
}

/** Raw records behind the overview ProgressChart for the given projects. */
export function useProgressInputs(projectIds: string[]) {
  const orgId = useOrgId();
  const ids = [...projectIds].sort();
  return useQuery({
    queryKey: ["org", orgId, "portfolios", "progress", ids] as const,
    queryFn: () => loadProgressInputs(orgId, ids),
  });
}

/** Month-end forecast (EAC) history, for the watchlist's change and trend columns. */
export function useForecastHistory(projectIds: string[]) {
  const orgId = useOrgId();
  const ids = [...projectIds].sort();
  return useQuery({
    queryKey: ["org", orgId, "portfolios", "forecast-history", ids] as const,
    queryFn: () => listForecastHistory(orgId, ids),
  });
}
