// NHS-4 plan item 10: on a benefit's page, the efficiency schemes linked to it, with this year's
// planned, forecast and actual savings. The rule against double counting: a scheme's savings are
// counted once, in the efficiency programme (its dashboard, targets and report blocks). They are
// shown here for context and never added to the benefit's measured realisation, which stays what
// its measures record; no screen or report adds the two together. Shown only while the
// 'efficiency' module is on.
import { Link } from "@tanstack/react-router";
import { STAGE_LABELS, financialYearLabel } from "@/data/efficiency";
import { useEfficiencySchemes } from "@/hooks/use-efficiency";
import { useFormat } from "@/lib/format";
import { useModule, useModuleTerm } from "@/lib/modules";
import type { EfficiencyScheme } from "@/services/efficiency";

export function BenefitSchemesPanel({ benefitId }: { benefitId: string }) {
  const enabled = useModule("efficiency");
  const term = useModuleTerm();
  const fmt = useFormat();
  const schemes = useEfficiencySchemes();
  if (!enabled) return null;
  const linked = (schemes.data ?? []).filter((s: EfficiencyScheme) => s.benefitId === benefitId);
  if (!linked.length) return null;
  const startMonth = fmt.settings.regional.financialYearStartMonth || 4;
  const year = linked[0]!.financialYear;
  return (
    <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
      <h2 className="font-display text-lg font-semibold">
        {term("efficiency.schemePlural")} delivering this benefit
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Savings for {financialYearLabel(year, startMonth)}. They are counted in the{" "}
        {term("efficiency.programme").toLowerCase()}, not added to this benefit's realisation, so
        nothing is counted twice.
      </p>
      <div className="mt-4 overflow-x-auto rounded-md border">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="h-9 px-3 font-semibold">
                {term("efficiency.scheme")}
              </th>
              <th scope="col" className="px-3 font-semibold">
                Stage
              </th>
              <th scope="col" className="px-3 text-right font-semibold">
                Planned
              </th>
              <th scope="col" className="px-3 text-right font-semibold">
                Forecast
              </th>
              <th scope="col" className="px-3 text-right font-semibold">
                Actual
              </th>
            </tr>
          </thead>
          <tbody>
            {linked.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-3 py-2">
                  <Link
                    to="/portfolio/efficiency/$schemeId"
                    params={{ schemeId: s.id }}
                    className="font-medium hover:underline"
                  >
                    {s.ref} · {s.title}
                  </Link>
                </td>
                <td className="px-3 py-2">{STAGE_LABELS[s.stage]}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt.compact(s.planInYear)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmt.compact(s.forecastInYear)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt.compact(s.actualInYear)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
