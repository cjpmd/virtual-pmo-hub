import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProgrammeCardData } from "@/services/overview-panels";

/** Six-month % green sparkline. Colour follows good/bad: rising green is good. */
function Spark({ points }: { points: Array<number | null> }) {
  const values = points.filter((v): v is number => v !== null);
  if (values.length < 2) return <span className="text-[11px] text-pmo-muted">No trend yet</span>;
  const first = values[0] as number,
    last = values[values.length - 1] as number;
  const tone =
    last > first ? "var(--pmo-good)" : last < first ? "var(--pmo-bad)" : "var(--pmo-muted)";
  const coords = points
    .map((v, i) => (v === null ? null : `${2 + i * 12},${18 - (v / 100) * 16}`))
    .filter(Boolean)
    .join(" ");
  return (
    <svg
      width="64"
      height="20"
      viewBox="0 0 64 20"
      role="img"
      aria-label={`% green over six months: ${values.join(", ")}`}
    >
      <polyline points={coords} fill="none" stroke={tone} strokeWidth="1.5" />
    </svg>
  );
}

export function ProgrammeCard({
  card,
  selected,
  onSelect,
}: {
  card: ProgrammeCardData;
  selected: boolean;
  onSelect: () => void;
}) {
  const format = useFormat();
  const over = card.variance > 0;
  const { green, amber, red, unset } = card.rag;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-[10px] border bg-pmo-panel px-3.5 py-3 text-left font-geist transition-colors",
        selected
          ? "border-pmo-accent ring-1 ring-pmo-accent"
          : "border-pmo-line hover:border-pmo-muted",
      )}
    >
      <span className="truncate text-sm font-semibold text-pmo-text">{card.name}</span>
      <div className="flex items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span
            className={cn(
              "font-geist-mono text-[15px] tabular-nums",
              over ? "text-pmo-bad-text" : "text-pmo-good",
            )}
          >
            {over ? "+" : card.variance < 0 ? "−" : ""}
            {format.compact(Math.abs(card.variance))}
            <span className="sr-only">
              {over ? " forecast over budget" : " forecast under budget"}
            </span>
          </span>
          <span className="text-[11px] text-pmo-muted">
            <span className="font-geist-mono tabular-nums">
              {card.onTrack}/{card.total}
            </span>{" "}
            on track
          </span>
        </div>
        <Spark points={card.trend} />
      </div>
      <div
        className="flex h-[5px] gap-0.5 overflow-hidden rounded-sm bg-pmo-track"
        role="img"
        aria-label={`${green} on track, ${amber} at risk, ${red} off track, ${unset} not set`}
      >
        {green > 0 && <span className="bg-pmo-good" style={{ flex: green }} />}
        {amber > 0 && <span className="bg-pmo-warn" style={{ flex: amber }} />}
        {red > 0 && <span className="bg-pmo-bad" style={{ flex: red }} />}
        {unset > 0 && <span className="bg-pmo-muted/40" style={{ flex: unset }} />}
      </div>
    </button>
  );
}

export function ProgrammeStrip({
  cards,
  selected,
  onSelect,
}: {
  cards: ProgrammeCardData[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <nav
      aria-label="Programmes"
      className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]"
    >
      {cards.map((card) => (
        <ProgrammeCard
          key={card.id ?? "all"}
          card={card}
          selected={card.id === selected}
          onSelect={() => onSelect(card.id)}
        />
      ))}
    </nav>
  );
}
