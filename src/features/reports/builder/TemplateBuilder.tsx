// Template builder: the report builder in template mode (spec §9.1). No as-at data or
// narratives; a sample scope chosen here previews the blocks and the rules.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useOrgId } from "@/components/auth/organisation-provider";
import { usePortfolioNames, useProgrammeNames, useProjectNames } from "@/hooks/use-hierarchy";
import { useCollections } from "@/hooks/use-collections";
import {
  useRatingSchemes,
  useRiskMatrices,
  useReportContext,
  useScopeMetrics,
  useTemplate,
  useTemplateMutations,
} from "@/hooks/use-reports";
import { useOrgRole } from "@/hooks/use-permissions";
import { atLeast } from "@/services/auth";
import { errorMessage } from "@/services/service-error";
import {
  toScheme,
  updateTemplate,
  type ReportInput,
  type TemplateRecord,
} from "@/services/reports";
import { newInstance } from "../blocks/registry";
import type { BlockInstance, ScopeLevel } from "../blocks/types";
import { DEFAULT_TOLERANCES, FORUM_TYPE_LABEL, type ForumType } from "../engine/defaults";
import type { SelectionRuleSet } from "../engine/evaluateRules";
import { BlockInspector, BlockLibrary, BuilderCanvas } from "./BuilderParts";
import { SelectionPanel } from "./SelectionPanel";
import { useAutosave } from "./use-autosave";

interface Draft {
  name: string;
  description: string | null;
  forumType: ForumType | null;
  scopeType: TemplateRecord["scopeType"];
  blocks: BlockInstance[];
  selectionRules: SelectionRuleSet;
  ratingSchemeKey: string | null;
  riskMatrixKey: string | null;
}

export function TemplateBuilder({ templateId }: { templateId: string }) {
  const template = useTemplate(templateId);
  if (template.isError) return <p role="alert">{errorMessage(template.error)}</p>;
  if (!template.data)
    return <div aria-busy className="h-64 animate-pulse rounded-lg bg-muted/50" />;
  return <Builder key={template.data.id} template={template.data} />;
}

