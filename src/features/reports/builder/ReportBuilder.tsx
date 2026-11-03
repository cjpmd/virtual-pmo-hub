// Report builder (draft): header with title, forum, meeting, scope, as-at and status; library
// and two-zone canvas; inspector, report settings and selection panel. Autosaves after 1 s
// with updated_at conflict detection (spec §9.1).
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, Printer, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useOrgId } from "@/components/auth/organisation-provider";
import {
  inputKey,
  useInclusions,
  useReport,
  useReportContext,
  useReportMutations,
  useReportPermissions,
  useScopeMetrics,
  useTemplate,
} from "@/hooks/use-reports";
import { qk } from "@/services/query-keys";
import {
  acknowledgeAiDraft,
  draftSummaryWithAi,
  latestHighlightSummary,
  updateReportToTemplate,
  toScheme,
  updateReport,
  type ReportInput,
  type ReportRecord,
} from "@/services/reports";
import { errorMessage } from "@/services/service-error";
import { getBlock, newInstance } from "../blocks/registry";
import type { BlockInstance } from "../blocks/types";
import type { SelectionRuleSet } from "../engine/evaluateRules";
import { NarrativeEditingContext, type NarrativeEditing } from "../blocks/narrative-context";
import { BlockInspector, BlockLibrary, BuilderCanvas } from "./BuilderParts";
import { SelectionPanel } from "./SelectionPanel";
import { useAutosave } from "./use-autosave";
import { STATUS_LABEL, ReportLifecycleActions } from "../viewer/ReportLifecycle";
import { useReportFormat } from "../blocks/primitives";

interface Draft {
  title: string;
  asAt: string;
  blocks: BlockInstance[];
  selectionRules: SelectionRuleSet;
  overallRating: string | null;
  overallRatingRationale: string | null;
}

const draftOf = (report: ReportRecord): Draft => ({
  title: report.title,
  asAt: report.asAt,
  blocks: report.blocks,
  selectionRules: report.selectionRules,
  overallRating: report.overallRating,
  overallRatingRationale: report.overallRatingRationale,
});

export function ReportBuilder({ reportId }: { reportId: string }) {
  const report = useReport(reportId);
  if (report.isError) return <p role="alert">{errorMessage(report.error)}</p>;
  if (!report.data) return <div aria-busy className="h-64 animate-pulse rounded-lg bg-muted/50" />;
  return <Builder key={report.data.id} report={report.data} />;
}

