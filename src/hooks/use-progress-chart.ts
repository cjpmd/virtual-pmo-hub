import { useQuery } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { loadProgressInputs } from "@/services/progress-chart";
import { listForecastHistory } from "@/services/overview-panels";
import { getPortfolioOverviewData } from "@/services/portfolio-overview-rpc";

/**
 * The whole portfolio overview in one RPC call (spec §6): chart inputs, snapshot history,
 * forecast history, as-of and the organisation's today.
 */
export function usePortfolioOverviewData(
  portfolio: { id: string; workspaceId: string } | undefined,
) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["org", orgId, "portfolios", "overview-rpc", portfolio?.id ?? ""] as const,
    // The portfolio's own workspace: an organisation can have several.
    queryFn: () => getPortfolioOverviewData(portfolio!.workspaceId, portfolio!.id),
    enabled: Boolean(portfolio?.id && portfolio.workspaceId),
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
