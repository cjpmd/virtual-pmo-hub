import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Plus, Send, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Priority } from "@/data/types";
import { useIssuedTaskMutations, useIssuedTasks } from "@/hooks/use-issued-tasks";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { addDaysIso } from "@/lib/today";
import { taskSourceLabel } from "@/services/work-items";

export const issueTaskEvent = "virtual-pmo-open-issue-task";

/** Open the issue-task sheet from anywhere, optionally for a project (database id). */
export function openIssueTask(projectId?: string) {
  window.dispatchEvent(new CustomEvent(issueTaskEvent, { detail: { projectId } }));
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);

export function IssueTaskSheet() {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId) setProjectId(detail.projectId);
      setOpen(true);
    };
    window.addEventListener(issueTaskEvent, handler);
    return () => window.removeEventListener(issueTaskEvent, handler);
  }, []);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Issue task</SheetTitle>
          <SheetDescription>
            Issue an accountable task to one person or the same request to several people.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <IssueForm
            projectId={projectId}
            setProjectId={setProjectId}
            close={() => setOpen(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function IssueForm({
  projectId,
  setProjectId,
  close,
}: {
  projectId: string;
  setProjectId: (id: string) => void;
  close: () => void;
}) {
  const query = useIssuedTasks();
  const mutations = useIssuedTaskMutations();
  const me = useMyResourceId();
  const projects = query.data?.projects ?? [],
    people = query.data?.people ?? [];
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [assignees, setAssignees] = useState<string[]>([]),
    [pasted, setPasted] = useState(""),
    [dueDate, setDueDate] = useState(() => addDaysIso(14)),
    [effort, setEffort] = useState("4"),
    [priority, setPriority] = useState<Priority>("Moderate"),
    [checklist, setChecklist] = useState<string[]>([""]),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projectId, projects, setProjectId]);
  const selectedProject = projects.find((project) => project.id === projectId);
  const source = selectedProject ? taskSourceLabel[selectedProject.taskSource] : "Native";
  const pastedNames = useMemo(
    () =>
      pasted
        .split(/[\n,;]/)
        .map((name) => name.trim())
        .filter(Boolean),
    [pasted],
  );
  const byName = new Map(people.map((person) => [person.name.toLowerCase(), person.id]));
  const unknown = pastedNames.filter((name) => !byName.has(name.toLowerCase()));
  const recipients = Array.from(
    new Set([
      ...assignees,
      ...pastedNames
        .map((name) => byName.get(name.toLowerCase()))
        .filter((id): id is string => Boolean(id)),
    ]),
  );
  const submit = () => {
    if (!projectId || !title.trim() || !recipients.length || !dueDate) {
      setNotice("Add a project, title, due date and at least one assignee.");
      return;
    }
    if (unknown.length) {
      setNotice(`Not found in this organisation: ${unknown.join(", ")}.`);
      return;
    }
    if (!me) {
      setNotice(
        "Your account isn't linked to a person in this organisation, so tasks can't be issued in your name.",
      );
      return;
    }
    mutations.issue.mutate(
      {
        projectId,
        title,
        description,
        dueDate,
        acknowledgementDue: addDaysIso(2),
        estimatedEffortHours: Number(effort) || 0,
        priority,
        checklist: checklist.map((item) => item.trim()).filter(Boolean),
        issuerId: me,
        recipientIds: recipients,
      },
      {
        onSuccess: (count) => {
          toast.success(`${count} task${count === 1 ? "" : "s"} issued`);
          close();
        },
        onError: (error) => setNotice(error.message),
      },
    );
  };
  return (
    <>
      <div className="my-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project">
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {["Low", "Moderate", "High", "Critical"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Task title">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Submit service data return"
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe the outcome required and any supporting context…"
            className="min-h-24"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date">
            <Input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </Field>
          <Field label="Estimated effort (hours)">
            <Input
              type="number"
              min="0"
              value={effort}
              onChange={(event) => setEffort(event.target.value)}
            />
          </Field>
        </div>
        <Field label="Assignees">
          <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
            {people.map((person) => (
              <label
                key={person.id}
                className="flex items-center gap-2 rounded-md border p-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={assignees.includes(person.id)}
                  onChange={() =>
                    setAssignees((current) =>
                      current.includes(person.id)
                        ? current.filter((id) => id !== person.id)
                        : [...current, person.id],
                    )
                  }
                />
                <span className="grid size-7 place-items-center rounded-full bg-accent text-[10px] font-semibold">
                  {initials(person.name)}
                </span>
                {person.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Or paste a list">
          <Textarea
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder="One name per line, or comma-separated"
            className="min-h-20"
          />
          {unknown.length > 0 && (
            <p className="text-xs text-health-warn-foreground">Not found: {unknown.join(", ")}</p>
          )}
        </Field>
        <Field label="Checklist">
          {checklist.map((item, index) => (
            <div key={index} className="mb-2 flex gap-2">
              <Input
                value={item}
                onChange={(event) =>
                  setChecklist((current) =>
                    current.map((entry, itemIndex) =>
                      itemIndex === index ? event.target.value : entry,
                    ),
                  )
                }
                placeholder={`Checklist item ${index + 1}`}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  setChecklist((current) => current.filter((_, itemIndex) => itemIndex !== index))
                }
                aria-label="Remove checklist item"
              >
                <X />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setChecklist((current) => [...current, ""])}
          >
            <Plus />
            Add item
          </Button>
        </Field>
        {source !== "Native" && (
          <div className="flex items-center gap-2 rounded-md border bg-accent/30 p-3 text-sm">
            <Check className="size-4 text-health-good" />
            This project uses {source}. Accepted tasks will be created there once Planner sync is
            connected.
          </div>
        )}
        {recipients.length > 1 && (
          <div className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-primary" />
            {recipients.length} separate tasks will be issued.
          </div>
        )}
        {notice && (
          <p role="status" className="text-sm font-semibold text-primary">
            {notice}
          </p>
        )}
      </div>
      <SheetFooter>
        <Button variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={mutations.issue.isPending || query.isPending}>
          <Send />
          Issue to {recipients.length || 1}
        </Button>
      </SheetFooter>
    </>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
