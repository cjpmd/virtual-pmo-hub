import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { Signal } from "@/services/overview-panels";

const short = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

function SignalLink({ signal }: { signal: Signal }) {
  const cls = "font-semibold text-pmo-text hover:underline";
  const label = (
    <>
      <span aria-hidden className={signal.tone === "bad" ? "text-pmo-bad" : "text-pmo-warn"}>
        {signal.tone === "bad" ? "●" : "▲"}
      </span>{" "}
      <span className="sr-only">{signal.tone === "bad" ? "Serious: " : "Watch: "}</span>
      {signal.title}
    </>
  );
  const l = signal.link;
  if (l.kind === "projectTab")
    return <strong className="text-[13px] font-semibold text-pmo-text">{label}</strong>;
  if (l.kind === "project")
    return (
      <Link to="/portfolio/projects/$projectCode" params={{ projectCode: l.code }} className={cls}>
        {label}
      </Link>
    );
  if (l.kind === "programme")
    return (
      <Link to="/portfolio/programmes/$programmeId" params={{ programmeId: l.id }} className={cls}>
        {label}
      </Link>
    );
  if (l.kind === "benefit")
    return (
      <Link to="/benefits/$benefitId" params={{ benefitId: l.id }} className={cls}>
        {label}
      </Link>
    );
  if (l.kind === "pathway")
    return (
      <Link to="/benefits/pathway" className={cls}>
        {label}
      </Link>
    );
  if (l.kind === "assurance")
    return (
      <Link to="/delivery/assurance" className={cls}>
        {label}
      </Link>
    );
  return (
    <Link to="/delivery/milestones" className={cls}>
      {label}
    </Link>
  );
}

/** The action under a project signal: opens the tab (and dialog) through the URL params. */
function SignalAction({ signal }: { signal: Signal }) {
  const l = signal.link;
  if (l.kind !== "projectTab" || !signal.action) return null;
  return (
    <Link
      to="/portfolio/projects/$projectCode"
      params={{ projectCode: l.code }}
      search={{
        ...(l.tab === "overview" ? {} : { tab: l.tab }),
        ...(l.sub ? { sub: l.sub } : {}),
        ...(l.dialog ? { dialog: l.dialog } : {}),
      }}
      className="w-fit text-[12.5px] font-medium text-pmo-accent hover:underline"
    >
      {signal.action}
    </Link>
  );
}

/** scope = "project": the project overview's assurance signals, serious first, with actions. */
function ProjectSignals({ signals }: { signals: Signal[] }) {
  return (
    <section
      aria-label="Assurance signals"
      className="flex min-w-0 flex-col px-4 py-4 font-geist sm:px-5"
    >
      <h2 className="mb-2.5 text-[15px] font-semibold text-pmo-text">Assurance signals</h2>
      {signals.length ? (
        <ol className="grid gap-2">
          {signals.map((signal) => (
            <li
              key={signal.id}
              className={cn(
                "flex flex-col gap-1 rounded-lg border border-l-[3px] border-pmo-line bg-pmo-bg px-3 py-2.5",
                signal.tone === "bad" ? "border-l-pmo-bad" : "border-l-pmo-warn",
              )}
            >
              <SignalLink signal={signal} />
              <span className="text-[12.5px] leading-[1.45] text-pmo-muted">{signal.detail}</span>
              <SignalAction signal={signal} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-2.5 text-[13px] text-pmo-muted">Nothing needs attention.</p>
      )}
    </section>
  );
}

/** Rule-generated signals, newest first, at most five, each linking to its source. */
export function SignalsList({
  signals,
  scope = "portfolio",
}: {
  signals: Signal[];
  scope?: "portfolio" | "project";
}) {
  if (scope === "project") return <ProjectSignals signals={signals} />;
  return (
    <section aria-label="Signals" className="flex min-w-0 flex-col px-4 py-4 font-geist sm:px-5">
      <h2 className="mb-1 text-sm font-semibold text-pmo-text">Signals this month</h2>
      {signals.length ? (
        <ol>
          {signals.map((signal, i) => (
            <li
              key={signal.id}
              className={
                i
                  ? "flex flex-col gap-[3px] border-t border-pmo-line py-2.5"
                  : "flex flex-col gap-[3px] py-2.5"
              }
            >
              <div className="flex justify-between gap-2 text-[13px]">
                <SignalLink signal={signal} />
                <span className="shrink-0 font-geist-mono text-[11px] tabular-nums text-pmo-muted">
                  {short(signal.date)}
                </span>
              </div>
              <span className="text-[13px] leading-[1.45] text-pmo-muted">{signal.detail}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-2.5 text-[13px] text-pmo-muted">Nothing needs attention this month.</p>
      )}
    </section>
  );
}
