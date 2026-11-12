// Packs and report settings for a forum, shown in the Boards view (RB-18): the forum's packs,
// "Create pack" for the chosen meeting (after its papers deadline, the collection cut-off,
// RB-6), and the settings sheet (type, scope, rating scheme, tolerances, default template,
// approval, member roles).
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FilePlus2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useForumMembers, useForums } from "@/hooks/use-forums";
import { usePortfolioNames, useProgrammeNames, useProjectNames } from "@/hooks/use-hierarchy";
import { useCollections } from "@/hooks/use-collections";
import {
  useForumReporting,
  useForumReportingMutations,
  useRatingSchemes,
  useRiskMatrices,
  useReportMutations,
  useReports,
  useTemplates,
} from "@/hooks/use-reports";
import { useCan } from "@/hooks/use-permissions";
import { useOrgRole } from "@/hooks/use-permissions";
import { atLeast } from "@/services/auth";
import { formatDate } from "@/lib/format";
import { todayIso } from "@/lib/today";
import { errorMessage } from "@/services/service-error";
import type { ForumItem, MeetingItem } from "@/services/forums";
import type { ForumReporting, ScopeType } from "@/services/reports";
import type { Tolerances } from "../engine/evaluateRules";
import { DEFAULT_TOLERANCES, FORUM_TYPE_LABEL, type ForumType } from "../engine/defaults";
import { getMetric } from "../engine/metrics";
import { STATUS_LABEL } from "../viewer/ReportLifecycle";

const ROLES = ["chair", "secretary", "member", "contributor", "observer"] as const;

