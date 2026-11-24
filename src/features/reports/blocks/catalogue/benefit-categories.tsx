// NHS-2: benefits_by_category, planned and realised value per benefit category with
// cash-releasing and non-cash kept apart (never one savings figure). Shaping is in SQL
// (private.rb_benefits_by_category); this only renders. Core: works with any organisation's
// categories, the NHS ones included.
import { z } from "zod";
import { registerBlock } from "../registry";
import { BlockNote, Empty, Stat, Table, useReportFormat } from "../primitives";
import type { RenderContext } from "../types";

type Money = number | string | null;

export interface CategoryRow {
  id: string;
  name: string;
  count: number;
  cash_planned: Money;
  cash_realised: Money;
  non_cash_planned: Money;
  non_cash_realised: Money;
  by_classification: Record<string, number>;
}
export interface BenefitsByCategoryData {
  currency: string;
  benefits: number;
  disbenefits: number;
  cash_planned: Money;
  cash_realised: Money;
  non_cash_planned: Money;
  non_cash_realised: Money;
  category_count: number;
  categories: CategoryRow[];
}

const schema = z.object({ limit: z.number().int().min(1).max(30).default(12) });

function BenefitsByCategory({
  data,
}: {
  data: BenefitsByCategoryData;
  config: z.infer<typeof schema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  if (!data.benefits) return <Empty>No benefits linked to these projects.</Empty>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat
          label="Cash-releasing"
          value={f.money(data.cash_realised)}
          note={`realised of ${f.money(data.cash_planned)} planned`}
        />
        <Stat
          label="Non-cash"
          value={f.money(data.non_cash_realised)}
          note={`realised of ${f.money(data.non_cash_planned)} planned`}
        />
      </div>
      <Table
        caption="Benefits by category, cash-releasing and non-cash"
        rows={data.categories}
        rowKey={(row) => row.id}
        cols={[
          { key: "name", header: "Category", cell: (row) => row.name },
          { key: "count", header: "Benefits", cell: (row) => row.count, align: "right" },
          {
            key: "cash",
            header: "Cash-releasing (realised / planned)",
            align: "right",
            cell: (row) => `${f.money(row.cash_realised)} / ${f.money(row.cash_planned)}`,
          },
          {
            key: "noncash",
            header: "Non-cash (realised / planned)",
            align: "right",
            cell: (row) => `${f.money(row.non_cash_realised)} / ${f.money(row.non_cash_planned)}`,
          },
        ]}
      />
      {data.category_count > data.categories.length && (
        <BlockNote>and {data.category_count - data.categories.length} more categories</BlockNote>
      )}
      <BlockNote>
        Cash-releasing and non-cash value are shown separately and never added together.
        {data.disbenefits > 0 &&
          ` ${data.disbenefits} disbenefit${data.disbenefits === 1 ? "" : "s"} not included.`}
      </BlockNote>
    </div>
  );
}

export const _benefits_by_category = registerBlock({
  key: "benefits_by_category",
  version: 1,
  name: "Benefits by category",
  category: "benefits",
  description:
    "Planned and realised value per benefit category, with cash-releasing and non-cash value kept apart.",
  supportedScopes: ["project", "programme", "portfolio", "custom", "collection"],
  perEntity: false,
  configSchema: schema,
  defaultConfig: { limit: 12 },
  Renderer: BenefitsByCategory,
  partnerSafe: true,
  phase: 4,
});
