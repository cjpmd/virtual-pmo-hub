// NHS-1 board assurance blocks (docs/nhs-module-plan.md § NHS-1 item 4): baf_summary (heat map
// and register of open strategic risks), baf_above_appetite and baf_linkage (programme and
// project risks behind each strategic risk). Shaping is in SQL (private.rb_baf_*, migration
// 20261122190000_nhs_1b_assurance_blocks); these only render. Owned by the 'assurance' module
// (lib/modules.ts reportBlocks) and partner-unsafe (private.partner_unsafe_blocks).
// Every colour has its words beside it: score and band, trend in words, assurance label.
import { z } from "zod";
import { registerBlock } from "../registry";
import { BlockNote, Empty, Stat, Table, useReportFormat } from "../primitives";
import type { RenderContext, ScopeLevel } from "../types";
import { Heatmap, type HeatData } from "./phase2";

const SCOPES: ScopeLevel[] = ["project", "programme", "portfolio", "custom", "collection"];

export type BafTrend = "up" | "down" | "same" | "new";
/** Higher scores are worse, so a rising score is worsening. */
export const TREND_TEXT: Record<BafTrend, string> = {
  up: "↑ Worsening",
  down: "↓ Improving",
  same: "→ No change",
  new: "New",
};
export const trendText = (trend: string | null | undefined) =>
  TREND_TEXT[(trend ?? "new") as BafTrend] ?? "—";

function Score({
  score,
  band,
  colour,
}: {
  score: number | null;
  band: string | null;
  colour: string | null;
}) {
  if (score === null || score === undefined)
    return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className="inline-block size-2.5 rounded-full"
        style={{ backgroundColor: colour ?? "#9ca3af" }}
      />
      <span className="font-semibold pmo-num">{score}</span>
      {band && <span className="text-muted-foreground">{band}</span>}
    </span>
  );
}

