import { AutoBreadcrumbs } from "@/components/section-nav";
import { formatCompactCurrency } from "@/lib/format";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Landmark, Layers3, Plus, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { useCollectionAccess } from "@/components/collections/collection-access";
import { CollectionFormDialog } from "@/components/collections/collection-form-dialog";
import { PageHeader } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { useCollections } from "@/hooks/use-collections";
import { useProjects } from "@/hooks/use-hierarchy";
import { collectionMetrics } from "@/services/collections";

export const Route = createFileRoute("/portfolio/collections/")({
  head: () => ({
    meta: [
      { title: "Collections — ORMO PMO" },
      { name: "description", content: "Cross-cutting governance, priority and funding views." },
      { property: "og:title", content: "Collections — ORMO PMO" },
      {
        property: "og:description",
        content: "Cross-cutting governance, priority and funding views.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CollectionsPage,
});
const icons = { Governance: Landmark, "Priority set": Layers3, "Funding stream": WalletCards };
const money = formatCompactCurrency;
function CollectionsPage() {
  const query = useCollections(),
    projects = useProjects();
  const { pmoWorkspaces, writable } = useCollectionAccess();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = (query.data ?? []).filter((collection) => collection.archivedAt).length;
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        title="Collections"
        description="Cross-cutting views for governance, strategic priorities and funding streams."
        actions={
          pmoWorkspaces.length > 0 ? (
            <ReadOnlyTip readOnly={!writable}>
              <Button disabled={!writable} onClick={() => setCreating(true)}>
                <Plus className="size-4" />
                New collection
              </Button>
            </ReadOnlyTip>
          ) : undefined
        }
      />
      {archivedCount > 0 && (
        <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} />
          Show archived ({archivedCount})
        </label>
      )}
      <CollectionFormDialog
        open={creating}
        onOpenChange={setCreating}
        workspaces={pmoWorkspaces}
        onCreated={(id) =>
          void navigate({
            to: "/portfolio/collections/$collectionId",
            params: { collectionId: id },
          })
        }
      />
      <QueryState query={query}>
        {(all) => {
          const collections = all.filter((collection) => showArchived || !collection.archivedAt);
          return (
            <div className="grid gap-4 lg:grid-cols-3">
              {collections.map((collection) => {
                const metrics = collectionMetrics(
                    (projects.data ?? []).filter((project) =>
                      collection.projectIds.includes(project.id),
                    ),
                  ),
                  Icon = icons[collection.type];
                return (
                  <Link
                    key={collection.id}
                    to="/portfolio/collections/$collectionId"
                    params={{ collectionId: collection.id }}
                    className="group rounded-lg border border-border/70 bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between">
                      <span className="grid size-10 place-items-center rounded-md bg-accent text-accent-foreground">
                        <Icon className="size-5" />
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
                    </div>
                    <p className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase text-primary">
                      {collection.typeLabel}
                      {collection.archivedAt && <Badge variant="secondary">Archived</Badge>}
                    </p>
                    <h2 className="mt-1 font-display text-xl font-semibold">{collection.name}</h2>
                    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Projects</p>
                        <p className="mt-1 font-semibold">{collection.projectIds.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Budget</p>
                        <p className="mt-1 font-semibold">
                          {collection.potAmount
                            ? money(collection.potAmount)
                            : money(metrics.budget)}
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
              {!collections.length && (
                <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground lg:col-span-3">
                  No collections yet.
                  {pmoWorkspaces.length > 0 && " Use New collection to group projects."}
                </p>
              )}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
