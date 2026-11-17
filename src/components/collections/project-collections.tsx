// GL-22: the collections a project belongs to, on the project header. PMO and admins in the
// project's workspace add it to or remove it from that workspace's active collections.
import { Link } from "@tanstack/react-router";
import { Layers3, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { useCollectionMutations, useCollections } from "@/hooks/use-collections";
import { collectionsForProject } from "@/services/collections";
import { useCollectionAccess } from "./collection-access";

export function ProjectCollections({
  project,
}: {
  project: { id: string; name: string; workspaceId: string };
}) {
  const collections = useCollections().data ?? [];
  const { canManage, writable } = useCollectionAccess();
  const mutations = useCollectionMutations();
  const { member, editable } = collectionsForProject(collections, project);
  const manage = canManage(project.workspaceId);
  if (!member.length && !(manage && editable.length)) return null;
  const busy = mutations.addProjects.isPending || mutations.removeProject.isPending;
  const toggle = (collectionId: string, name: string, on: boolean) =>
    on
      ? mutations.addProjects.mutate(
          { collectionId, projectIds: [project.id] },
          {
            onSuccess: () => toast.success(`Added to ${name}`),
            onError: (error) => toast.error(error.message),
          },
        )
      : mutations.removeProject.mutate(
          { collectionId, projectId: project.id },
          { onSuccess: () => toast.success(`Removed from ${name}`) },
        );

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="project-collections">
      <span className="text-xs text-pmo-muted">Collections</span>
      {member.map((collection) => (
        <Link
          key={collection.id}
          to="/portfolio/collections/$collectionId"
          params={{ collectionId: collection.id }}
          className="inline-flex items-center gap-1 rounded-full border border-pmo-line bg-pmo-panel-2 px-2.5 py-0.5 text-xs text-pmo-text hover:underline"
        >
          <Layers3 className="size-3" aria-hidden />
          {collection.name}
          {collection.archivedAt && <span className="text-pmo-muted">(archived)</span>}
        </Link>
      ))}
      {!member.length && <span className="text-xs text-pmo-muted">None</span>}
      {manage && editable.length > 0 && (
        <ReadOnlyTip readOnly={!writable}>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                disabled={!writable}
                aria-label="Manage collections"
              >
                <Settings2 className="size-3.5" />
                Manage
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2">
              <p className="px-2 pb-2 text-xs text-muted-foreground">
                Collections in this project&apos;s workspace
              </p>
              <ul className="max-h-64 overflow-y-auto">
                {editable.map((collection) => {
                  const inside = collection.projectIds.includes(project.id);
                  return (
                    <li key={collection.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/60">
                        <Checkbox
                          checked={inside}
                          disabled={busy}
                          onCheckedChange={(on) =>
                            toggle(collection.id, collection.name, on === true)
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {collection.typeLabel}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </PopoverContent>
          </Popover>
        </ReadOnlyTip>
      )}
    </div>
  );
}