function Assurance({ label, colour }: { label: string | null; colour?: string | null }) {
  if (!label) return <span className="text-muted-foreground">Not rated</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block size-2.5 rounded-full"
        style={{ backgroundColor: colour ?? "#9ca3af" }}
      />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------- baf_summary
export interface BafRow {
  id: string;
  ref: string;
  title: string;
  lead: string | null;
  forum: string | null;
  current_score: number | null;
  band: string | null;
  band_colour: string | null;
  target_score: number | null;
  appetite_score: number | null;
  above_appetite: boolean;
  trend: string;
  assurance: string | null;
  assurance_colour: string | null;
  review_date: string | null;
  review_overdue: boolean;
  is_sample?: boolean;
}
export interface BafSummaryData extends HeatData {
  on_other_matrix: number;
  counts: {
    above_appetite: number;
    review_overdue: number;
    low_assurance: number;
    no_rating: number;
    overdue_actions: number;
  };
  rows: BafRow[];
}

const summarySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  show_heatmap: z.boolean().default(true),
});
function BafSummary({
  data,
  config,
  ctx,
}: {
  data: BafSummaryData;
  config: z.infer<typeof summarySchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  if (!data.total) return <Empty>No open strategic risks on the Board Assurance Framework.</Empty>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Open strategic risks" value={data.total} />
        <Stat
          label="Above appetite"
          value={data.counts.above_appetite}
          tone={data.counts.above_appetite ? "bad" : "good"}
        />
        <Stat
          label="Limited or no assurance"
          value={data.counts.low_assurance}
          tone={data.counts.low_assurance ? "warn" : "good"}
          note={data.counts.no_rating ? `${data.counts.no_rating} not rated` : undefined}
        />
        <Stat
          label="Reviews overdue"
          value={data.counts.review_overdue}
          tone={data.counts.review_overdue ? "warn" : "good"}
          note={
            data.counts.overdue_actions
              ? `${data.counts.overdue_actions} ${data.counts.overdue_actions === 1 ? "action" : "actions"} overdue`
              : undefined
          }
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        {config.show_heatmap && (
          <section aria-label="Strategic risk heat map" className="space-y-1">
            <Heatmap data={data} config={{}} ctx={ctx} />
            {data.on_other_matrix > 0 && (
              <BlockNote>
                {data.on_other_matrix} scored on another matrix, listed but not plotted.
              </BlockNote>
            )}
          </section>
        )}
        <Table
          rows={data.rows}
          rowKey={(r) => r.id}
          caption="Board Assurance Framework"
          cols={[
            {
              key: "r",
              header: "Risk",
              cell: (r) => (
                <span>
                  <span className="text-muted-foreground">{r.ref}</span> {r.title}
                  {r.lead && <span className="block text-xs text-muted-foreground">{r.lead}</span>}
                </span>
              ),
            },
            {
              key: "s",
              header: "Current",
              cell: (r) => <Score score={r.current_score} band={r.band} colour={r.band_colour} />,
            },
            {
              key: "t",
              header: "Target",
              align: "right",
              cell: (r) => r.target_score ?? "—",
            },
            {
              key: "a",
              header: "Appetite",
              cell: (r) =>
                r.appetite_score === null ? (
                  "—"
                ) : (
                  <span
                    className={r.above_appetite ? "font-semibold text-health-bad-foreground" : ""}
                  >
                    {r.appetite_score}
                    {r.above_appetite ? " (above)" : ""}
                  </span>
                ),
            },
            { key: "tr", header: "Trend", cell: (r) => trendText(r.trend) },
            {
              key: "as",
              header: "Assurance",
              cell: (r) => <Assurance label={r.assurance} colour={r.assurance_colour} />,
            },
            {
              key: "rv",
              header: "Review",
              cell: (r) =>
                r.review_date ? (
                  <span className={r.review_overdue ? "text-health-warn-foreground" : ""}>
                    {f.date(r.review_date)}
                    {r.review_overdue ? " (overdue)" : ""}
                  </span>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </div>
      {data.total > data.rows.length && (
        <BlockNote>and {data.total - data.rows.length} more</BlockNote>
      )}
    </div>
  );
}
export const _baf_summary = registerBlock({
  key: "baf_summary",
  version: 1,
  name: "Board Assurance Framework",
  category: "assurance",
  description:
    "Heat map and register of open strategic risks: current and target score, appetite, trend, assurance and review date.",
  supportedScopes: SCOPES,
  perEntity: false,
  configSchema: summarySchema,
  defaultConfig: { limit: 20, show_heatmap: true },
  Renderer: BafSummary,
  partnerSafe: false,
  phase: 4,
});

// ---------------------------------------------------------------- baf_above_appetite
export interface AboveAppetiteRow {
  id: string;
  ref: string;
  title: string;
  lead: string | null;
  current_score: number;
  band: string | null;
  band_colour: string | null;
  appetite: string | null;
  appetite_score: number;
  gap: number;
  target_score: number | null;
  trend: string;
  assurance: string | null;
  gaps_in_control: string | null;
  gaps_in_assurance: string | null;
  open_actions: number;
  overdue_actions: number;
}
export interface AboveAppetiteData {
  total_open: number;
  count: number;
  no_appetite: number;
  rows: AboveAppetiteRow[];
}

const appetiteSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
  show_gaps: z.boolean().default(true),
});
function AboveAppetite({
  data,
}: {
  data: AboveAppetiteData;
  config: z.infer<typeof appetiteSchema>;
  ctx: RenderContext;
}) {
  const note =
    data.no_appetite > 0 ? (
      <BlockNote>
        {data.no_appetite} of {data.total_open} open strategic{" "}
        {data.total_open === 1 ? "risk has" : "risks have"} no tolerated score set.
      </BlockNote>
    ) : null;
  if (!data.count)
    return (
      <div>
        <Empty>No strategic risk is above its appetite.</Empty>
        {note}
      </div>
    );
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {data.rows.map((r) => (
          <li key={r.id} className="report-avoid-break rounded-md border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">
                <span className="text-muted-foreground">{r.ref}</span> {r.title}
              </h4>
              <span className="text-xs text-muted-foreground">{r.lead ?? "No executive lead"}</span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
              <div>
                <dt className="text-muted-foreground">Current</dt>
                <dd>
                  <Score score={r.current_score} band={r.band} colour={r.band_colour} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Appetite</dt>
                <dd>
                  {r.appetite_score}
                  {r.appetite ? ` (${r.appetite})` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Above by</dt>
                <dd className="font-semibold text-health-bad-foreground">{r.gap}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Trend</dt>
                <dd>{trendText(r.trend)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Actions</dt>
                <dd>
                  {r.open_actions} open
                  {r.overdue_actions ? `, ${r.overdue_actions} overdue` : ""}
                </dd>
              </div>
            </dl>
            {(r.gaps_in_control || r.gaps_in_assurance) && (
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                {r.gaps_in_control && (
                  <p>
                    <span className="font-medium">Gaps in control: </span>
                    {r.gaps_in_control}
                  </p>
                )}
                {r.gaps_in_assurance && (
                  <p>
                    <span className="font-medium">Gaps in assurance: </span>
                    {r.gaps_in_assurance}
                  </p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {data.count > data.rows.length && (
        <BlockNote>and {data.count - data.rows.length} more above appetite</BlockNote>
      )}
      {note}
    </div>
  );
}
export const _baf_above_appetite = registerBlock({
  key: "baf_above_appetite",
  version: 1,
  name: "Strategic risks above appetite",
  category: "assurance",
  description:
    "Open strategic risks scored above their tolerated level, largest gap first, with gaps in control and assurance and their actions.",
  supportedScopes: SCOPES,
  perEntity: false,
  configSchema: appetiteSchema,
  defaultConfig: { limit: 10, show_gaps: true },
  Renderer: AboveAppetite,
  partnerSafe: false,
  phase: 4,
});

// ---------------------------------------------------------------- baf_linkage
export interface LinkedRisk {
  id: string;
  ref: string;
  title: string;
  status: string;
  score: number | null;
  band: string | null;
  band_colour: string | null;
  project_code: string | null;
  project_name: string | null;
  programme_name: string | null;
}
export interface LinkageData {
  in_scope_only: boolean;
  linked_total: number;
  groups: Array<{
    id: string;
    ref: string;
    title: string;
    current_score: number | null;
    band: string | null;
    band_colour: string | null;
    above_appetite: boolean;
    assurance: string | null;
    count: number;
    open_count: number;
    risks: LinkedRisk[];
  }>;
  unlinked: Array<{ id: string; ref: string; title: string }>;
}

/** Where a linked risk sits: "CMR Case management" or the programme's name. */
export const riskWhere = (risk: LinkedRisk) =>
  risk.project_code
    ? `${risk.project_code} ${risk.project_name ?? ""}`.trim()
    : (risk.programme_name ?? "—");

const linkageSchema = z.object({
  in_scope_only: z.boolean().default(true),
  limit: z.number().int().min(1).max(50).default(8),
});
function Linkage({
  data,
}: {
  data: LinkageData;
  config: z.infer<typeof linkageSchema>;
  ctx: RenderContext;
}) {
  return (
    <div className="space-y-3">
      {data.groups.length ? (
        data.groups.map((g) => (
          <section
            key={g.id}
            className="report-avoid-break space-y-1"
            aria-label={`${g.ref} ${g.title}`}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <h4 className="text-sm font-semibold">
                <span className="text-muted-foreground">{g.ref}</span> {g.title}
              </h4>
              <Score score={g.current_score} band={g.band} colour={g.band_colour} />
              {g.above_appetite && (
                <span className="text-xs font-medium text-health-bad-foreground">
                  Above appetite
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {g.open_count} open of {g.count} linked
              </span>
            </div>
            <Table
              rows={g.risks}
              rowKey={(r) => r.id}
              caption={`Risks contributing to ${g.ref}`}
              cols={[
                {
                  key: "r",
                  header: "Risk",
                  cell: (r) => (
                    <span>
                      <span className="text-muted-foreground">{r.ref}</span> {r.title}
                      {r.status !== "open" && (
                        <span className="text-xs text-muted-foreground"> ({r.status})</span>
                      )}
                    </span>
                  ),
                },
                { key: "w", header: "Project or programme", cell: (r) => riskWhere(r) },
                {
                  key: "s",
                  header: "Score",
                  cell: (r) => <Score score={r.score} band={r.band} colour={r.band_colour} />,
                },
              ]}
            />
            {g.count > g.risks.length && <BlockNote>and {g.count - g.risks.length} more</BlockNote>}
          </section>
        ))
      ) : (
        <Empty>
          {data.in_scope_only
            ? "No risks in this report's scope are linked to a strategic risk."
            : "No risks are linked to a strategic risk."}
        </Empty>
      )}
      {data.unlinked.length > 0 && (
        <BlockNote>
          No {data.in_scope_only ? "linked risks in scope" : "linked risks"} for:{" "}
          {data.unlinked.map((u) => u.ref).join(", ")}.
        </BlockNote>
      )}
    </div>
  );
}
export const _baf_linkage = registerBlock({
  key: "baf_linkage",
  version: 1,
  name: "Programme risks behind the BAF",
  category: "assurance",
  description:
    "Each strategic risk with the programme and project risks linked to it, from the report's scope or the whole organisation.",
  supportedScopes: SCOPES,
  perEntity: false,
  configSchema: linkageSchema,
  defaultConfig: { in_scope_only: true, limit: 8 },
  Renderer: Linkage,
  partnerSafe: false,
  phase: 4,
});
