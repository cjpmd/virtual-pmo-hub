// "New report": from a template or ad hoc (spec §3 J2), for a forum (optional, with a meeting)
// and a scope (one project, programme, portfolio or funding collection, or a custom list of
// projects).
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForums, useMeetings } from "@/hooks/use-forums";
import { usePortfolioNames, useProgrammeNames, useProjectNames } from "@/hooks/use-hierarchy";
import { useCollections } from "@/hooks/use-collections";
import { useForumReporting, useReportMutations, useTemplates } from "@/hooks/use-reports";
import { errorMessage } from "@/services/service-error";
import type { ScopeType } from "@/services/reports";
import { todayIso } from "@/lib/today";

export function NewReportDialog({
  open,
  onOpenChange,
  forumId: presetForum,
  meetingId: presetMeeting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forumId?: string | null;
  meetingId?: string | null;
}) {
  const navigate = useNavigate();
  const templates = useTemplates();
  const forums = useForums();
  const reporting = useForumReporting();
  const projects = useProjectNames();
  const programmes = useProgrammeNames();
  const portfolios = usePortfolioNames();
  const collections = useCollections();
  const { create } = useReportMutations();
  const [kind, setKind] = useState<"template" | "ad_hoc">(presetForum ? "template" : "ad_hoc");
  const [templateId, setTemplateId] = useState<string>("");
  const [forumId, setForumId] = useState<string>(presetForum ?? "");
  const meetings = useMeetings(forumId || null);
  const [meetingId, setMeetingId] = useState<string>(presetMeeting ?? "");
  const [scopeType, setScopeType] = useState<ScopeType>("project");
  const [scopeEntityId, setScopeEntityId] = useState("");
  const [custom, setCustom] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [asAt, setAsAt] = useState("");
  const [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const forumSettings = reporting.data?.find((row) => row.id === forumId) ?? null;
  const forumHasScope = !!forumSettings?.scopeType;
  const meeting = (meetings.data ?? []).find((m) => m.id === meetingId) ?? null;
  const beforeCutoff = !!meeting && meeting.papersDeadline > todayIso();
  const entities = useMemo(() => {
    if (scopeType === "project")
      return (projects.data ?? []).map((p) => ({ id: p.id, name: `${p.code} ${p.name}` }));
    if (scopeType === "programme")
      return (programmes.data ?? []).map((p) => ({ id: p.id, name: p.name }));
    if (scopeType === "portfolio")
      return (portfolios.data ?? []).map((p) => ({ id: p.id, name: p.name }));
    if (scopeType === "collection")
      return (collections.data ?? []).map((c) => ({ id: c.id, name: c.name }));
    return [];
  }, [scopeType, projects.data, programmes.data, portfolios.data, collections.data]);
  const availableTemplates = (templates.data ?? []).filter((t) => !t.archivedAt);

  const submit = async () => {
    setError(null);
    try {
      const useForumScope = forumId && forumHasScope && !scopeEntityId && scopeType !== "custom";
      const id = await create.mutateAsync({
        ...(title.trim() && { title: title.trim() }),
        templateId: kind === "template" && templateId ? templateId : null,
        forumId: forumId || null,
        meetingId: meetingId || null,
        ...(!useForumScope && {
          scopeType,
          scopeEntityId: scopeType === "custom" ? null : scopeEntityId || null,
          ...(scopeType === "custom" && {
            scopeItems: custom.map((entityId) => ({
              entity_type: "project" as const,
              entity_id: entityId,
            })),
          }),
        }),
        asAt: asAt || null,
        adHoc: kind === "ad_hoc",
        overrideCutoff: override,
      });
      onOpenChange(false);
      void navigate({ to: "/governance/reports/$reportId/edit", params: { reportId: id } });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New report</DialogTitle>
          <DialogDescription>
            Start from a template or build an ad hoc report from blocks.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset className="flex gap-4 text-sm">
            <legend className="sr-only">Kind</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                checked={kind === "template"}
                onChange={() => setKind("template")}
              />{" "}
              From a template
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                checked={kind === "ad_hoc"}
                onChange={() => setKind("ad_hoc")}
              />{" "}
              Ad hoc
            </label>
          </fieldset>
          {kind === "template" && (
            <div className="space-y-1">
              <Label htmlFor="nr-template">Template</Label>
              <select
                id="nr-template"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">{forumId ? "The forum's default template" : "Choose…"}</option>
                {availableTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isSystem ? " (system)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="nr-forum">Forum (optional)</Label>
            <select
              id="nr-forum"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={forumId}
              onChange={(e) => {
                setForumId(e.target.value);
                setMeetingId("");
              }}
            >
              <option value="">None (ad hoc, no review)</option>
              {(forums.data ?? [])
                .filter((f) => f.active)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </div>
          {forumId && (
            <div className="space-y-1">
              <Label htmlFor="nr-meeting">Meeting</Label>
              <select
                id="nr-meeting"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value)}
              >
                <option value="">No meeting</option>
                {(meetings.data ?? [])
                  .filter((m) => m.status === "Planned")
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.meetingDate} (papers {m.papersDeadline})
                    </option>
                  ))}
              </select>
              {beforeCutoff && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={override} onCheckedChange={(c) => setOverride(c === true)} />
                  The papers deadline (collection cut-off) hasn't passed. Create anyway (PMO only).
                </label>
              )}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="nr-scope">Scope{forumHasScope && " (blank: the forum's scope)"}</Label>
            <div className="flex gap-2">
              <select
                id="nr-scope"
                className="h-9 w-36 shrink-0 rounded-md border bg-background px-2 text-sm"
                value={scopeType}
                onChange={(e) => {
                  setScopeType(e.target.value as ScopeType);
                  setScopeEntityId("");
                }}
              >
                <option value="project">Project</option>
                <option value="programme">Programme</option>
                <option value="portfolio">Portfolio</option>
                <option value="collection">Collection</option>
                <option value="custom">Custom list</option>
              </select>
              {scopeType !== "custom" && (
                <select
                  aria-label="Scope item"
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                  value={scopeEntityId}
                  onChange={(e) => setScopeEntityId(e.target.value)}
                >
                  <option value="">{forumHasScope ? "The forum's scope" : "Choose…"}</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {scopeType === "custom" && (
              <ul className="max-h-48 space-y-1 overflow-auto rounded-md border p-2">
                {(projects.data ?? []).map((p) => (
                  <li key={p.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={custom.includes(p.id)}
                        onCheckedChange={(c) =>
                          setCustom(c ? [...custom, p.id] : custom.filter((x) => x !== p.id))
                        }
                      />
                      {p.code} {p.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="nr-title">Title (optional)</Label>
              <Input id="nr-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nr-asat">As at</Label>
              <Input
                id="nr-asat"
                type="date"
                value={asAt}
                onChange={(e) => setAsAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Blank: the meeting's papers deadline, else today.
              </p>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-health-bad-foreground">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={create.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
