import { useQuery } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import { loadProgressInputs } from "@/services/progress-chart";
import { listForecastHistory } from "@/services/overview-panels";

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
