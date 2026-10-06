import { formatDate } from "@/lib/format";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { DependencyPanel } from "@/components/dependency-panel";
import { QueryState } from "@/components/query-state";
import { useDependencies } from "@/hooks/use-dependencies";
import { HealthPill } from "@/components/health-pill";
import {
  getDependenciesFor,
  type DependenciesData,
  type ResolvedDependency,
} from "@/services/dependencies";
import { cn } from "@/lib/utils";

/** "We depend on" and "Depends on us" for a project or programme (Prompt I1). */
export function DependencyTab(props: { projectId?: string; programmeId?: string }) {
  const dependencies = useDependencies();
  return <QueryState query={dependencies}>{(data) => <Tab data={data} {...props} />}</QueryState>;
}

function Tab({
  data,
  projectId,
  programmeId,
}: {
  data: DependenciesData;
  projectId?: string;
  programmeId?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const scope = { ...(projectId ? { projectId } : {}), ...(programmeId ? { programmeId } : {}) };
  const { weDependOn, dependsOnUs } = getDependenciesFor(scope, data.dependencies);
  const selected = data.dependencies.find((item) => item.id === selectedId);
  const setSelected = (item: ResolvedDependency) => setSelectedId(item.id);

  return (
    <div className="space-y-6">
      <Section
        title="We depend on"
        note="Other people owe this work something."
        items={weDependOn}
        icon={<ArrowDownLeft className="size-4 text-primary" />}
        otherSide={(item) => item.giverLabel}
        otherOwner={(item) => item.giver.owner}
        onOpen={setSelected}
      />
      <Section
        title="Depends on us"
        note="This work owes other people something."
        items={dependsOnUs}
        icon={<ArrowUpRight className="size-4 text-primary" />}
        otherSide={(item) => item.receiverLabel}
        otherOwner={(item) => item.receiver.owner}
        onOpen={setSelected}
      />
      {selected && <DependencyPanel dependency={selected} close={() => setSelectedId(null)} />}
    </div>
  );
}

function Section({
  title,
  note,
  items,
  icon,
  otherSide,
  otherOwner,
  onOpen,
}: {
  title: string;
  note: string;
  items: ResolvedDependency[];
  icon: React.ReactNode;
  otherSide: (item: ResolvedDependency) => string;
  otherOwner: (item: ResolvedDependency) => string;
  onOpen: (item: ResolvedDependency) => void;
}) {
  return (
    <section className="rounded-lg border border-border/70 bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b p-4">
        {icon}
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
        <span className="ml-auto text-sm font-semibold text-muted-foreground">{items.length}</span>
      </header>
      <div className="divide-y">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onOpen(item)}
            className="grid w-full gap-2 p-4 text-left hover:bg-accent/30 sm:grid-cols-[1fr_auto_auto] sm:items-center"
          >
            <div>
              <p className="text-sm font-medium">
                {item.reference} · {otherSide(item)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {otherOwner(item)} · {item.type} · {item.boundary} · required by{" "}
                {formatDate(item.requiredBy)}
              </p>
            </div>
            <span
              className={cn(
                "justify-self-start rounded-full px-2.5 py-1 text-xs font-semibold sm:justify-self-auto",
                item.acceptance === "Confirmed"
                  ? "bg-health-good/20 text-health-good-foreground"
                  : item.acceptance === "Closed"
                    ? "bg-muted text-muted-foreground"
                    : "bg-health-warn/25 text-health-warn-foreground",
              )}
            >
              {item.acceptance}
            </span>
            <HealthPill health={item.health} />
          </button>
        ))}
        {!items.length && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Nothing recorded here yet. Add one from the{" "}
            <Link
              to="/delivery/dependencies"
              className="font-semibold text-primary hover:underline"
            >
              dependency register
            </Link>
            .
          </p>
        )}
      </div>
    </section>
  );
}
