// Phase 4 blocks: lessons_learned (lessons register) and linked_records (record_links).
import { z } from "zod";
import { registerBlock } from "../registry";
import { BlockNote, Table, useReportFormat } from "../primitives";
import type { RenderContext } from "../types";

const cap = (v: string | null | undefined) =>
  v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : "—";

interface Lesson {
  id: string;
  ref: string | null;
  summary: string;
  type: string;
  recommendation: string | null;
  applicability: string | null;
  status: string;
  raised_date: string;
  project_code: string | null;
  category: string | null;
}
const lessonsSchema = z.object({
  all_open: z.boolean().default(false),
  types: z.array(z.enum(["success", "problem"])).default([]),
  limit: z.number().int().min(1).max(50).default(20),
});
function Lessons({
  data,
  config,
}: {
  data: { since: string; rows: Lesson[] };
  config: z.infer<typeof lessonsSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  return (
    <div className="space-y-1">
      <Table
        rows={data.rows}
        rowKey={(r) => r.id}
        caption="Lessons learned"
        empty="No lessons logged in the period."
        cols={[
          {
            key: "l",
            header: "Lesson",
            cell: (r) => (
              <span>
                <span className="text-muted-foreground">{r.ref}</span> {r.summary}
                {r.recommendation && (
                  <span className="block text-xs text-muted-foreground">
                    Recommendation: {r.recommendation}
                  </span>
                )}
              </span>
            ),
          },
          {
            key: "t",
            header: "Type",
            cell: (r) => (r.type === "success" ? "Went well" : "Problem"),
          },
          { key: "a", header: "Applies to", cell: (r) => cap(r.applicability) },
          { key: "p", header: "Project", cell: (r) => r.project_code ?? "—" },
          { key: "d", header: "Raised", cell: (r) => f.date(r.raised_date) },
        ]}
      />
      {!config.all_open && <BlockNote>Raised since {f.date(data.since)}.</BlockNote>}
    </div>
  );
}
export const _lessons_learned = registerBlock({
  key: "lessons_learned",
  version: 1,
  name: "Lessons learned",
  category: "governance",
  description: "Lessons logged on projects in scope this period (from the lessons register).",
  supportedScopes: ["programme", "portfolio", "custom", "project"],
  perEntity: false,
  configSchema: lessonsSchema,
  defaultConfig: { all_open: false, types: [], limit: 20 },
  Renderer: Lessons,
  partnerSafe: true,
  phase: 4,
});

interface Link {
  id: string;
  link_type: string;
  source: string;
  direction: string;
  from_label: string;
  to_label: string;
  to_type: string;
  attributes: Record<string, unknown> | null;
}
const linksSchema = z.object({
  link_types: z
    .array(z.enum(["depends_on", "relates_to", "mitigates", "contributes_to", "maps_to_baf"]))
    .default([]),
  limit: z.number().int().min(1).max(100).default(30),
});
function Links({
  data,
}: {
  data: { rows: Link[] };
  config: z.infer<typeof linksSchema>;
  ctx: RenderContext;
}) {
  return (
    <Table
      rows={data.rows}
      rowKey={(r) => r.id}
      caption="Linked records"
      empty="No linked records."
      group={(r) => cap(r.link_type)}
      cols={[
        { key: "f", header: "From", cell: (r) => r.from_label },
        {
          key: "t",
          header: "To",
          cell: (r) => (
            <span>
              {r.to_label} <span className="text-xs text-muted-foreground">{r.to_type}</span>
            </span>
          ),
        },
        {
          key: "s",
          header: "Source",
          cell: (r) => (r.source === "dependencies" ? "Dependency register" : "Link"),
        },
      ]}
    />
  );
}
export const _linked_records = registerBlock({
  key: "linked_records",
  version: 1,
  name: "Linked records",
  category: "governance",
  description:
    "Records linked to projects in scope, by link type (dependencies, mitigations, BAF links later).",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: linksSchema,
  defaultConfig: { link_types: [], limit: 30 },
  Renderer: Links,
  partnerSafe: true,
  phase: 4,
});
