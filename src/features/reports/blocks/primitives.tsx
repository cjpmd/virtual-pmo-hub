// Shared pieces for block renderers: rating chips mapped through the report's scheme, tables,
// stat tiles, movement markers. Renderers are pure: data and config in, markup out.
import type { ReactNode } from "react";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RatingLevel, RatingScheme, RenderContext } from "./types";

export type Rag = "green" | "amber" | "red" | "not_set";

/** The scheme level for a RAG value (via levels[].rag) or a level key. */
export function levelFor(
  scheme: RatingScheme,
  value: string | null | undefined,
): RatingLevel | null {
  if (!value) return null;
  return (
    scheme.levels.find((level) => level.key === value) ??
    scheme.levels.find((level) => level.rag === value) ??
    null
  );
}

/** A rating chip: colour swatch plus the scheme's label (never colour alone, §20). */
export function RatingChip({
  scheme,
  value,
  prefix,
  size = "md",
}: {
  scheme: RatingScheme;
  value: string | null | undefined;
  prefix?: string;
  size?: "sm" | "md" | "lg";
}) {
  const level = levelFor(scheme, value);
  const label = level?.label ?? "Not reported";
  const colour = level?.colour ?? "#6b7280";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold",
        size === "sm" && "h-6 px-2 text-[11px]",
        size === "md" && "h-7 px-2.5 text-xs",
        size === "lg" && "h-9 px-3.5 text-sm",
      )}
      style={{ borderColor: `${colour}55`, backgroundColor: `${colour}1f` }}
      data-rating={level?.key ?? "none"}
    >
      <span
        aria-hidden
        className={cn("inline-block rounded-full", size === "lg" ? "size-3" : "size-2.5")}
        style={{ backgroundColor: colour }}
      />
      {prefix && <span className="font-normal text-muted-foreground">{prefix}</span>}
      <span>{label}</span>
    </span>
  );
}

/** ▲▼ marker for a rating that moved since the previous pack (worse = up the RAG scale). */
export function RatingMove({
  scheme,
  from,
  to,
}: {
  scheme: RatingScheme;
  from: string | null | undefined;
  to: string | null | undefined;
}) {
  if (!from || from === to) return null;
  const a = levelFor(scheme, from)?.rank;
  const b = levelFor(scheme, to)?.rank;
  if (a === undefined || b === undefined) return null;
  const worse = b > a;
  return (
    <span
      className={cn(
        "ml-1 text-[11px] font-semibold",
        worse ? "text-health-bad-foreground" : "text-health-good-foreground",
      )}
      title={`Was ${levelFor(scheme, from)?.label ?? from}`}
      aria-label={`${worse ? "Worse" : "Better"} than last pack (was ${levelFor(scheme, from)?.label ?? from})`}
    >
      {worse ? "▼" : "▲"} was {levelFor(scheme, from)?.label}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-sm text-muted-foreground">{children}</p>;
}

export function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "good" | "warn" | "bad" | undefined;
}) {
  return (
    <div className="rounded-md border bg-background/60 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-lg font-semibold pmo-num",
          tone === "good" && "text-health-good-foreground",
          tone === "warn" && "text-health-warn-foreground",
          tone === "bad" && "text-health-bad-foreground",
        )}
      >
        {value}
      </div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

export interface Col<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}

export function Table<T>({
  rows,
  cols,
  rowKey,
  caption,
  empty = "Nothing to show.",
  group,
}: {
  rows: T[];
  cols: Col<T>[];
  rowKey: (row: T) => string;
  caption?: string;
  empty?: string;
  /** Group heading per row (rows already sorted by group). */
  group?: (row: T) => string;
}) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  let last: string | null = null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            {cols.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "px-2 py-1.5 font-medium",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const heading = group?.(row) ?? null;
            const showHeading = heading !== null && heading !== last;
            last = heading;
            return [
              showHeading ? (
                <tr key={`g-${heading}`} className="report-avoid-break">
                  <th
                    colSpan={cols.length}
                    scope="colgroup"
                    className="bg-muted/50 px-2 py-1 text-left text-xs font-semibold"
                  >
                    {heading}
                  </th>
                </tr>
              ) : null,
              <tr key={rowKey(row)} className="report-avoid-break border-b last:border-0 align-top">
                {cols.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-2 py-1.5",
                      col.align === "right" && "text-right pmo-num",
                      col.align === "center" && "text-center",
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Money and dates in the organisation's format. */
export function useReportFormat() {
  const format = useFormat();
  return {
    money: (value: number | string | null | undefined) =>
      value === null || value === undefined || value === "" ? "—" : format.compact(Number(value)),
    date: (value: string | null | undefined) => (value ? format.date(value) : "—"),
    signedMoney: (value: number | string | null | undefined) => {
      if (value === null || value === undefined || value === "") return "—";
      const n = Number(value);
      return `${n > 0 ? "+" : ""}${format.compact(n)}`;
    },
    pct: (value: number | string | null | undefined) => {
      if (value === null || value === undefined || value === "") return "—";
      const n = Number(value);
      return `${n > 0 ? "+" : ""}${n.toFixed(1).replace(/\.0$/, "")}%`;
    },
  };
}

export const days = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n} ${Math.abs(n) === 1 ? "day" : "days"}`;

/** Horizontal stacked bar (SVG, accessible), e.g. counts by rating. */
export function StackedBar({
  parts,
  label,
  height = 14,
}: {
  parts: Array<{ key: string; value: number; colour: string; label: string }>;
  label: string;
  height?: number;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  let x = 0;
  return (
    <svg
      role="img"
      aria-label={`${label}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      <title>{label}</title>
      {total === 0 ? (
        <rect x={0} y={0} width={100} height={height} fill="#e5e7eb" />
      ) : (
        parts.map((part) => {
          const width = (part.value / total) * 100;
          const rect = (
            <rect key={part.key} x={x} y={0} width={width} height={height} fill={part.colour} />
          );
          x += width;
          return rect;
        })
      )}
    </svg>
  );
}

export function BlockNote({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-xs text-muted-foreground">{children}</p>;
}

export const isPrint = (ctx: RenderContext) => ctx.mode === "print";
