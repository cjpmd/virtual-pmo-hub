import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, RotateCcw, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, isServiceError } from "@/services/service-error";

/**
 * Renders a query's three states the same way on every screen:
 * loading → skeleton, error → message with retry (or a not-found card), success → children.
 */
export function QueryState<T>({
  query,
  children,
  loading,
  notFound,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  loading?: ReactNode;
  notFound?: { title: string; backTo: string; backLabel: string };
}) {
  if (query.isPending) return <>{loading ?? <PageSkeleton />}</>;
  if (query.isError) {
    if (notFound && isServiceError(query.error) && query.error.kind === "not_found")
      return (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <SearchX className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 font-display text-lg font-semibold">{notFound.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{errorMessage(query.error)}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to={notFound.backTo}>{notFound.backLabel}</Link>
          </Button>
        </div>
      );
    return <QueryError error={query.error} retry={() => void query.refetch()} />;
  }
  return <>{children(query.data)}</>;
}

export function QueryError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-lg border border-health-bad/40 bg-health-bad/10 p-4 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1">{errorMessage(error)}</p>
      {retry && (
        <Button size="sm" variant="outline" onClick={retry}>
          <RotateCcw />
          Try again
        </Button>
      )}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
