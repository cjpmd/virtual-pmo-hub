import { formatDate } from "@/lib/format";
import type { ResolvedDecision } from "@/services/decisions";

export function DecisionMeetingSignals({ decision }: { decision: ResolvedDecision }) {
  const signals = [
    decision.papersDeadlinePassed &&
      `Papers deadline missed for ${decision.forum} ${formatDate(decision.targetMeetingDate ?? undefined)}`,
    decision.neededByBeforePapersDeadline &&
      `Needed by ${formatDate(decision.neededBy)}, before the papers deadline ${formatDate(decision.targetPapersDeadline ?? undefined)}`,
    decision.targetMeetingAfterNeededBy && "Target meeting is after the needed-by date",
  ].filter(Boolean);
  if (!signals.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {signals.map((signal) => (
        <span
          key={String(signal)}
          className="rounded-md bg-health-warn/20 px-2 py-1 text-xs font-medium text-health-warn-foreground"
        >
          {signal}
        </span>
      ))}
    </div>
  );
}
