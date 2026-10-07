import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Health } from "@/data/types";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WatchGroup, WatchSort } from "@/services/overview-panels";

const SORTS: Array<{ value: WatchSort; label: string }> = [
  { value: "overspend", label: "Biggest overspend" },
  { value: "movers", label: "Biggest movers" },
  { value: "gap", label: "Report vs data" },
];

const tone: Record<Health, string> = {
  "On Track": "var(--pmo-good)",
  "At Risk": "var(--pmo-warn)",
  "Off Track": "var(--pmo-bad)",
  "Not Set": "var(--pmo-muted)",
};

/** Report = ring, data = dot: status is shape plus colour, never colour alone. */
function ReportData({ declared, evidenced }: { declared: Health; evidenced: Health }) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={`Report: ${declared} · Data: ${evidenced}`}
    >
      <span
        aria-hidden
        className="size-3 rounded-full border-2"
        style={{ borderColor: tone[declared] }}
      />
      <span aria-hidden className="size-2 rounded-full" style={{ background: tone[evidenced] }} />
      <span className="sr-only">
        Report {declared}, data {evidenced}
      </span>
    </span>
  );
}

function Trend({ points }: { points: Array<number | null> }) {
  const values = points.filter((v): v is number => v !== null);
  if (values.length < 2) return <span className="text-[11px] text-pmo-muted">—</span>;
  const min = Math.min(...values, 0),
    max = Math.max(...values, 0),
    span = max - min || 1;
  const coords = points
    .map((v, i) => (v === null ? null : `${2 + i * 11},${16 - ((v - min) / span) * 14}`))
    .filter(Boolean)
    .join(" ");
  const first = values[0] as number,
    last = values[values.length - 1] as number;
  // Variance rising = overspend growing = bad.
  const stroke =
    last > first ? "var(--pmo-bad)" : last < first ? "var(--pmo-good)" : "var(--pmo-muted)";
  return (
    <svg width="60" height="18" viewBox="0 0 60 18" aria-hidden>
      <polyline points={coords} fill="none" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

export function ProjectWatchlist({
  groups,
  sort,
  onSortChange,
}: {
  groups: WatchGroup[];
  sort: WatchSort;
  onSortChange: (sort: WatchSort) => void;
}) {
  const format = useFormat();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const signed = (value: number) =>
    `${value > 0 ? "+" : value < 0 ? "−" : ""}${format.compact(Math.abs(value))}`;
  const moneyTone = (value: number) =>
    value > 0 ? "text-pmo-bad-text" : value < 0 ? "text-pmo-good" : "text-pmo-muted";
  return (
    <section
      aria-label="Projects"
      className="flex min-w-0 flex-col rounded-xl border border-pmo-line bg-pmo-panel font-geist"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-pmo-line px-4 py-3.5">
        <h2 className="text-[15px] font-semibold text-pmo-text">Projects by programme</h2>
        <div
          role="tablist"
          aria-label="Sort"
          className="flex flex-wrap gap-0.5 rounded-lg bg-pmo-track p-[3px] text-xs"
        >
          {SORTS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={sort === item.value}
              onClick={() => onSortChange(item.value)}
              className={cn(
                "min-h-7 rounded-md px-2.5",
                sort === item.value ? "bg-pmo-panel font-semibold text-pmo-text" : "text-pmo-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.05em] text-pmo-muted">
              <th scope="col" className="px-4 py-2 font-medium">
                Project
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Report · data
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium" title="Open risks · open issues">
                Risks · issues
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium" title="Open change requests">
                Changes
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium" title="Average task completion">
                % done
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                vs budget
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Change this month
              </th>
              <th scope="col" className="hidden px-4 py-2 font-medium sm:table-cell">
                6 months
              </th>
            </tr>
          </thead>
          {groups.map((group) => {
            const key = group.id ?? "none";
            const open = !collapsed.has(key);
            return (
              <tbody key={key}>
                <tr className="border-t border-pmo-line bg-pmo-panel-2/60">
                  <th scope="rowgroup" colSpan={2} className="px-4 py-2 text-left">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })
                      }
                      className="inline-flex items-center gap-1.5 font-semibold text-pmo-text"
                    >
                      {open ? (
                        <ChevronDown className="size-3.5" aria-hidden />
                      ) : (
                        <ChevronRight className="size-3.5" aria-hidden />
                      )}
                      {group.name}
                      <span className="font-normal text-pmo-muted">
                        ·{" "}
                        <span className="font-geist-mono tabular-nums">
                          {group.onTrack}/{group.total}
                        </span>{" "}
                        on track
                      </span>
                    </button>
                  </th>
                  <td
                    className={cn(
                      "px-2 py-2 text-right font-geist-mono tabular-nums",
                      moneyTone(group.variance),
                    )}
                  >
                    {signed(group.variance)}
                  </td>
                  <td colSpan={3} />
                </tr>
                {open &&
                  group.rows.map((row) => (
                    <tr
                      key={row.id}
                      tabIndex={0}
                      onClick={() =>
                        navigate({
                          to: "/portfolio/projects/$projectCode",
                          params: { projectCode: row.code },
                        })
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter")
                          navigate({
                            to: "/portfolio/projects/$projectCode",
                            params: { projectCode: row.code },
                          });
                      }}
                      className="cursor-pointer border-t border-pmo-line outline-none hover:bg-pmo-panel-2/40 focus-visible:bg-pmo-panel-2/60"
                    >
                      <td className="max-w-0 truncate px-4 py-2 pl-9 text-pmo-text">{row.name}</td>
                      <td className="px-2 py-2">
                        <ReportData declared={row.declared} evidenced={row.evidenced} />
                      </td>
                      <td className="px-2 py-2 text-right font-geist-mono tabular-nums">
                        <span className={cn(row.risks > 0 && "text-pmo-bad-text")}>{row.risks}</span>
                        {" · "}
                        <span className={cn(row.issues > 0 && "text-pmo-bad-text")}>{row.issues}</span>
                        <span className="sr-only"> open risks · {row.issues} open issues</span>
                      </td>
                      <td className="px-2 py-2 text-right font-geist-mono tabular-nums">
                        <span className={row.changes > 0 ? "text-pmo-text" : "text-pmo-muted"}>
                          {row.changes}
                        </span>
                        <span className="sr-only"> open changes</span>
                      </td>
                      <td className="px-2 py-2 text-right font-geist-mono tabular-nums">
                        {row.completion === null ? (
                          <span className="text-pmo-muted">—</span>
                        ) : (
                          <>
                            <span className="text-pmo-text">{row.completion}%</span>
                            <span className="sr-only"> tasks complete</span>
                          </>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right font-geist-mono tabular-nums",
                          moneyTone(row.variance),
                        )}
                      >
                        {signed(row.variance)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 text-right font-geist-mono tabular-nums",
                          row.change === null ? "text-pmo-muted" : moneyTone(row.change),
                        )}
                      >
                        {row.change === null ? "—" : signed(row.change)}
                      </td>
                      <td className="hidden px-4 py-2 sm:table-cell">
                        <Trend points={row.trend} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            );
          })}
        </table>
        {!groups.length && (
          <p className="px-4 py-6 text-sm text-pmo-muted">No active projects in this selection.</p>
        )}
      </div>
      <p className="border-t border-pmo-line px-4 py-2 text-[11px] text-pmo-muted">
        Ring = latest status report · dot = what the data shows
      </p>
    </section>
  );
}
