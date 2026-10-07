import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { changeTone, type MetricUnit, type SummaryMetric, type Tone } from "@/services/overview";

const toneClass: Record<Tone, string> = {
  good: "text-pmo-good",
  bad: "text-pmo-bad-text",
  neutral: "text-pmo-muted",
};

/**
 * The overview's headline figures: label, value and change since last month per cell. Change
 * colour follows the metric's good/bad direction (METRIC_SENSE), never up or down, and is always
 * paired with an arrow and words. Uses the pmo tokens, so it follows whichever theme wraps it
 * (the dark top band on the overview).
 */
export function SummaryStrip({
  metrics,
  className,
}: {
  metrics: SummaryMetric[];
  className?: string;
}) {
  const format = useFormat();
  const show = (value: number, unit: MetricUnit, signed = false) => {
    const sign = signed && value > 0 ? "+" : signed && value < 0 ? "−" : "";
    const abs = signed ? Math.abs(value) : value;
    if (unit === "money") return `${sign}${format.compact(abs)}`;
    if (unit === "percent") return `${sign}${abs.toFixed(1)}%`;
    return `${sign}${format.number(abs, 0)}`;
  };
  return (
    <section
      aria-label="Summary"
      className={cn("flex flex-wrap border-y border-pmo-line font-geist", className)}
    >
      {metrics.map((metric) => {
        const tone = changeTone(metric.key, metric.change);
        const changeUnit = metric.changeUnit ?? (metric.unit === "ratio" ? "count" : metric.unit);
        const value =
          metric.unit === "ratio"
            ? `${metric.value} / ${metric.of ?? 0}`
            : metric.key === "variance"
              ? show(metric.value, "percent", true)
              : show(metric.value, metric.unit);
        const change =
          metric.change === null
            ? null
            : metric.change === 0
              ? "no change m/m"
              : `${metric.change > 0 ? "▲" : "▼"} ${show(Math.abs(metric.change), changeUnit)} m/m`;
        return (
          <div
            key={metric.key}
            className="flex min-w-0 flex-[1_1_150px] flex-col gap-0.5 border-r border-pmo-line px-[18px] py-3 last:border-r-0"
          >
            <span className="text-[11px] uppercase tracking-[0.05em] text-pmo-muted">
              {metric.label}
            </span>
            <span className="pmo-num text-xl font-medium text-pmo-text">{value}</span>
            {change !== null ? (
              <span className={cn("pmo-num text-[11px]", toneClass[tone])}>{change}</span>
            ) : !metric.detail ? (
              <span className="pmo-num text-[11px] text-pmo-muted">no history yet</span>
            ) : null}
            {metric.detail && (
              <span className={cn("pmo-num text-[11px]", toneClass[metric.detail.tone])}>
                {metric.key === "variance"
                  ? `${format.compact(Math.abs(metric.money ?? 0))} ${metric.detail.text}`
                  : metric.detail.text}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}