function Builder({ report }: { report: ReportRecord }) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const f = useReportFormat();
  const input: ReportInput = useMemo(() => ({ report_id: report.id }), [report.id]);
  const context = useReportContext(input);
  const permissions = useReportPermissions(report.id);
  const metrics = useScopeMetrics(input);
  const inclusions = useInclusions(report.id);
  const mutations = useReportMutations();
  const [draft, setDraft] = useState<Draft>(() => draftOf(report));
  const [lastSeen, setLastSeen] = useState(report.updatedAt);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("block");
  const editable =
    !!permissions.data?.can_edit && (report.status === "draft" || report.status === "in_review");

  const invalidateLive = () =>
    queryClient.invalidateQueries({ queryKey: qk.reports.live(orgId, inputKey(input)) });

  const autosave = useAutosave(
    draft,
    async (value) => {
      const written = await updateReport(
        report.id,
        {
          title: value.title,
          as_at: value.asAt,
          blocks: value.blocks,
          selection_rules: value.selectionRules,
          overall_rating: value.overallRating,
          overall_rating_rationale: value.overallRatingRationale,
        },
        lastSeen,
      );
      if (written.updatedAt) setLastSeen(written.updatedAt);
      if (
        value.asAt !== report.asAt ||
        value.title !== report.title ||
        value.overallRating !== report.overallRating
      )
        await invalidateLive();
      await queryClient.invalidateQueries({ queryKey: qk.reports.list(orgId) });
    },
    { enabled: editable },
  );

  const scheme = toScheme(context.data?.scheme ?? null);
  const tolerances = context.data?.forum?.tolerances ?? {};
  const metricRows = metrics.data ?? [];
  const byId = new Map(metricRows.map((row) => [row.project_id, row]));
  const deepDives = (inclusions.data ?? [])
    .filter((row) => row.mode !== "excluded")
    .map((row) => ({
      id: row.entityId,
      code: byId.get(row.entityId)?.code ?? "",
      name: byId.get(row.entityId)?.name ?? "",
      reasons: row.reasons,
      mode: row.mode as "rule" | "pinned",
    }));
  const sampleProjectId = deepDives[0]?.id ?? context.data?.project_ids[0] ?? null;
  const selected = draft.blocks.find((b) => b.id === selectedId) ?? null;

  useEffect(() => {
    if (selected) setTab("block");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const narrativeEditing: NarrativeEditing = {
    save: async (vars) => {
      await mutations.saveNarrative.mutateAsync({ reportId: report.id, ...vars });
    },
    draftWithAi: async (blockInstanceId) => {
      const result = await draftSummaryWithAi(report.id, blockInstanceId);
      await invalidateLive();
      await mutations.invalidateReport(report.id);
      toast.success(`AI draft added (${result.model}). Review it before submitting.`);
    },
    acknowledgeAi: async (narrativeId) => {
      try {
        await acknowledgeAiDraft(narrativeId);
        await invalidateLive();
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    pmSummary: async (entityId) => {
      const projectId = entityId ?? (report.scopeType === "project" ? report.scopeEntityId : null);
      return projectId ? latestHighlightSummary(projectId, draft.asAt) : null;
    },
  };

  const scopeLevel = report.scopeType;
  const saveLabel =
    autosave.status === "saving" || autosave.status === "pending"
      ? "Saving…"
      : autosave.status === "saved"
        ? "Saved"
        : autosave.status === "error"
          ? "Not saved"
          : autosave.status === "conflict"
            ? "Changed elsewhere"
            : "";

  return (
    <NarrativeEditingContext.Provider value={editable ? narrativeEditing : null}>
      <div className="space-y-4">
        <div className="sticky top-14 z-20 -mx-4 space-y-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Report title"
              className="h-9 max-w-md flex-1 font-semibold"
              value={draft.title}
              disabled={!editable}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
            <Badge variant="outline">{STATUS_LABEL[report.status]}</Badge>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {saveLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {context.data?.forum && <span>Forum: {context.data.forum.name}</span>}
            {context.data?.meeting && (
              <span>Meeting: {f.date(context.data.meeting.meeting_date)}</span>
            )}
            <span>
              Scope: {report.scopeType} ({context.data?.project_ids.length ?? "…"} projects)
            </span>
            <label className="flex items-center gap-1">
              As at
              <Input
                type="date"
                className="h-8 w-40"
                value={draft.asAt}
                disabled={!editable}
                onChange={(event) =>
                  event.target.value && setDraft({ ...draft, asAt: event.target.value })
                }
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void invalidateLive()}>
              <RefreshCw className="mr-1 size-3.5" /> Refresh data
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/governance/reports/$reportId" params={{ reportId: report.id }}>
                <Eye className="mr-1 size-3.5" /> Preview
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/governance/reports/$reportId/print" params={{ reportId: report.id }}>
                <Printer className="mr-1 size-3.5" /> Print / PDF
              </Link>
            </Button>
            {permissions.data?.can_save_template && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const name = window.prompt("Template name", draft.title);
                  if (!name) return;
                  try {
                    await mutations.saveAsTemplate.mutateAsync({ reportId: report.id, name });
                    toast.success("Saved as a template");
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                <Save className="mr-1 size-3.5" /> Save as template
              </Button>
            )}
            <ReportLifecycleActions
              report={report}
              permissions={permissions.data ?? null}
              scheme={scheme}
              draft={{ overallRating: draft.overallRating, blocks: draft.blocks }}
              dirty={autosave.dirty}
              onDone={async (event) => {
                await mutations.invalidateReport(report.id);
                if (event === "published")
                  void navigate({
                    to: "/governance/reports/$reportId",
                    params: { reportId: report.id },
                  });
              }}
            />
          </div>
          {autosave.error && (
            <p role="alert" className="text-sm text-health-bad-foreground">
              {autosave.error}{" "}
              {autosave.status === "conflict" && (
                <button
                  type="button"
                  className="underline"
                  onClick={() => window.location.reload()}
                >
                  Reload
                </button>
              )}
            </p>
          )}
          {!editable && permissions.data && (
            <p className="text-sm text-muted-foreground">
              Read-only: you can't edit this report in its current status.
            </p>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <BuilderCanvas
            blocks={draft.blocks}
            onChange={(blocks) => editable && setDraft({ ...draft, blocks })}
            selectedId={selectedId}
            onSelect={setSelectedId}
            sampleProjectId={sampleProjectId}
            libraryScope={scopeLevel}
            library={
              <BlockLibrary
                scope={scopeLevel}
                onAdd={(definition) => {
                  if (!editable) return;
                  const instance = newInstance(
                    definition,
                    "report",
                    draft.blocks.map((b) => b.id),
                  );
                  setDraft({ ...draft, blocks: [...draft.blocks, instance] });
                  setSelectedId(instance.id);
                }}
              />
            }
            preview={{
              scheme,
              asAt: draft.asAt,
              mode: "screen",
              audience: "internal",
              reportId: report.id,
              editable,
              live: input,
              showPartnerPlaceholders: true,
            }}
          />
          <aside className="lg:sticky lg:top-44 lg:max-h-[calc(100vh-12rem)] lg:overflow-auto">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full">
                <TabsTrigger value="block" className="flex-1">
                  Block
                </TabsTrigger>
                <TabsTrigger value="report" className="flex-1">
                  Report
                </TabsTrigger>
                <TabsTrigger value="selection" className="flex-1">
                  Selection
                </TabsTrigger>
              </TabsList>
              <TabsContent value="block" className="pt-3">
                {selected ? (
                  <BlockInspector
                    instance={selected}
                    onChange={(next) =>
                      editable &&
                      setDraft({
                        ...draft,
                        blocks: draft.blocks.map((b) => (b.id === next.id ? next : b)),
                      })
                    }
                    onRemove={() => {
                      if (!editable) return;
                      setDraft({
                        ...draft,
                        blocks: draft.blocks.filter((b) => b.id !== selected.id),
                      });
                      setSelectedId(null);
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select a block on the canvas to configure it.
                  </p>
                )}
              </TabsContent>
              <TabsContent value="report" className="space-y-3 pt-3">
                <div className="space-y-1">
                  <Label htmlFor="overall-rating">Overall rating ({scheme.name})</Label>
                  <select
                    id="overall-rating"
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    disabled={!editable}
                    value={draft.overallRating ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, overallRating: event.target.value || null })
                    }
                  >
                    <option value="">Not set</option>
                    {scheme.levels.map((level) => (
                      <option key={level.key} value={level.key}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                  {scheme.isAssurance && (
                    <p className="text-xs text-muted-foreground">
                      Required before submitting: this forum uses an assurance scheme.
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="overall-rationale">Rationale</Label>
                  <Textarea
                    id="overall-rationale"
                    rows={5}
                    disabled={!editable}
                    value={draft.overallRatingRationale ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, overallRatingRationale: event.target.value || null })
                    }
                  />
                </div>
                {report.templateId && (
                  <TemplateVersion
                    templateId={report.templateId}
                    version={report.templateVersion}
                    canUpdate={editable && report.status === "draft" && !autosave.dirty}
                    onUpdate={async () => {
                      if (
                        !window.confirm(
                          "Replace this draft's blocks and rules with the template's latest version? Narratives are kept for blocks that remain.",
                        )
                      )
                        return;
                      try {
                        await updateReportToTemplate(report.id);
                        window.location.reload();
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                  />
                )}
              </TabsContent>
              <TabsContent value="selection" className="pt-3">
                <SelectionPanel
                  ruleSet={draft.selectionRules}
                  onRulesChange={(selectionRules) =>
                    editable && setDraft({ ...draft, selectionRules })
                  }
                  tolerances={tolerances}
                  metrics={metricRows}
                  inclusions={inclusions.data ?? []}
                  editable={editable}
                  saved={!autosave.dirty}
                  refreshing={mutations.refreshSelection.isPending}
                  onRefresh={async () => {
                    try {
                      await mutations.refreshSelection.mutateAsync(report.id);
                      await invalidateLive();
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                  onSetMode={async (entityId, mode) => {
                    try {
                      await mutations.setInclusion.mutateAsync({
                        reportId: report.id,
                        entityId,
                        mode,
                      });
                      await invalidateLive();
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                  onReorder={async (entityIds) => {
                    try {
                      await mutations.reorder.mutateAsync({ reportId: report.id, entityIds });
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                />
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      </div>
    </NarrativeEditingContext.Provider>
  );
}

/** Which template version the report used, and "Update to latest" when the template moved on. */
function TemplateVersion({
  templateId,
  version,
  canUpdate,
  onUpdate,
}: {
  templateId: string;
  version: number | null;
  canUpdate: boolean;
  onUpdate: () => void;
}) {
  const template = useTemplate(templateId);
  const latest = template.data?.version ?? null;
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p>
        From “{template.data?.name ?? "template"}” version {version ?? "—"}
        {latest !== null && version !== null && latest > version && ` (latest is ${latest})`}.
      </p>
      {latest !== null && version !== null && latest > version && canUpdate && (
        <Button size="sm" variant="outline" onClick={onUpdate}>
          Update report to latest template
        </Button>
      )}
    </div>
  );
}

/** Blocks a definition can't render in this scope (for warnings). */
export const unsupportedBlocks = (blocks: BlockInstance[], scope: ReportRecord["scopeType"]) =>
  blocks.filter((b) => {
    const definition = getBlock(b.blockKey);
    return definition && !definition.supportedScopes.includes(scope);
  });
