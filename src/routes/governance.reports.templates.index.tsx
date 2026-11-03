import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { PageHeader } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTemplateMutations, useTemplates } from "@/hooks/use-reports";
import { useOrgRole } from "@/hooks/use-permissions";
import { atLeast } from "@/services/auth";
import { errorMessage } from "@/services/service-error";
import type { TemplateRecord } from "@/services/reports";
import { FORUM_TYPE_LABEL } from "@/features/reports/engine/defaults";

const title = "Report templates — ORMO PMO",
  description = "Saved block layouts and selection rules for each kind of forum.";

export const Route = createFileRoute("/governance/reports/templates/")({
  head: () => ({ meta: [{ title }, { name: "description", content: description }] }),
  component: Page,
});

function Page() {
  const query = useTemplates();
  const navigate = useNavigate();
  const { create } = useTemplateMutations();
  const canManage = atLeast(useOrgRole(), "pmo");
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Governance · Reports"
        title="Templates"
        description={description}
        actions={
          canManage && (
            <Button
              onClick={async () => {
                try {
                  const written = await create.mutateAsync({
                    name: "New template",
                    scopeType: "any",
                    blocks: [],
                    selectionRules: { mode: "any", rules: [] },
                  });
                  void navigate({
                    to: "/governance/reports/templates/$templateId/edit",
                    params: { templateId: written.id },
                  });
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              <Plus className="mr-1 size-4" /> New template
            </Button>
          )
        }
      />
      <QueryState query={query}>
        {(templates) => <TemplateList templates={templates} canManage={canManage} />}
      </QueryState>
    </div>
  );
}

function TemplateList({
  templates,
  canManage,
}: {
  templates: TemplateRecord[];
  canManage: boolean;
}) {
  const { copy, archive } = useTemplateMutations();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const rows = templates.filter((t) => showArchived || !t.archivedAt);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />{" "}
        Show archived
      </label>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((t) => (
          <li
            key={t.id}
            className="flex flex-col rounded-lg border bg-card p-4"
            data-template={t.name}
          >
            <div className="flex items-start justify-between gap-2">
              <Link
                to="/governance/reports/templates/$templateId/edit"
                params={{ templateId: t.id }}
                className="font-semibold text-primary hover:underline"
              >
                {t.name}
              </Link>
              <div className="flex gap-1">
                {t.isSystem && <Badge variant="secondary">System</Badge>}
                {t.archivedAt && <Badge variant="outline">Archived</Badge>}
              </div>
            </div>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">
              {t.description ?? "No description."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.forumType ? FORUM_TYPE_LABEL[t.forumType] : "Any forum"} · {t.scopeType} scope ·{" "}
              {t.blocks.length} blocks · {t.selectionRules.rules.length} rules · v{t.version}
            </p>
            {canManage && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      const written = await copy.mutateAsync({ template: t });
                      void navigate({
                        to: "/governance/reports/templates/$templateId/edit",
                        params: { templateId: written.id },
                      });
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                >
                  <Copy className="mr-1 size-3.5" /> Copy
                </Button>
                {!t.isSystem && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      archive.mutate({ id: t.id, archived: !t.archivedAt, lastSeen: t.updatedAt })
                    }
                  >
                    {t.archivedAt ? (
                      <ArchiveRestore className="mr-1 size-3.5" />
                    ) : (
                      <Archive className="mr-1 size-3.5" />
                    )}
                    {t.archivedAt ? "Restore" : "Archive"}
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
