// Stored health refresh: when it last ran (status bar), and "Updating health…" after the
// person's own writes until the refresh has caught up (services/health-pending.ts).
import { useEffect, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  getHealthPending,
  noteComputedAt,
  subscribeHealthPending,
} from "@/services/health-pending";
import { loadHealthComputedAt } from "@/services/hierarchy";
import { qk } from "@/services/query-keys";

/** True while one of this session's writes is waiting for the stored health to refresh. */
export function useHealthUpdating() {
  return useSyncExternalStore(
    subscribeHealthPending,
    () => getHealthPending() !== null,
    () => false,
  );
}

/** Newest computed_at; polled every 2 seconds only while one of the person's writes is pending. */
export function useHealthComputedAt() {
  const orgId = useOrgId();
  const updating = useHealthUpdating();
  return useQuery({
    queryKey: qk.healthComputedAt(orgId),
    queryFn: () => loadHealthComputedAt(orgId),
    refetchInterval: updating ? 2_000 : false,
  });
}

/**
 * Mounted once in the shell: when a pending write's refresh has landed, clear "Updating
 * health…" and refetch everything that shows health.
 */
export function HealthRefreshWatcher() {
  const orgId = useOrgId();
  const client = useQueryClient();
  const computedAt = useHealthComputedAt();
  const updating = useHealthUpdating();
  // A new pending write: check straight away rather than waiting for the first interval.
  useEffect(() => {
    if (updating) void computedAt.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a write starts pending
  }, [updating]);
  useEffect(() => {
    if (!computedAt.isFetched) return;
    if (noteComputedAt(computedAt.data ?? null)) {
      void client.invalidateQueries({ queryKey: qk.projects.all(orgId) });
      void client.invalidateQueries({ queryKey: qk.programmes.all(orgId) });
      void client.invalidateQueries({ queryKey: qk.portfolios.all(orgId) });
    }
  }, [computedAt.data, computedAt.dataUpdatedAt, computedAt.isFetched, client, orgId]);
  return null;
}
