import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";
import { abortPageReads, installPageReadAbort } from "./lib/page-reads";
import { setSharedQueryClient } from "./services/shared-query";
import { errorMessage, isServiceError } from "./services/service-error";

/**
 * Only failures that might succeed on a second try are retried. A timeout is not: it would
 * most likely time out again, adding load, so the screen shows "try again" straight away.
 */
const shouldRetry = (failureCount: number, error: unknown) =>
  failureCount < 2 &&
  (!isServiceError(error) || error.kind === "network" || error.kind === "unknown");

const wasCancelled = (error: unknown) => isServiceError(error) && error.kind === "cancelled";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
    // Every failed write is reported the same way. Screens show read errors inline.
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.meta?.["silent"]) return;
        toast.error(errorMessage(error));
      },
    }),
  });

  // Browser only: on the server getRouter runs per request, and a module-level cache would be
  // shared between people's requests.
  if (typeof window !== "undefined") setSharedQueryClient(queryClient);

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Leaving a page abandons its reads. Anything still on screen afterwards (the shell) that was
  // cancelled loads again once the new page has resolved.
  installPageReadAbort(import.meta.env.VITE_SUPABASE_URL ?? "");
  router.subscribe("onBeforeNavigate", (event) => {
    if (event.pathChanged) abortPageReads();
  });
  router.subscribe("onResolved", () => {
    void queryClient.refetchQueries({
      type: "active",
      predicate: (query) => query.state.status === "error" && wasCancelled(query.state.error),
    });
  });

  return router;
};
