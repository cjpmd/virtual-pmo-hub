import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  CircleDollarSign,
  FolderKanban,
  Gauge,
  TrendingUp,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { MetricCard } from "@/components/charts/kpi-card";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
        <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
const metricIcons = {
  projects: FolderKanban,
  budget: CircleDollarSign,
  forecast: TrendingUp,
  health: Gauge,
};
/** Compatibility wrapper: existing dashboards inherit the Portfolio metric treatment. */
export function KpiCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: keyof typeof metricIcons;
}) {
  const Icon = metricIcons[icon];
  return (
    <MetricCard label={label} value={value} context={detail} icon={<Icon className="size-4" />} />
  );
}
export type Column<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
};
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
}) {
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const data = [...rows].sort((a, b) => {
    if (!sort) return 0;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return 0;
    const av = col.sortValue(a),
      bv = col.sortValue(b);
    return (av > bv ? 1 : av < bv ? -1 : 0) * (sort.direction === "asc" ? 1 : -1);
  });
  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-table-head">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "h-11 border-b border-border/70 px-4 text-xs font-semibold text-muted-foreground",
                    col.className,
                  )}
                >
                  {col.sortable ? (
                    <button
                      className="inline-flex items-center gap-1"
                      onClick={() =>
                        setSort((s) => ({
                          key: col.key,
                          direction: s?.key === col.key && s.direction === "asc" ? "desc" : "asc",
                        }))
                      }
                    >
                      {col.label}
                      {sort?.key === col.key ? (
                        sort.direction === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-50" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-b border-border/60 last:border-0",
                  onRowClick && "cursor-pointer hover:bg-accent/30",
                )}
              >
                {columns.map((col, colIndex) => (
                  <td
                    key={col.key}
                    className={cn(
                      "h-12 px-4 text-sm text-card-foreground",
                      col.className,
                      colIndex === 0 && "font-medium",
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export function EntityHeader({
  title,
  description,
  health,
  children,
}: {
  title: string;
  description: string;
  health: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-border/70 pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
            Programme
          </p>
          <h1 className="font-display text-3xl font-semibold text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {health}
      </div>
      <div className="mt-6 grid gap-x-6 gap-y-4 border-t border-border/60 pt-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {children}
      </div>
    </div>
  );
}
export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-foreground" title={value}>
        {value}
      </p>
    </div>
  );
}
