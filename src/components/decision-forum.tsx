import { formatDate } from "@/lib/format";
import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, Presentation, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { decisionForums } from "@/data/decisions-data";
import type { DecisionForum } from "@/data/types";
import { getDecisions, getForumAgenda, type ResolvedDecision } from "@/services/decisions";
import { cn } from "@/lib/utils";

interface Outcome { optionId: string; rationale: string }

export function DecisionForumView() {
  const [forum, setForum] = useState<DecisionForum>("Digital Committee");
  const [meetingDate, setMeetingDate] = useState("20/10/2026");
  const [meetingMode, setMeetingMode] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const all = useMemo(() => getDecisions(), []);
  const agenda = getForumAgenda(forum, all);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4 shadow-sm">
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Forum
        <select value={forum} onChange={event => { setForum(event.target.value as DecisionForum); setMeetingMode(false); setOutcomes({}) }} className="h-9 min-w-56 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground">
          {decisionForums.map(item => <option key={item}>{item}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">Meeting date
        <Input value={meetingDate} onChange={event => setMeetingDate(event.target.value)} className="h-9 w-36" />
      </label>
      <div className="ml-auto flex gap-2">
        <Button variant={meetingMode ? "outline" : "default"} onClick={() => setMeetingMode(false)}><ClipboardList />Agenda</Button>
        <Button variant={meetingMode ? "default" : "outline"} onClick={() => setMeetingMode(true)}><Presentation />Meeting mode</Button>
      </div>
    </div>

    <div className="flex flex-wrap gap-4 rounded-md border bg-muted/30 p-4 text-sm">
      <span><strong>{agenda.pending.length}</strong> decisions for this forum</span>
      <span className="text-health-bad-foreground"><strong>{agenda.overdue.length}</strong> overdue</span>
      <span className="text-muted-foreground"><CalendarDays className="mr-1 inline size-4" />{forum} · {meetingDate}</span>
      <span className="ml-auto text-muted-foreground"><strong>{Object.keys(outcomes).length}</strong> outcomes recorded in this session</span>
    </div>

    {meetingMode
      ? <MeetingMode items={agenda.pending} outcomes={outcomes} setOutcomes={setOutcomes} meetingDate={meetingDate} forum={forum} />
      : <Agenda items={agenda.pending} recent={agenda.recent} forum={forum} meetingDate={meetingDate} />}
  </div>;
}

function Agenda({ items, recent, forum, meetingDate }: { items: ResolvedDecision[]; recent: ResolvedDecision[]; forum: DecisionForum; meetingDate: string }) {
  return <div className="space-y-5">
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase text-primary">Agenda</p>
      <h2 className="mt-1 font-display text-2xl font-semibold">{forum} · {meetingDate}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Decisions required, with the context and options each one needs.</p>
      <ol className="mt-5 space-y-5">
        {items.map((item, index) => <li key={item.id} className="rounded-md border p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">Item {index + 1} · {item.reference}</p>
              <h3 className="mt-1 font-semibold">{item.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{item.scopeName} · decision maker {item.decisionMaker}</p>
            </div>
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", item.overdue ? "bg-health-bad/20 text-health-bad-foreground" : "bg-health-warn/25 text-health-warn-foreground")}>Needed by {formatDate(item.neededBy)}{item.overdue ? " · overdue" : ""}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.context}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {item.options.map(option => <div key={option.id} className="rounded-md border bg-muted/30 p-3">
              <p className="text-sm font-semibold">{option.title}</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{option.pros.map(pro => <li key={pro} className="flex gap-1.5"><ThumbsUp className="mt-0.5 size-3 shrink-0 text-health-good-foreground" />{pro}</li>)}</ul>
              <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">{option.cons.map(con => <li key={con} className="flex gap-1.5"><ThumbsDown className="mt-0.5 size-3 shrink-0 text-health-bad-foreground" />{con}</li>)}</ul>
            </div>)}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Impact on: {item.impactSummary}</p>
        </li>)}
        {!items.length && <li className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No decisions are waiting for this forum.</li>}
      </ol>
    </section>
    {recent.length > 0 && <section className="rounded-lg border bg-card p-5 shadow-sm">
      <h2 className="font-display text-lg font-semibold">Decisions made since the last meeting</h2>
      <div className="mt-3 divide-y">{recent.map(item => <div key={item.id} className="py-3">
        <p className="text-sm font-medium">{item.reference} · {item.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.decisionDate)} · {item.decisionMaker} · chose “{item.chosenOption}”</p>
      </div>)}</div>
    </section>}
  </div>;
}

function MeetingMode({ items, outcomes, setOutcomes, meetingDate, forum }: { items: ResolvedDecision[]; outcomes: Record<string, Outcome>; setOutcomes: (value: Record<string, Outcome>) => void; meetingDate: string; forum: DecisionForum }) {
  const [index, setIndex] = useState(0);
  const item = items[index];
  if (!item) return <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No decisions are waiting for {forum}.</div>;
  const outcome = outcomes[item.id];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      {items.map((entry, position) => <button key={entry.id} onClick={() => setIndex(position)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", position === index ? "bg-primary text-primary-foreground" : outcomes[entry.id] ? "bg-health-good/20 text-health-good-foreground" : "bg-muted text-muted-foreground")}>{entry.reference}</button>)}
    </div>
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase text-primary">{forum} · {meetingDate} · item {index + 1} of {items.length}</p>
      <h2 className="mt-2 font-display text-2xl font-semibold">{item.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{item.scopeName} · needed by {formatDate(item.neededBy)} · decision maker {item.decisionMaker}</p>
      <p className="mt-4 text-base leading-7">{item.context}</p>
      <div className="mt-5 space-y-3">
        {item.options.map(option => <label key={option.id} className={cn("flex cursor-pointer gap-3 rounded-md border p-4", outcome?.optionId === option.id && "border-primary bg-primary/5")}>
          <input type="radio" name={`meeting-${item.id}`} className="mt-1" checked={outcome?.optionId === option.id} onChange={() => setOutcomes({ ...outcomes, [item.id]: { optionId: option.id, rationale: outcome?.rationale ?? "" } })} />
          <div className="flex-1">
            <p className="font-semibold">{option.title}</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <ul className="space-y-1 text-xs text-muted-foreground">{option.pros.map(pro => <li key={pro} className="flex gap-1.5"><ThumbsUp className="mt-0.5 size-3 shrink-0 text-health-good-foreground" />{pro}</li>)}</ul>
              <ul className="space-y-1 text-xs text-muted-foreground">{option.cons.map(con => <li key={con} className="flex gap-1.5"><ThumbsDown className="mt-0.5 size-3 shrink-0 text-health-bad-foreground" />{con}</li>)}</ul>
            </div>
          </div>
        </label>)}
      </div>
      <label className="mt-4 block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Rationale recorded in the minutes</span>
        <Textarea rows={3} value={outcome?.rationale ?? ""} onChange={event => setOutcomes({ ...outcomes, [item.id]: { optionId: outcome?.optionId ?? "", rationale: event.target.value } })} placeholder="What the forum agreed and why…" />
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={!outcome?.optionId || !outcome.rationale.trim()} onClick={() => setIndex(Math.min(items.length - 1, index + 1))}><CheckCircle2 />Record and move on</Button>
        <Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</Button>
        <Button variant="outline" disabled={index === items.length - 1} onClick={() => setIndex(index + 1)}>Next</Button>
        {outcome?.optionId && outcome.rationale.trim() && <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-health-good-foreground"><CheckCircle2 className="size-4" />Outcome recorded — this decision becomes read-only</span>}
      </div>
    </section>
  </div>;
}
