// project_overview: composite deep-dive block that renders one project's full status panel
// using the existing Phase 1 block renderers. Data comes from private.rb_project_overview,
// which calls rb_project_summary, rb_overall_status, rb_health_by_dimension,
// rb_milestone_slippage, rb_top_raid and rb_highlight_report_summary in one SQL call.
import type { ReactNode } from "react";
import { z } from "zod";
import { registerBlock, getBlock, resolveConfig } from "../registry";
import { Empty } from "../primitives";
import type { BlockInstance, RenderContext } from "../types";

interface ProjectOverviewData {
  summary: unknown;
  health: unknown;
  history: unknown;
  milestones: unknown;
  raid: unknown;
  highlight: unknown;
}

const overviewSchema = z.object({
  milestones_limit: z.number().int().min(1).max(20).default(6),
  raid_limit: z.number().int().min(1).max(20).default(5),
});

function Sub({ blockKey, datum, ctx }: { blockKey: string; datum: unknown; ctx: RenderContext }) {
  const def = getBlock(blockKey);
  if (!def) return null;
  const subInstance: BlockInstance = {
    id: `${ctx.instance.id}-${blockKey}`,
    blockKey,
    blockVersion: 1,
    config: ctx.instance.config,
    placement: "deep_dive",
  };
  const subCtx: RenderContext = { ...ctx, instance: subInstance };
  const Renderer = (ctx.mode === "print" && def.PrintRenderer) || def.Renderer;
  return <Renderer data={datum} config={resolveConfig(def, subInstance)} ctx={subCtx} />;
}

function ProjectOverview({
  data,
  ctx,
}: {
  data: ProjectOverviewData | null;
  config: z.infer<typeof overviewSchema>;
  ctx: RenderContext;
}) {
  if (!data) return <Empty>No project data for this overview.</Empty>;
  const section = (title: string, content: ReactNode) => (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {content}
    </div>
  );
  return (
    <div className="space-y-4">
      <Sub blockKey="project_summary" datum={data.summary} ctx={ctx} />
      <div className="grid gap-4 md:grid-cols-2">
        {section("Status", <Sub blockKey="overall_status" datum={data.health} ctx={ctx} />)}
        {section(
          "Health by dimension",
          <Sub blockKey="health_by_dimension" datum={data.history} ctx={ctx} />,
        )}
      </div>
      {section(
        "Milestones",
        <Sub blockKey="milestone_slippage" datum={data.milestones} ctx={ctx} />,
      )}
      {section("Top risks and issues", <Sub blockKey="top_raid" datum={data.raid} ctx={ctx} />)}
      {section(
        "Last highlight report",
        <Sub blockKey="highlight_report_summary" datum={data.highlight} ctx={ctx} />,
      )}
    </div>
  );
}

export const _project_overview = registerBlock<
  z.infer<typeof overviewSchema>,
  ProjectOverviewData | null
>({
  key: "project_overview",
  version: 1,
  name: "Project overview",
  category: "status",
  description:
    "Full project panel: summary, status, health history, milestones, top risks and last highlight report.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: overviewSchema,
  defaultConfig: { milestones_limit: 6, raid_limit: 5 },
  Renderer: ProjectOverview,
  partnerSafe: true,
  phase: 2,
});
