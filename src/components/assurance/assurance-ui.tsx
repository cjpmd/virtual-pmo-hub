// Small shared pieces of the board assurance screens: the score chip (number, band colour and
// band name, so colour is never the only signal) and the trend mark (arrow plus words).
import { ArrowDown, ArrowRight, ArrowUp, Sparkle } from "lucide-react";
import { trendText, type Trend } from "@/services/strategic-risks";

export function ScoreChip({
  score,
  band,
}: {
  score: number | null;
  band: { label: string; colour: string | null } | null;
}) {
  if (score === null) return <span>—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className="inline-flex min-w-7 justify-center rounded px-1.5 py-0.5 font-semibold text-white"
        style={{ background: band?.colour ?? "#6b7280" }}
      >
        {score}
      </span>
      {band?.label}
    </span>
  );
}

export function TrendMark({ trend, previous }: { trend: Trend; previous: number | null }) {
  const Icon =
    trend === "up"
      ? ArrowUp
      : trend === "down"
        ? ArrowDown
        : trend === "same"
          ? ArrowRight
          : Sparkle;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Icon className="size-3.5" aria-hidden />
      {trendText(trend, previous)}
    </span>
  );
}
