// Reference data that many services read (people, phases, programme and project names) goes
// through the app's React Query cache: one request per key while it is fresh, shared by every
// loader that needs it, and deduplicated while in flight. Writes invalidate the same qk keys as
// before, so a change is picked up on the next read.
//
// Hooks must not call these shared wrappers with the same key they use themselves (a query
// would wait on its own fetch); they use the raw loaders instead.
import type { QueryClient } from "@tanstack/react-query";

let client: QueryClient | null = null;

export function setSharedQueryClient(queryClient: QueryClient) {
  client = queryClient;
}

/** Five minutes: reference lists change rarely, and every write invalidates its key anyway. */
export const REFERENCE_STALE_TIME = 5 * 60_000;

export function sharedRead<T>(
  queryKey: readonly unknown[],
  load: () => Promise<T>,
  staleTime = REFERENCE_STALE_TIME,
): Promise<T> {
  // Outside the app (unit tests, scripts) there is no cache: load directly.
  return client ? client.fetchQuery({ queryKey, queryFn: load, staleTime }) : load();
}
