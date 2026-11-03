// Phase 3 blocks: changes_since_last (diff vs the previous published pack) and raid_movement.
import { z } from "zod";
import { registerBlock } from "../registry";
import { BlockNote, Empty, Table, levelFor, useReportFormat } from "../primitives";
import type { RenderContext } from "../types";
import { diffProjects, type Change, type ChangesData } from "../../engine/diff";

const ICON: Record<Change["kind"], string> = {
  rating_worse: "▼",
  rating_better: "▲",
  declared_changed: "•",
  entered_exceptions: "+",
  left_exceptions: "−",
  slip_increased: "▼",
  slip_reduced: "▲",
  budget_moved: "£",
  top_band_risks_up: "▼",
  top_band_risks_down: "▲",
  new_project: "+",
};
const BAD = new Set<Change["kind"]>([
  "rating_worse",
  "entered_exceptions",
  "slip_increased",
  "top_band_risks_up",
]);

const changesSchema = z.object({
  slip_days: z.number().int().min(0).max(90).default(7),
  budget_amount: z.number().min(0).default(0),
});

function Changes({
  data,
  config,
  ctx,
}: {
  data: ChangesData;
  config: z.infer<typeof changesSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  if (!data.previous) return <Empty>No previous published pack to compare with.</Empty>;
  const changes = diffProjects(
    data,
    { slipDays: config.slip_days, budgetAmount: config.budget_amount },
    (r) => levelFor(ctx.scheme, r)?.label ?? r ?? "not set",
    (n) => f.money(n),
  );
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Compared with “{data.previous.title}” (as at {f.date(data.previous.as_at)}).
        {data.decisions_made !== undefined && ` ${data.decisions_made} decisions made`}
        {data.actions_closed !== undefined && `, ${data.actions_closed} actions closed`}
        {data.actions_overdue !== undefined && `, ${data.actions_overdue} overdue`}.
      </p>
      <Table
        rows={changes}
        rowKey={(c) => `${c.projectId}-${c.kind}`}
        caption="Changes since the last pack"
        empty="Nothing material has changed since the last pack."
        cols={[
          { key: "p", header: "Project", cell: (c) => `${c.code} ${c.name}` },
          {
            key: "c",
            header: "Change",
            cell: (c) => (
              <span
                className={
                  BAD.has(c.kind)
                    ? "text-health-bad-foreground"
                    : c.kind === "budget_moved" || c.kind === "declared_changed"
                      ? ""
                      : "text-health-good-foreground"
                }
              >
                <span aria-hidden className="mr-1">
                  {ICON[c.kind]}
                </span>
                {c.text}
              </span>
            ),
          },
        ]}
      />
      <BlockNote>Slip changes under {config.slip_days} days are left out.</BlockNote>
    </div>
  );
}

registerBlock({
  key: "changes_since_last",
  version: 1,
  name: "Changes since last pack",
  category: "status",
  description:
    "Rating moves, projects entering or leaving the exceptions, slips, budget movement, new top-band risks.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: changesSchema,
  defaultConfig: { slip_days: 7, budget_amount: 0 },
  exposedMetrics: ["rating_worsened"],
  Renderer: Changes,
  partnerSafe: true,
  phase: 3,
});

interface MoveItem {
  kind: string;
  ref: string | null;
  title: string;
  project_code: string;
  score?: number;
  band?: string;
  severity?: string;
  from?: number;
  to?: number;
  from_band?: string;
  to_band?: string;
}
function RaidMovement({
  data,
}: {
  data: {
    since: string;
    has_previous: boolean;
    new: MoveItem[];
    closed: MoveItem[];
    rescored: MoveItem[];
  };
  config: Record<string, never>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  const cols = [
    {
      key: "t",
      header: "Item",
      cell: (r: MoveItem) => (
        <span>
          <span className="text-muted-foreground">{r.ref}</span> {r.title}{" "}
          <span className="text-xs text-muted-foreground">{r.project_code}</span>
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Since {f.date(data.since.slice(0, 10))}
        {data.has_previous ? " (the last pack)" : ""}.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            New ({data.new.length})
          </h4>
          <Table
            rows={data.new}
            rowKey={(r) => `${r.kind}${r.ref}`}
            empty="None."
            cols={[
              ...cols,
              { key: "r", header: "Rating", cell: (r) => r.band ?? r.severity ?? "—" },
            ]}
          />
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Closed ({data.closed.length})
          </h4>
          <Table rows={data.closed} rowKey={(r) => `${r.kind}${r.ref}`} empty="None." cols={cols} />
        </div>
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
            Re-scored ({data.rescored.length})
          </h4>
          <Table
            rows={data.rescored}
            rowKey={(r) => `${r.ref}`}
            empty={data.has_previous ? "None." : "Needs a previous pack."}
            cols={[
              ...cols,
              {
                key: "s",
                header: "Score",
                cell: (r) => `${r.from} → ${r.to}${r.to_band ? ` (${r.to_band})` : ""}`,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

registerBlock({
  key: "raid_movement",
  version: 1,
  name: "RAID movement",
  category: "raid",
  description: "Risks and issues new, closed or re-scored since the last pack.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: z.object({}).passthrough() as unknown as z.ZodType<
    Record<string, never>,
    z.ZodTypeDef,
    unknown
  >,
  defaultConfig: {},
  Renderer: RaidMovement,
  partnerSafe: true,
  phase: 3,
});
