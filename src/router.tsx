import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";
import { errorMessage, isServiceError } from "./services/service-error";

/** Only failures that might succeed on a second try are retried. */
const shouldRetry = (failureCount: number, error: unknown) =>
  failureCount < 2 &&
  (!isServiceError(error) || error.kind === "network" || error.kind === "unknown");

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

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
