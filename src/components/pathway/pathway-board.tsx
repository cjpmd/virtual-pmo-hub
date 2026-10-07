// Benefits → Pathway: capabilities enable outcomes, outcomes produce benefits. Each card shows
// its RAG with the reason on hover or focus; selecting a card highlights its chain. Edits happen
// in the capability and outcome sheets. RAG and reasons come from the database views.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Link2Off, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePathwayMutations } from "@/hooks/use-pathway";
import { useCan } from "@/hooks/use-permissions";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  capabilityStatusLabel,
  linkedIds,
  outcomeStatusLabel,
  type PathwayBenefit,
  type PathwayData,
} from "@/services/pathway";
import { CapabilitySheet } from "./capability-sheet";
import { OutcomeSheet } from "./outcome-sheet";
import { ErrorText, RagChip, selectClass } from "./pathway-ui";

type Kind = "capability" | "outcome" | "benefit";
type Editing = { kind: "capability" | "outcome"; id?: string } | null;

export function PathwayBoard({
  data,
  programmeId,
  onProgrammeChange,
}: {
  data: PathwayData;
  programmeId: string | undefined;
  onProgrammeChange: (id: string | undefined) => void;
}) {
  const [selected, setSelected] = useState<{ kind: Kind; id: string } | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const inScope = <T extends { programmeId: string | null }>(items: T[]) =>
    programmeId ? items.filter((item) => item.programmeId === programmeId) : items;
  const capabilities = inScope(data.capabilities);
  const outcomes = inScope(data.outcomes);
  const benefits = inScope(data.benefits);
  const chain = useMemo(() => linkedIds(data, selected), [data, selected]);
  const workspaceId =
    data.programmes.find((programme) => programme.id === programmeId)?.workspaceId ??
    data.programmes[0]?.workspaceId;
  const canEdit = useCan("contributor", workspaceId);
  const gaps = benefits.filter((benefit) => !benefit.hasPathway || benefit.needsRealisationStart);
  const projectCode = new Map(data.projects.map((project) => [project.id, project.code]));
  const dim = (id: string) => selected !== null && !chain.has(id);
  const toggle = (kind: Kind, id: string) =>
    setSelected((current) => (current?.id === id ? null : { kind, id }));

  // Sheets read the current record from fresh data, so they reflect every save.
  const editingCapability =
    editing?.kind === "capability" && editing.id
      ? data.capabilities.find((item) => item.id === editing.id)
      : undefined;
  const editingOutcome =
    editing?.kind === "outcome" && editing.id
      ? data.outcomes.find((item) => item.id === editing.id)
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm font-medium">
          <span>Programme</span>
          <select
            className={cn(selectClass, "min-w-72")}
            value={programmeId ?? ""}
            onChange={(event) => onProgrammeChange(event.target.value || undefined)}
          >
            <option value="">Whole portfolio</option>
            {data.programmes.map((programme) => (
              <option key={programme.id} value={programme.id}>
                {programme.name}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-2 text-sm text-muted-foreground">
          {capabilities.length} capabilities · {outcomes.length} outcomes · {benefits.length} open
          benefits
          {selected && (
            <>
              {" · "}
              <button className="text-primary hover:underline" onClick={() => setSelected(null)}>
                Clear selection
              </button>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Column
          title="Capabilities"
          description="Delivered by projects; only accepted counts as delivered."
          action={
            canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing({ kind: "capability" })}
              >
                <Plus />
                New
              </Button>
            )
          }
        >
          {capabilities.map((item) => (
            <Card
              key={item.id}
              selected={selected?.id === item.id}
              dimmed={dim(item.id)}
              onSelect={() => toggle("capability", item.id)}
              onOpen={() => setEditing({ kind: "capability", id: item.id })}
              title={item.title}
              chip={
                <RagChip
                  rag={item.rag}
                  reason={item.reason}
                  complete={item.status === "accepted"}
                />
              }
              meta={[
                capabilityStatusLabel[item.status],
                item.status === "accepted"
                  ? `accepted ${formatDate(item.acceptedAt ?? undefined)}`
                  : item.targetDate
                    ? `target ${formatDate(item.targetDate)}${
                        item.forecastDate && item.forecastDate !== item.targetDate
                          ? ` · forecast ${formatDate(item.forecastDate)}`
                          : ""
                      }`
                    : "no target date",
              ]}
              footer={item.projectIds
                .map((id) => projectCode.get(id))
                .filter(Boolean)
                .join(", ")}
            />
          ))}
          {!capabilities.length && <Empty>No capabilities yet.</Empty>}
        </Column>

        <Column
          title="Outcomes"
          description="Judged by their indicators once measured; until then by their capabilities."
          action={
            canEdit && (
              <Button size="sm" variant="outline" onClick={() => setEditing({ kind: "outcome" })}>
                <Plus />
                New
              </Button>
            )
          }
        >
          {outcomes.map((item) => (
            <Card
              key={item.id}
              selected={selected?.id === item.id}
              dimmed={dim(item.id)}
              onSelect={() => toggle("outcome", item.id)}
              onOpen={() => setEditing({ kind: "outcome", id: item.id })}
              title={item.title}
              chip={
                <RagChip
                  rag={item.rag}
                  reason={item.reason}
                  complete={item.status === "achieved"}
                />
              }
              meta={[
                outcomeStatusLabel[item.status],
                item.targetDate ? `target ${formatDate(item.targetDate)}` : "no target date",
                `${item.indicators.length} indicator${item.indicators.length === 1 ? "" : "s"}`,
              ]}
            />
          ))}
          {!outcomes.length && <Empty>No outcomes yet.</Empty>}
        </Column>

        <Column
          title="Benefits"
          description="Readiness (from outcomes) until the realisation start; then measured as today."
        >
          {benefits.map((item) => (
            <BenefitCard
              key={item.id}
              benefit={item}
              selected={selected?.id === item.id}
              dimmed={dim(item.id)}
              onSelect={() => toggle("benefit", item.id)}
            />
          ))}
          {!benefits.length && <Empty>No open benefits.</Empty>}
        </Column>
      </div>

      {gaps.length > 0 && (
        <section className="rounded-lg border border-border/70 bg-card p-4">
          <h2 className="text-sm font-semibold">Gaps</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {gaps.map((benefit) => (
              <li key={benefit.id} className="flex flex-wrap gap-2">
                <Link
                  to="/benefits/$benefitId"
                  params={{ benefitId: benefit.id }}
                  className="font-medium text-primary hover:underline"
                >
                  {benefit.ref}
                </Link>
                <span>{benefit.title}</span>
                {!benefit.hasPathway && (
                  <span className="text-muted-foreground">· No pathway: link it to an outcome</span>
                )}
                {benefit.needsRealisationStart && (
                  <span className="text-muted-foreground">· Set realisation start</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing?.kind === "capability" && (editing.id ? editingCapability : true) && (
        <CapabilitySheet
          data={data}
          {...(editingCapability ? { capability: editingCapability } : {})}
          {...(programmeId ? { programmeId } : {})}
          onClose={() => setEditing(null)}
        />
      )}
      {editing?.kind === "outcome" && (editing.id ? editingOutcome : true) && (
        <OutcomeSheet
          data={data}
          {...(editingOutcome ? { outcome: editingOutcome } : {})}
          {...(programmeId ? { programmeId } : {})}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Column({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/70 bg-card shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {action}
      </header>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}

function Card({
  title,
  chip,
  meta,
  footer,
  selected,
  dimmed,
  onSelect,
  onOpen,
}: {
  title: string;
  chip: React.ReactNode;
  meta: string[];
  footer?: string;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-background p-3 transition",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border/70",
        dimmed && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          className="min-w-0 text-left text-sm font-semibold hover:text-primary hover:underline"
          onClick={onOpen}
        >
          {title}
        </button>
        {chip}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{meta.join(" · ")}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[11px] text-muted-foreground">{footer}</span>
        <button
          className="shrink-0 text-xs font-medium text-primary hover:underline"
          aria-pressed={selected}
          onClick={onSelect}
        >
          {selected ? "Selected" : "Show chain"}
        </button>
      </div>
    </div>
  );
}

function BenefitCard({
  benefit,
  selected,
  dimmed,
  onSelect,
}: {
  benefit: PathwayBenefit;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const mutations = usePathwayMutations();
  const canEdit = useCan("contributor", benefit.workspaceId);
  const [setting, setSetting] = useState(false);
  const [date, setDate] = useState(benefit.realisationStartDate ?? "");
  return (
    <div
      className={cn(
        "rounded-md border bg-background p-3 transition",
        selected ? "border-primary ring-2 ring-primary/30" : "border-border/70",
        dimmed && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/benefits/$benefitId"
          params={{ benefitId: benefit.id }}
          className="min-w-0 text-sm font-semibold hover:text-primary hover:underline"
        >
          <span className="text-muted-foreground">{benefit.ref}</span> {benefit.title}
        </Link>
        <RagChip rag={benefit.rag} reason={benefit.reason} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {benefit.phase === "realisation" ? "In realisation" : "Readiness"}
        {benefit.realisationStartDate
          ? ` · realisation from ${formatDate(benefit.realisationStartDate)}`
          : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {!benefit.hasPathway && (
            <span className="inline-flex items-center gap-1 rounded-full bg-health-warn/20 px-2 py-0.5 text-[11px] font-semibold text-health-warn-foreground">
              <Link2Off className="size-3" aria-hidden />
              No pathway
            </span>
          )}
          {benefit.needsRealisationStart && !setting && (
            <button
              disabled={!canEdit}
              onClick={() => setSetting(true)}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:bg-accent disabled:cursor-default"
            >
              <CalendarClock className="size-3" aria-hidden />
              Set realisation start
            </button>
          )}
        </div>
        <button
          className="shrink-0 text-xs font-medium text-primary hover:underline"
          aria-pressed={selected}
          onClick={onSelect}
        >
          {selected ? "Selected" : "Show chain"}
        </button>
      </div>
      {setting && (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            mutations.setRealisationStart.mutate(
              { benefit, date: date || null },
              { onSuccess: () => setSetting(false) },
            );
          }}
        >
          <Input
            type="date"
            aria-label={`Realisation start for ${benefit.ref}`}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-8 w-40"
            required
          />
          <Button size="sm" type="submit" disabled={mutations.setRealisationStart.isPending}>
            Save
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setSetting(false)}>
            Cancel
          </Button>
        </form>
      )}
      <ErrorText error={setting ? mutations.setRealisationStart.error : null} />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-center text-sm text-muted-foreground">{children}</p>;
}
