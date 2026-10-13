import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Sticky footer: live dot, when the data last changed (not when the page loaded), the
 * financial month status and the active project count.
 */
export function StatusBar({
  asOf,
  closedMonth,
  openMonth,
  activeProjects,
  live = true,
  scope = "portfolio",
  className,
}: {
  asOf: string | null;
  closedMonth: string | null;
  openMonth: string;
  /** Portfolio only; the project status bar has no project count. */
  activeProjects?: number;
  live?: boolean;
  /** project: "Data last changed …" and "Financials closed to September, October open". */
  scope?: "portfolio" | "project";
  className?: string;
}) {
  const format = useFormat();
  const time = asOf?.includes("T")
    ? new Date(asOf).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <footer
      aria-label="Data status"
      className={cn(
        "flex flex-wrap items-center gap-x-[18px] gap-y-1.5 border-t border-pmo-line bg-pmo-panel px-5 py-1.5 font-geist-mono text-[11px] text-pmo-muted",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn("size-[7px] rounded-full", live ? "bg-pmo-good" : "bg-pmo-muted")}
        />
        {live ? "Live" : "Offline"}
      </span>
      <span>
        {asOf
          ? `${scope === "project" ? "Data last changed" : "Data as of"} ${format.date(asOf)}${time ? ` ${time}` : ""}`
          : "No data yet"}
      </span>
      {scope === "project" ? (
        <span>
          {closedMonth
            ? `Financials closed to ${closedMonth}, ${openMonth} open`
            : `No financial month closed yet, ${openMonth} open`}
        </span>
      ) : (
        <span>
          {closedMonth ? `${closedMonth} closed · ${openMonth} open` : `${openMonth} open`}
        </span>
      )}
      {activeProjects !== undefined && (
        <span>
          {activeProjects} active {activeProjects === 1 ? "project" : "projects"}
        </span>
      )}
    </footer>
  );
}
