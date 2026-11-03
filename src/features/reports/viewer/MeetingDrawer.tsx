// Presentation mode side drawer (spec §9.3, J4): record decisions against the pack's
// "Decisions required" items and add actions. Both write immediately (record_meeting_decision,
// add_meeting_action) with the meeting and pack; the published snapshot doesn't change.
import { useState } from "react";
import { ClipboardCheck, PanelRightClose } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePeople } from "@/hooks/use-hierarchy";
import { useMeetingCapture } from "@/hooks/use-meeting-capture";
import { useBlockData } from "@/hooks/use-reports";
import { errorMessage } from "@/services/service-error";
import { useReportView } from "./ReportViewer";

interface DecisionItem {
  id: string;
  ref: string;
  title: string;
  options: Array<{ id: string; title: string }> | null;
}

export function MeetingDrawer({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(true);
  const view = useReportView(reportId);
  const capture = useMeetingCapture(reportId);
  const people = usePeople();
  const [choice, setChoice] = useState<Record<string, { optionId: string; outcome: string }>>({});
  const [recorded, setRecorded] = useState<string[]>([]);
  const [action, setAction] = useState({ title: "", ownerId: "", dueDate: "", projectId: "" });
  const decisionsBlock =
    view.data?.report.blocks.find((b) => b.blockKey === "decisions_required") ?? null;
  const live = useBlockData(
    view.data?.doc.live ?? null,
    decisionsBlock ?? {
      id: "none",
      blockKey: "decisions_required",
      blockVersion: 1,
      config: {},
      placement: "report",
    },
    null,
    !!decisionsBlock && !view.data?.doc.snapshot,
  );
  if (!view.data) return null;
  const v = view.data;
  // Decisions required, from the pack (snapshot when published, else live).
  const decisions: DecisionItem[] = [];
  for (const block of v.report.blocks.filter((b) => b.blockKey === "decisions_required")) {
    const data = (
      v.doc.snapshot
        ? v.doc.snapshot(block.id, null)
        : block.id === decisionsBlock?.id
          ? live.data
          : undefined
    ) as { rows?: DecisionItem[] } | undefined;
    for (const row of data?.rows ?? [])
      if (!decisions.some((d) => d.id === row.id)) decisions.push(row);
  }
  const canCapture = v.report.status === "published" || v.report.status === "approved";
  if (!open)
    return (
      <Button
        className="absolute right-3 top-14 z-10"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <ClipboardCheck className="mr-1 size-4" /> Decisions & actions
      </Button>
    );
  return (
    <aside
      aria-label="Decisions and actions"
      className="flex w-full max-w-sm flex-col border-l bg-card"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="font-semibold">Decisions & actions</h2>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto"
          aria-label="Close the drawer"
          onClick={() => setOpen(false)}
        >
          <PanelRightClose className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-3 text-sm">
        {!canCapture && (
          <p className="text-muted-foreground">
            Decisions and actions are recorded against an approved or published pack.
          </p>
        )}
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            Decisions required
          </h3>
          {decisions.length === 0 && <p className="text-muted-foreground">None in this pack.</p>}
          {decisions.map((d) => {
            const c = choice[d.id] ?? { optionId: "", outcome: "" };
            const done = recorded.includes(d.id);
            return (
              <div
                key={d.id}
                className="space-y-2 rounded-md border p-2"
                data-capture-decision={d.id}
              >
                <p className="font-medium">
                  <span className="text-muted-foreground">{d.ref}</span> {d.title}
                </p>
                {done ? (
                  <p className="text-health-good-foreground">Recorded.</p>
                ) : (
                  <>
                    <select
                      aria-label={`Option for ${d.ref}`}
                      className="h-9 w-full rounded-md border bg-background px-2"
                      value={c.optionId}
                      onChange={(e) =>
                        setChoice({ ...choice, [d.id]: { ...c, optionId: e.target.value } })
                      }
                    >
                      <option value="">Choose the option agreed…</option>
                      {(d.options ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.title}
                        </option>
                      ))}
                    </select>
                    <Textarea
                      aria-label={`Outcome for ${d.ref}`}
                      rows={2}
                      placeholder="Outcome and rationale"
                      value={c.outcome}
                      onChange={(e) =>
                        setChoice({ ...choice, [d.id]: { ...c, outcome: e.target.value } })
                      }
                    />
                    <Button
                      size="sm"
                      disabled={
                        !canCapture || !c.optionId || !c.outcome.trim() || capture.decide.isPending
                      }
                      onClick={() =>
                        capture.decide.mutate(
                          { decisionId: d.id, optionId: c.optionId, outcome: c.outcome.trim() },
                          {
                            onSuccess: () => {
                              setRecorded([...recorded, d.id]);
                              toast.success(`${d.ref} recorded`);
                            },
                            onError: (e) => toast.error(errorMessage(e)),
                          },
                        )
                      }
                    >
                      Record decision
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </section>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Actions</h3>
          <ul className="space-y-1">
            {(capture.actions.data ?? []).map((a) => (
              <li key={a.id} className="rounded bg-muted/50 px-2 py-1">
                {a.title}
                {a.dueDate && <span className="text-muted-foreground"> · due {a.dueDate}</span>}
              </li>
            ))}
          </ul>
          <Input
            aria-label="Action"
            placeholder="Action"
            value={action.title}
            onChange={(e) => setAction({ ...action, title: e.target.value })}
          />
          <select
            aria-label="Owner"
            className="h-9 w-full rounded-md border bg-background px-2"
            value={action.ownerId}
            onChange={(e) => setAction({ ...action, ownerId: e.target.value })}
          >
            <option value="">Owner…</option>
            {(people.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Input
              aria-label="Due"
              type="date"
              value={action.dueDate}
              onChange={(e) => setAction({ ...action, dueDate: e.target.value })}
            />
            <select
              aria-label="Project"
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2"
              value={action.projectId}
              onChange={(e) => setAction({ ...action, projectId: e.target.value })}
            >
              <option value="">No project</option>
              {v.deepDives.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            disabled={!canCapture || !action.title.trim() || capture.addAction.isPending}
            onClick={() =>
              capture.addAction.mutate(
                {
                  title: action.title.trim(),
                  ownerId: action.ownerId || null,
                  dueDate: action.dueDate || null,
                  projectId: action.projectId || null,
                },
                {
                  onSuccess: () => {
                    setAction({ title: "", ownerId: "", dueDate: "", projectId: "" });
                    toast.success("Action added");
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            Add action
          </Button>
        </section>
      </div>
    </aside>
  );
}