function Builder({ template }: { template: TemplateRecord }) {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const role = useOrgRole();
  const mutations = useTemplateMutations();
  const schemes = useRatingSchemes();
  const matrices = useRiskMatrices();
  const editable = !template.isSystem && atLeast(role, "pmo");
  const [draft, setDraft] = useState<Draft>({
    name: template.name,
    description: template.description,
    forumType: template.forumType,
    scopeType: template.scopeType,
    blocks: template.blocks,
    selectionRules: template.selectionRules,
    ratingSchemeKey: template.ratingSchemeKey,
    riskMatrixKey: template.riskMatrixKey,
  });
  const [lastSeen, setLastSeen] = useState(template.updatedAt);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sample, setSample] = useState<{ type: ScopeLevel; id: string }>({
    type:
      template.scopeType === "any" || template.scopeType === "custom"
        ? "programme"
        : template.scopeType,
    id: "",
  });
  const projects = useProjectNames();
  const programmes = useProgrammeNames();
  const portfolios = usePortfolioNames();
  const collections = useCollections();
  const options =
    sample.type === "project"
      ? (projects.data ?? []).map((p) => ({ id: p.id, name: `${p.code} ${p.name}` }))
      : sample.type === "programme"
        ? (programmes.data ?? []).map((p) => ({ id: p.id, name: p.name }))
        : sample.type === "collection"
          ? (collections.data ?? []).map((c) => ({ id: c.id, name: c.name }))
          : (portfolios.data ?? []).map((p) => ({ id: p.id, name: p.name }));
  const input: ReportInput | null = useMemo(
    () =>
      sample.id
        ? {
            organisation_id: orgId,
            scope_type: sample.type,
            scope_entity_id: sample.id,
            rating_scheme_key: draft.ratingSchemeKey,
            template_id: template.id,
            title: draft.name,
          }
        : null,
    [orgId, sample, draft.ratingSchemeKey, draft.name, template.id],
  );
  const context = useReportContext(input);
  const metrics = useScopeMetrics(input);
  const autosave = useAutosave(
    draft,
    async (value) => {
      const written = await updateTemplate(template.id, value, lastSeen);
      if (written.updatedAt) setLastSeen(written.updatedAt);
    },
    { enabled: editable },
  );
  const scheme = toScheme(context.data?.scheme ?? null);
  const selected = draft.blocks.find((b) => b.id === selectedId) ?? null;
  const tolerances = draft.forumType ? DEFAULT_TOLERANCES[draft.forumType] : {};
  const sampleProject = (metrics.data ?? [])[0]?.project_id ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b pb-3">
        <Input
          aria-label="Template name"
          className="h-9 max-w-md flex-1 font-semibold"
          value={draft.name}
          disabled={!editable}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        {template.isSystem && <Badge variant="secondary">System template</Badge>}
        <Badge variant="outline">Version {template.version}</Badge>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {autosave.status === "saving" || autosave.status === "pending"
            ? "Saving…"
            : autosave.status === "saved"
              ? "Saved"
              : ""}
        </span>
        {!editable && (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const written = await mutations.copy.mutateAsync({ template });
                toast.success("Copied to your organisation's templates");
                void navigate({
                  to: "/governance/reports/templates/$templateId/edit",
                  params: { templateId: written.id },
                });
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            <Copy className="mr-1 size-3.5" /> Copy to edit
          </Button>
        )}
        <Button size="sm" variant="ghost" asChild>
          <Link to="/governance/reports/templates">Back to templates</Link>
        </Button>
      </div>
      {autosave.error && (
        <p role="alert" className="text-sm text-health-bad-foreground">
          {autosave.error}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <div className="space-y-1">
          <Label htmlFor="t-forum-type">Forum type</Label>
          <select
            id="t-forum-type"
            className="h-9 rounded-md border bg-background px-2"
            disabled={!editable}
            value={draft.forumType ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, forumType: (e.target.value || null) as ForumType | null })
            }
          >
            <option value="">Any</option>
            {Object.entries(FORUM_TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-scope">Scope</Label>
          <select
            id="t-scope"
            className="h-9 rounded-md border bg-background px-2"
            disabled={!editable}
            value={draft.scopeType}
            onChange={(e) =>
              setDraft({ ...draft, scopeType: e.target.value as Draft["scopeType"] })
            }
          >
            {["any", "project", "programme", "portfolio", "collection", "custom"].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-scheme">Rating scheme</Label>
          <select
            id="t-scheme"
            className="h-9 rounded-md border bg-background px-2"
            disabled={!editable}
            value={draft.ratingSchemeKey ?? ""}
            onChange={(e) => setDraft({ ...draft, ratingSchemeKey: e.target.value || null })}
          >
            <option value="">The forum's</option>
            {(schemes.data ?? []).map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-matrix">Risk matrix</Label>
          <select
            id="t-matrix"
            className="h-9 rounded-md border bg-background px-2"
            disabled={!editable}
            value={draft.riskMatrixKey ?? ""}
            title="Organisation matrices can be chosen here or on a forum; they can't be the organisation default while the register scores from Settings › Risk."
            onChange={(e) => setDraft({ ...draft, riskMatrixKey: e.target.value || null })}
          >
            <option value="">The forum's, else the default</option>
            {[...new Map((matrices.data ?? []).map((m) => [m.key, m])).values()].map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="t-sample">Preview with</Label>
          <div className="flex gap-1">
            <select
              aria-label="Sample scope type"
              className="h-9 rounded-md border bg-background px-2"
              value={sample.type}
              onChange={(e) => setSample({ type: e.target.value as ScopeLevel, id: "" })}
            >
              <option value="project">Project</option>
              <option value="programme">Programme</option>
              <option value="portfolio">Portfolio</option>
              <option value="collection">Collection</option>
            </select>
            <select
              id="t-sample"
              className="h-9 max-w-56 rounded-md border bg-background px-2"
              value={sample.id}
              onChange={(e) => setSample({ ...sample, id: e.target.value })}
            >
              <option value="">No preview</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="t-desc">Description</Label>
        <Textarea
          id="t-desc"
          rows={2}
          disabled={!editable}
          value={draft.description ?? ""}
          onChange={(e) => setDraft({ ...draft, description: e.target.value || null })}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <BuilderCanvas
          blocks={draft.blocks}
          onChange={(blocks) => editable && setDraft({ ...draft, blocks })}
          selectedId={selectedId}
          onSelect={setSelectedId}
          sampleProjectId={sampleProject}
          libraryScope={draft.scopeType === "any" ? "any" : draft.scopeType}
          library={
            <BlockLibrary
              scope={draft.scopeType === "any" ? "any" : draft.scopeType}
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
          preview={
            input
              ? {
                  scheme,
                  asAt: context.data?.as_at ?? "",
                  mode: "screen",
                  audience: "internal",
                  reportId: null,
                  editable: false,
                  live: input,
                  showPartnerPlaceholders: true,
                }
              : null
          }
        />
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
          <Tabs defaultValue="block">
            <TabsList className="w-full">
              <TabsTrigger value="block" className="flex-1">
                Block
              </TabsTrigger>
              <TabsTrigger value="selection" className="flex-1">
                Selection rules
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
                <p className="text-sm text-muted-foreground">Select a block to configure it.</p>
              )}
            </TabsContent>
            <TabsContent value="selection" className="pt-3">
              <SelectionPanel
                ruleSet={draft.selectionRules}
                onRulesChange={(selectionRules) =>
                  editable && setDraft({ ...draft, selectionRules })
                }
                tolerances={tolerances}
                metrics={metrics.data ?? []}
                inclusions={null}
                editable={editable}
                saved
              />
              {!input && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Pick a sample scope to see which projects the rules select.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