export function ForumReportsPanel({
  forum,
  meeting,
}: {
  forum: ForumItem;
  meeting: MeetingItem | undefined;
}) {
  const reporting = useForumReporting();
  const reports = useReports();
  const navigate = useNavigate();
  const { create } = useReportMutations();
  const settings = reporting.data?.find((row) => row.id === forum.id) ?? null;
  const [open, setOpen] = useState(false);
  const orgRole = useOrgRole();
  const isPmo = useCan("pmo", forum.workspaceId ?? undefined) || atLeast(orgRole, "pmo");
  const packs = (reports.data ?? []).filter((r) => r.forumId === forum.id);
  const beforeCutoff = !!meeting && meeting.papersDeadline > todayIso();
  const createPack = async (override = false) => {
    try {
      const id = await create.mutateAsync({
        forumId: forum.id,
        meetingId: meeting?.id ?? null,
        overrideCutoff: override,
      });
      void navigate({ to: "/governance/reports/$reportId/edit", params: { reportId: id } });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <section aria-label="Packs" className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Packs</h2>
        {settings?.forumType && (
          <Badge variant="secondary">{FORUM_TYPE_LABEL[settings.forumType]}</Badge>
        )}
        {settings?.scopeType && <Badge variant="outline">{settings.scopeType} scope</Badge>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Settings2 className="mr-1 size-3.5" /> Report settings
          </Button>
          <Button
            size="sm"
            disabled={create.isPending || (beforeCutoff && !isPmo) || !settings?.scopeType}
            title={
              !settings?.scopeType
                ? "Set the forum's scope in Report settings first."
                : beforeCutoff
                  ? `Available after the papers deadline (${formatDate(meeting!.papersDeadline)}), the collection cut-off.`
                  : undefined
            }
            onClick={() => {
              if (beforeCutoff && isPmo) {
                if (
                  window.confirm(
                    "The papers deadline hasn't passed: highlight reports may still be coming in. Create the pack anyway?",
                  )
                )
                  void createPack(true);
              } else void createPack();
            }}
          >
            <FilePlus2 className="mr-1 size-3.5" /> Create pack
            {meeting ? ` for ${formatDate(meeting.meetingDate)}` : ""}
          </Button>
        </div>
      </div>
      {beforeCutoff && (
        <p className="text-xs text-muted-foreground">
          Packs open after the papers deadline ({formatDate(meeting!.papersDeadline)}), when the
          period's highlight reports are in.
          {isPmo && " PMO can create one earlier."}
        </p>
      )}
      {packs.length ? (
        <ul className="divide-y text-sm">
          {packs.map((pack) => (
            <li key={pack.id} className="flex flex-wrap items-center gap-2 py-2">
              <Link
                to={
                  pack.status === "draft" || pack.status === "in_review"
                    ? "/governance/reports/$reportId/edit"
                    : "/governance/reports/$reportId"
                }
                params={{ reportId: pack.id }}
                className="font-medium text-primary hover:underline"
              >
                {pack.title}
              </Link>
              <Badge variant={pack.status === "published" ? "default" : "outline"}>
                {STATUS_LABEL[pack.status]}
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                as at {formatDate(pack.asAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No packs yet.</p>
      )}
      {settings && (
        <ForumSettingsSheet open={open} onOpenChange={setOpen} forum={forum} settings={settings} />
      )}
    </section>
  );
}

function ForumSettingsSheet({
  open,
  onOpenChange,
  forum,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forum: ForumItem;
  settings: ForumReporting;
}) {
  const schemes = useRatingSchemes();
  const matrices = useRiskMatrices();
  const templates = useTemplates();
  const forums = useForums();
  const members = useForumMembers(forum.id);
  const projects = useProjectNames();
  const programmes = useProgrammeNames();
  const portfolios = usePortfolioNames();
  const collections = useCollections();
  const { update, setRole } = useForumReportingMutations();
  const [form, setForm] = useState(() => ({
    forumType: (settings.forumType ?? "custom") as ForumType,
    description: settings.description ?? "",
    scopeType: (settings.scopeType ?? "") as ScopeType | "",
    scopeEntityId: settings.scopeEntityId ?? "",
    ratingSchemeId: settings.ratingSchemeId ?? "",
    defaultTemplateId: settings.defaultTemplateId ?? "",
    parentForumId: settings.parentForumId ?? "",
    approvalRequired: settings.approvalRequired,
    autoCreatePacks: settings.autoCreatePacks,
    visibility: settings.publishedPackVisibility,
    riskMatrixId: settings.riskMatrixId ?? "",
    tolerances: settings.tolerances as Tolerances,
  }));
  const entities =
    form.scopeType === "project"
      ? (projects.data ?? []).map((p) => ({ id: p.id, name: `${p.code} ${p.name}` }))
      : form.scopeType === "programme"
        ? (programmes.data ?? []).map((p) => ({ id: p.id, name: p.name }))
        : form.scopeType === "portfolio"
          ? (portfolios.data ?? []).map((p) => ({ id: p.id, name: p.name }))
          : form.scopeType === "collection"
            ? (collections.data ?? []).map((c) => ({ id: c.id, name: c.name }))
            : [];
  const tolValue = (key: string) => {
    const t = form.tolerances[key];
    return t !== null && typeof t === "object" ? t.value : t;
  };
  const toleranceKeys = Object.keys({ ...DEFAULT_TOLERANCES[form.forumType], ...form.tolerances });
  const save = async () => {
    try {
      await update.mutateAsync({
        forumId: forum.id,
        lastSeen: settings.updatedAt,
        patch: {
          forum_type: form.forumType,
          description: form.description || null,
          scope_type: form.scopeType || null,
          scope_entity_id:
            form.scopeType && form.scopeType !== "custom" ? form.scopeEntityId || null : null,
          rating_scheme_id: form.ratingSchemeId || null,
          default_template_id: form.defaultTemplateId || null,
          parent_forum_id: form.parentForumId || null,
          approval_required: form.approvalRequired,
          auto_create_packs: form.autoCreatePacks,
          published_pack_visibility: form.visibility,
          risk_matrix_id: form.riskMatrixId || null,
          tolerances: form.tolerances,
        },
      });
      toast.success("Report settings saved");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Report settings · {forum.name}</SheetTitle>
          <SheetDescription>
            How this forum's packs are built: scope, rating scheme, tolerances and template.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="fs-type">Forum type</Label>
              <select
                id="fs-type"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.forumType}
                onChange={(e) => setForm({ ...form, forumType: e.target.value as ForumType })}
              >
                {Object.entries(FORUM_TYPE_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="fs-scheme">Rating scheme</Label>
              <select
                id="fs-scheme"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.ratingSchemeId}
                onChange={(e) => setForm({ ...form, ratingSchemeId: e.target.value })}
              >
                <option value="">RAG (default)</option>
                {(schemes.data ?? []).map((s) => (
                  <option key={s.id ?? s.key} value={s.id ?? ""}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-desc">Description</Label>
            <Textarea
              id="fs-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-scope">Scope</Label>
            <div className="flex gap-2">
              <select
                id="fs-scope"
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={form.scopeType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    scopeType: e.target.value as ScopeType | "",
                    scopeEntityId: "",
                  })
                }
              >
                <option value="">Not set</option>
                <option value="project">Project</option>
                <option value="programme">Programme</option>
                <option value="portfolio">Portfolio</option>
                <option value="collection">Collection</option>
              </select>
              {form.scopeType && (
                <select
                  aria-label="Scope item"
                  className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                  value={form.scopeEntityId}
                  onChange={(e) => setForm({ ...form, scopeEntityId: e.target.value })}
                >
                  <option value="">Choose…</option>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-template">Default template</Label>
            <select
              id="fs-template"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={form.defaultTemplateId}
              onChange={(e) => setForm({ ...form, defaultTemplateId: e.target.value })}
            >
              <option value="">None (ad hoc)</option>
              {(templates.data ?? [])
                .filter((t) => !t.archivedAt)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isSystem ? " (system)" : ""}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-parent">Escalates to</Label>
            <select
              id="fs-parent"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={form.parentForumId}
              onChange={(e) => setForm({ ...form, parentForumId: e.target.value })}
            >
              <option value="">None</option>
              {(forums.data ?? [])
                .filter((f) => f.id !== forum.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="fs-approval">Chair approves packs before publishing</Label>
            <Switch
              id="fs-approval"
              checked={form.approvalRequired}
              onCheckedChange={(approvalRequired) => setForm({ ...form, approvalRequired })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-visibility">Who can read published packs</Label>
            <select
              id="fs-visibility"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={form.visibility}
              onChange={(e) =>
                setForm({ ...form, visibility: e.target.value as "members" | "organisation" })
              }
            >
              <option value="members">Forum members only</option>
              <option value="organisation">Everyone in the organisation</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Packs may contain sensitive material (finances, people, risks, decisions in progress).
              PMO, the chair and the secretary always see them; drafts are never shared.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fs-matrix">Risk matrix for this forum's packs</Label>
            <select
              id="fs-matrix"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={form.riskMatrixId}
              onChange={(e) => setForm({ ...form, riskMatrixId: e.target.value })}
            >
              <option value="">The default (the same scoring as the risk register)</option>
              {(matrices.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.organisationId ? " (your organisation)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Your organisation's own matrices can be used here, but can't become the organisation
              default yet: the risk register still scores from Settings › Risk, so reports and the
              register would score the same risk differently.
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="fs-auto">
              Draft the pack automatically when the papers deadline passes
            </Label>
            <Switch
              id="fs-auto"
              checked={form.autoCreatePacks}
              onCheckedChange={(autoCreatePacks) => setForm({ ...form, autoCreatePacks })}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Tolerances (exception thresholds)</legend>
            {toleranceKeys.map((key) => {
              const metric = getMetric(key);
              return (
                <div key={key} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1">{metric?.label ?? key}</span>
                  <Input
                    type="number"
                    className="h-8 w-24"
                    aria-label={`${metric?.label ?? key} tolerance`}
                    value={String(tolValue(key) ?? "")}
                    placeholder={String(
                      (DEFAULT_TOLERANCES[form.forumType][key] as { value: number } | undefined)
                        ?.value ?? "",
                    )}
                    onChange={(e) => {
                      const next = { ...form.tolerances };
                      if (e.target.value === "") delete next[key];
                      else {
                        const base = DEFAULT_TOLERANCES[form.forumType][key];
                        next[key] = {
                          op: (base && typeof base === "object" && base.op) || ">",
                          value: Number(e.target.value),
                        };
                      }
                      setForm({ ...form, tolerances: next });
                    }}
                  />
                  <span className="w-10 text-xs text-muted-foreground">{metric?.unit ?? ""}</span>
                </div>
              );
            })}
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setForm({ ...form, tolerances: { ...DEFAULT_TOLERANCES[form.forumType] } })
              }
            >
              Use the defaults for a {FORUM_TYPE_LABEL[form.forumType].toLowerCase()}
            </Button>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Member roles</legend>
            {(members.data ?? []).map((m) => (
              <div key={m.resourceId} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <select
                  aria-label={`${m.name} role`}
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={m.role ?? "member"}
                  onChange={(e) =>
                    setRole.mutate(
                      { forumId: forum.id, resourceId: m.resourceId, role: e.target.value },
                      { onError: (err) => toast.error(errorMessage(err)) },
                    )
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Packs go to every member except contributors. Chairs approve; secretaries publish;
              contributors write content.
            </p>
          </fieldset>
          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={update.isPending}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
