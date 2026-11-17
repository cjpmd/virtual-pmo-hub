// GL-22: Edit, Manage projects and the ⋯ menu (Archive / Restore / Delete) on a collection page.
// A collection with published packs is archived, not deleted; otherwise Delete asks for the
// collection's name. The database refuses a delete that any report or forum depends on
// ('collection_in_use'), including drafts the person can't see, and the dialog then offers Archive.
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Archive, MoreHorizontal, Pencil, RotateCcw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { useCollectionMutations } from "@/hooks/use-collections";
import { confirmsName, isInUse, removalMode, type CollectionView } from "@/services/collections";
import type { ProjectSummary } from "@/services/hierarchy";
import { CollectionFormDialog } from "./collection-form-dialog";
import { CollectionProjectsDialog } from "./collection-projects-dialog";

export function CollectionActions({
  collection,
  projects,
  publishedReports,
  writable,
}: {
  collection: CollectionView;
  projects: ProjectSummary[];
  /** Published reports scoped to this collection that the person can see. */
  publishedReports: number;
  writable: boolean;
}) {
  const mutations = useCollectionMutations();
  const [editing, setEditing] = useState(false);
  const [managing, setManaging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const archived = !!collection.archivedAt;
  const setArchived = (on: boolean) =>
    mutations.setArchived.mutate(
      { collection, archived: on },
      { onSuccess: () => toast.success(on ? "Collection archived" : "Collection restored") },
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!archived && (
        <>
          <ReadOnlyTip readOnly={!writable}>
            <Button variant="outline" disabled={!writable} onClick={() => setManaging(true)}>
              <Users className="size-4" />
              Manage projects
            </Button>
          </ReadOnlyTip>
          <ReadOnlyTip readOnly={!writable}>
            <Button variant="outline" disabled={!writable} onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Edit
            </Button>
          </ReadOnlyTip>
        </>
      )}
      <ReadOnlyTip readOnly={!writable}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" disabled={!writable} aria-label="More actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {archived ? (
              <DropdownMenuItem onSelect={() => setArchived(false)}>
                <RotateCcw className="size-4" />
                Restore collection
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => setArchived(true)}>
                <Archive className="size-4" />
                Archive collection
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onSelect={() => setRemoving(true)}>
              <Trash2 className="size-4" />
              Delete collection…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ReadOnlyTip>
      <CollectionFormDialog
        open={editing}
        onOpenChange={setEditing}
        collection={collection}
        workspaces={[]}
      />
      <CollectionProjectsDialog
        open={managing}
        onOpenChange={setManaging}
        collection={collection}
        projects={projects}
      />
      <DeleteCollectionDialog
        open={removing}
        onOpenChange={setRemoving}
        collection={collection}
        publishedReports={publishedReports}
      />
    </div>
  );
}

function DeleteCollectionDialog({
  open,
  onOpenChange,
  collection,
  publishedReports,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: CollectionView;
  publishedReports: number;
}) {
  const mutations = useCollectionMutations();
  const navigate = useNavigate();
  const [typed, setTyped] = useState("");
  const [inUse, setInUse] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setTyped("");
    setInUse(null);
    setFailure(null);
  }, [open]);
  const archived = !!collection.archivedAt;
  const mode = inUse ? "archive" : removalMode(publishedReports);

  const archive = () =>
    mutations.setArchived.mutate(
      { collection, archived: true },
      {
        onSuccess: () => {
          toast.success("Collection archived");
          onOpenChange(false);
        },
      },
    );
  const remove = () =>
    mutations.remove.mutate(collection.id, {
      onSuccess: () => {
        toast.success("Collection deleted");
        onOpenChange(false);
        void navigate({ to: "/portfolio/collections" });
      },
      onError: (error) => {
        if (isInUse(error)) setInUse(error.message);
        else setFailure(error.message);
      },
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {mode === "archive" ? (
          <>
            <DialogHeader>
              <DialogTitle>This collection can&apos;t be deleted</DialogTitle>
              <DialogDescription>
                {inUse ??
                  `${publishedReports} published report${publishedReports === 1 ? " is" : "s are"} scoped to “${collection.name}”.`}{" "}
                Reports and forums keep pointing at it, so it is archived instead: it stays readable
                with its reports, can&apos;t be changed, and an admin or PMO can restore it.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {!archived && (
                <Button onClick={archive} disabled={mutations.setArchived.isPending}>
                  <Archive className="size-4" />
                  Archive instead
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Delete collection</DialogTitle>
              <DialogDescription>
                “{collection.name}” and its list of projects will be deleted. The projects
                themselves aren&apos;t changed. This can&apos;t be undone.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                if (confirmsName(typed, collection.name)) remove();
              }}
            >
              <Label htmlFor="collection-delete-confirm">
                Type the collection&apos;s name to confirm
              </Label>
              <Input
                id="collection-delete-confirm"
                autoComplete="off"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
              {failure && (
                <p role="alert" className="text-sm text-destructive">
                  {failure}
                </p>
              )}
              <DialogFooter className="mt-3">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={!confirmsName(typed, collection.name) || mutations.remove.isPending}
                >
                  <Trash2 className="size-4" />
                  Delete collection
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
