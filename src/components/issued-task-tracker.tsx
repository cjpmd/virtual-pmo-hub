import { formatDate } from "@/lib/format";
import { useState, type ReactNode } from "react";
import { Check, Clock3, ExternalLink, Mail, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QueryState } from "@/components/query-state";
import type { IssuedTaskStatus } from "@/data/types";
import { useIssuedTaskMutations, useIssuedTasks } from "@/hooks/use-issued-tasks";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { daysFromToday } from "@/lib/today";
import type { IssuedTaskView, IssuedTasksData } from "@/services/issued-tasks";
import { cn } from "@/lib/utils";

const statusTone = (status: IssuedTaskStatus) =>
  status === "Done" || status === "Accepted"
    ? "bg-health-good/20 text-health-good-foreground"
    : status === "Declined"
      ? "bg-health-bad/20 text-health-bad-foreground"
      : status === "Proposed new date"
        ? "bg-health-warn/25 text-health-warn-foreground"
        : "bg-accent text-accent-foreground";

export function IssuedTaskTracker() {
  const query = useIssuedTasks();
  return <QueryState query={query}>{(data) => <Tracker data={data} />}</QueryState>;
}

function Tracker({ data }: { data: IssuedTasksData }) {
  const me = useMyResourceId();
  const mutations = useIssuedTaskMutations();
  const [action, setAction] = useState<{ id: string; type: "decline" | "date" } | null>(null),
    [response, setResponse] = useState("");
  const toMe = data.items.filter((item) => item.assigneeId === me),
    byMe = data.items.filter((item) => item.issuerId === me);
  const fail = (error: Error) => toast.error(error.message);
  const accept = (item: IssuedTaskView) =>
    mutations.respond.mutate(
      { offerId: item.offerId, answer: { response: "accepted" } },
      { onError: fail },
    );
  const send = (item: IssuedTaskView) => {
    if (!action) return;
    mutations.respond.mutate(
      {
        offerId: item.offerId,
        answer:
          action.type === "date"
            ? {
                response: "proposed_date",
                proposedDate: response,
                comment: "Alternative delivery date proposed.",
              }
            : { response: "declined", comment: response },
      },
      { onSuccess: () => setAction(null), onError: fail },
    );
  };
  const remind = (item: IssuedTaskView) => {
    const subject = encodeURIComponent(`Reminder: ${item.title}`),
      body = encodeURIComponent(
        `Hello ${item.assignee.split(" ")[0]},\n\nCould you accept, decline or propose a new date for "${item.title}" (${item.projectName})? Acknowledgement was due ${item.acknowledgementDue ? formatDate(item.acknowledgementDue) : "recently"}.\n\nThank you.`,
      );
    if (item.assigneeEmail)
      window.location.href = `mailto:${item.assigneeEmail}?subject=${subject}&body=${body}`;
    mutations.remind.mutate(item.offerId, { onError: fail });
  };
  if (!me)
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Your account isn't linked to a person in this organisation yet, so there is nothing issued
        to or by you.
      </p>
    );
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <IssuedSection
        title="Issued to me"
        description="Acknowledge tasks requested by project and portfolio managers."
      >
        {toMe.map((item) => (
          <article key={item.offerId} className="border-b py-4 last:border-0">
            <TaskHeading item={item} />
            <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              Issued by {item.issuer}
              {item.dueDate ? ` · Due ${formatDate(item.dueDate)}` : ""} ·{" "}
              {item.estimatedEffortHours} hrs
            </p>
            {item.status === "Issued" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={mutations.respond.isPending}
                  onClick={() => accept(item)}
                >
                  <Check />
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAction({ id: item.offerId, type: "decline" });
                    setResponse("");
                  }}
                >
                  <X />
                  Decline
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAction({ id: item.offerId, type: "date" });
                    setResponse("");
                  }}
                >
                  <Clock3 />
                  Propose date
                </Button>
              </div>
            )}
            {action?.id === item.offerId && (
              <div className="mt-3 flex gap-2">
                <Input
                  type={action.type === "date" ? "date" : "text"}
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  placeholder={action.type === "date" ? undefined : "Reason required"}
                />
                <Button
                  size="sm"
                  disabled={!response || mutations.respond.isPending}
                  onClick={() => send(item)}
                >
                  <Send />
                  Send
                </Button>
              </div>
            )}
            {item.plannerSync !== "Not applicable" && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ExternalLink className="size-3.5" />
                {item.plannerSync}
              </p>
            )}
          </article>
        ))}
        {!toMe.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing issued to you.</p>
        )}
      </IssuedSection>
      <IssuedSection
        title="Issued by me"
        description="Track acknowledgements and follow up outstanding requests."
      >
        {byMe.map((item) => {
          const overdue =
            item.status === "Issued" && (daysFromToday(item.acknowledgementDue) ?? 0) < 0;
          return (
            <article
              key={item.offerId}
              className={cn("border-b py-4 last:border-0", overdue && "bg-health-bad/5")}
            >
              <TaskHeading item={item} />
              <p className="mt-2 text-sm text-muted-foreground">
                {item.assignee}
                {item.acknowledgementDue
                  ? ` · Acknowledgement due ${formatDate(item.acknowledgementDue)}`
                  : ""}
              </p>
              {item.proposedDate && (
                <p className="mt-2 text-xs text-health-warn-foreground">
                  Proposed {formatDate(item.proposedDate)}: {item.responseReason}
                </p>
              )}
              {item.responseReason && item.status === "Declined" && (
                <p className="mt-2 text-xs text-health-bad-foreground">
                  Reason: {item.responseReason}
                </p>
              )}
              {overdue && (
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  disabled={mutations.remind.isPending}
                  onClick={() => remind(item)}
                >
                  <Mail />
                  {item.reminderSentAt
                    ? `Reminder sent ${formatDate(item.reminderSentAt.slice(0, 10))} · send again`
                    : "Send reminder"}
                </Button>
              )}
            </article>
          );
        })}
        {!byMe.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            You haven't issued any tasks.
          </p>
        )}
      </IssuedSection>
    </div>
  );
}
function IssuedSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}
function TaskHeading({ item }: { item: IssuedTaskView }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">{item.title}</h3>
        <p className="text-xs text-muted-foreground">{item.projectName}</p>
      </div>
      <span className={cn("rounded px-2 py-1 text-[10px] font-semibold", statusTone(item.status))}>
        {item.status}
      </span>
    </div>
  );
}
