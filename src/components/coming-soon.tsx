import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "./pmo-ui";
export function ComingSoon({
  title,
  description,
  variant = "grid",
}: {
  title: string;
  description: string;
  variant?: "grid" | "board" | "table";
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        actions={<Badge variant="secondary">Coming next</Badge>}
      />
      <div className="pointer-events-none select-none opacity-45" aria-hidden="true">
        <div className="mb-5 flex gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-28" />
        </div>
        {variant === "board" ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <Skeleton className="mb-6 h-5 w-24" />
                {[1, 2, 3].map((j) => (
                  <Skeleton key={j} className="mb-3 h-24 w-full" />
                ))}
              </div>
            ))}
          </div>
        ) : variant === "grid" ? (
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border p-4">
            <Skeleton className="mb-4 h-10 w-full" />
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="mb-3 h-12 w-full" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
