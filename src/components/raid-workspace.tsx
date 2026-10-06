import { useState } from "react";
import { AlertTriangle, CircleDot } from "lucide-react";
import type { Issue, Risk } from "@/data/types";
import {
  BoardWorkspace,
  type BoardColumn,
  type BoardRecordChange,
} from "@/components/board-workspace";
import { issueColumns, issuesToRows, riskColumns, risksToRows } from "@/lib/board-data";
import { useSettings } from "@/services/settings";
import { cn } from "@/lib/utils";

/** With onRiskChange/onIssueChange the registers write to the server; without them they keep browser-local edits. `editable` hides editing for read-only users. */
export function RaidWorkspace({
  risks,
  issues,
  onRiskChange,
  onIssueChange,
  editable = true,
  canDelete = true,
}: {
  risks: Risk[];
  issues: Issue[];
  canDelete?: boolean;
  onRiskChange?: (change: BoardRecordChange) => void;
  onIssueChange?: (change: BoardRecordChange) => void;
  editable?: boolean;
}) {
  const settings = useSettings();
  const size = settings.risk.matrixSize;
  const bandFor = (score: number) =>
    [...settings.risk.bands]
      .sort((a, b) => b.minScore - a.minScore)
      .find((item) => score >= item.minScore);
  const [selected, setSelected] = useState<{ probability: number; impact: number } | null>(null);
  const visible = selected
    ? risks.filter((r) => r.probability === selected.probability && r.impact === selected.impact)
    : risks;
  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[430px_1fr]">
        <div>
          <h2 className="font-display text-xl font-semibold">Risk heat map</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a cell to filter the risk register.
          </p>
          <div
            className="mt-5 grid gap-1"
            style={{ gridTemplateColumns: `34px repeat(${size},minmax(0,1fr))` }}
            aria-label={`${size} by ${size} risk heat map`}
          >
            <div />
            <div
              className="text-center text-[11px] font-semibold text-muted-foreground"
              style={{ gridColumn: `span ${size}` }}
            >
              Impact →
            </div>
            {Array.from({ length: size }, (_, index) => size - index).map((probability) => (
              <div key={probability} className="contents">
                <div
                  className="grid place-items-center text-[10px] font-semibold text-muted-foreground"
                  title={settings.risk.probabilityLabels[probability - 1]}
                >
                  {probability}
                </div>
                {Array.from({ length: size }, (_, index) => index + 1).map((impact) => {
                  const cell = risks.filter(
                    (r) => r.probability === probability && r.impact === impact,
                  );
                  const score = probability * impact;
                  const active =
                    selected?.probability === probability && selected.impact === impact;
                  return (
                    <button
                      key={impact}
                      type="button"
                      onClick={() => setSelected(active ? null : { probability, impact })}
                      aria-label={`${settings.risk.probabilityLabels[probability - 1] ?? probability} probability, ${settings.risk.impactLabels[impact - 1] ?? impact} impact, ${cell.length} risks`}
                      title={`${settings.risk.probabilityLabels[probability - 1] ?? ""} × ${settings.risk.impactLabels[impact - 1] ?? ""} = ${score}`}
                      style={{ background: bandFor(score)?.colour ?? "var(--muted)" }}
                      className={cn(
                        "relative grid aspect-square place-items-center rounded-md border text-sm font-bold text-white",
                        active ? "border-primary ring-2 ring-primary/30" : "border-transparent",
                      )}
                    >
                      <span>{cell.length || ""}</span>
                      {cell.length > 0 && <CircleDot className="absolute right-1 top-1 size-3" />}
                    </button>
                  );
                })}
              </div>
            ))}
            <div />
            {Array.from({ length: size }, (_, index) => index + 1).map((impact) => (
              <div
                key={impact}
                className="truncate text-center text-[10px] font-semibold text-muted-foreground"
                title={settings.risk.impactLabels[impact - 1]}
              >
                {settings.risk.impactLabels[impact - 1] ?? impact}
              </div>
            ))}
          </div>
        </div>
        <div className="self-end rounded-lg border border-border/70 bg-card p-5">
          <div className="flex gap-3">
            <AlertTriangle className="size-5 text-health-warn-foreground" />
            <p className="text-sm">
              {risks.filter((r) => r.score >= settings.risk.appetiteThreshold).length} risks sit at
              or above the risk appetite threshold of {settings.risk.appetiteThreshold}.
            </p>
          </div>
          {selected && (
            <button
              className="mt-4 text-sm font-semibold text-primary"
              onClick={() => setSelected(null)}
            >
              Clear cell filter
            </button>
          )}
        </div>
      </section>
      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Risk register</h2>
        {visible.length || (onRiskChange && editable && !selected) ? (
          <BoardWorkspace
            title="Risks"
            itemLabel="risk"
            storageKey={`risks:${risks
              .map((r) => r.id)
              .slice(0, 3)
              .join()}`}
            rows={risksToRows(visible)}
            columns={editable ? riskColumns : readOnly(riskColumns)}
            groupOptions={["group", "formula", "response"]}
            manage={editable}
            canDelete={canDelete}
            {...(onRiskChange ? { onRecordChange: onRiskChange } : {})}
          />
        ) : (
          <Empty text="No risks in this heat-map cell." />
        )}
      </section>
      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Issues</h2>
        {issues.length || (onIssueChange && editable) ? (
          <BoardWorkspace
            title="Issues"
            itemLabel="issue"
            storageKey={`issues:${
              issues
                .map((r) => r.id)
                .slice(0, 3)
                .join() || risks[0]?.id
            }`}
            rows={issuesToRows(issues)}
            columns={editable ? issueColumns : readOnly(issueColumns)}
            groupOptions={["group", "priority"]}
            manage={editable}
            canDelete={canDelete}
            {...(onIssueChange ? { onRecordChange: onIssueChange } : {})}
          />
        ) : (
          <Empty text="No open issues." />
        )}
      </section>
    </div>
  );
}
/** Board cells are inputs whenever a column is editable, so read-only users get non-editable columns. */
const readOnly = (columns: BoardColumn[]) =>
  columns.map((column) => ({ ...column, editable: false }));
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
