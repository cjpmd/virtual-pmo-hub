// GL-22: add and rename the organisation's collection types. They are the Settings › Lists
// "collection types" list (lookup_values), which organisation PMO and admins may change (RLS).
// A rename changes only the label: collections keep their type, and the built-in Funding stream
// keeps its pot and awards (behaviour follows the stored value). Hiding and reordering stay in
// Settings › Lists.
import { useEffect, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCollectionMutations, useCollectionTypes } from "@/hooks/use-collections";
import {
  isFundingType,
  typeNameError,
  type CollectionTypeOption,
  type CollectionView,
} from "@/services/collections";

export function CollectionTypesDialog({
  open,
  onOpenChange,
  collections,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every collection, archived included, to show how many use each type. */
  collections: readonly CollectionView[];
}) {
  const types = useCollectionTypes().data ?? [];
  const mutations = useCollectionMutations();
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setLabel("");
    setError("");
    setEditing(null);
  }, [open]);

  const active = types.filter((type) => type.isActive);
  const uses = (id: string) => collections.filter((c) => c.typeId === id).length;
  const add = () => {
    const problem = typeNameError(label, types);
    setError(problem);
    if (problem) return;
    mutations.addType.mutate(
      { label, types },
      {
        onSuccess: () => {
          toast.success(`${label.trim()} added`);
          setLabel("");
        },
        onError: (failure) => setError(failure.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Collection types</DialogTitle>
          <DialogDescription>
            Add or rename the types people choose for a collection. Renaming keeps every
            collection&apos;s type. Hide or reorder types in Settings › Lists.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-md border" data-testid="collection-types">
          {active.map((type) => (
            <TypeRow
              key={type.id}
              type={type}
              types={types}
              uses={uses(type.id)}
              editing={editing === type.id}
              onEdit={(on) => setEditing(on ? type.id : null)}
            />
          ))}
          {!active.length && (
            <li className="px-3 py-4 text-center text-sm text-muted-foreground">No types yet.</li>
          )}
        </ul>
        <form
          className="grid gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <label htmlFor="collection-type-new" className="text-sm font-medium">
            New type
          </label>
          <div className="flex gap-2">
            <Input
              id="collection-type-new"
              value={label}
              maxLength={80}
              placeholder="e.g. Steering group"
              onChange={(event) => setLabel(event.target.value)}
            />
            <Button type="submit" disabled={mutations.addType.isPending}>
              <Plus className="size-4" />
              Add type
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TypeRow({
  type,
  types,
  uses,
  editing,
  onEdit,
}: {
  type: CollectionTypeOption;
  types: CollectionTypeOption[];
  uses: number;
  editing: boolean;
  onEdit: (on: boolean) => void;
}) {
  const mutations = useCollectionMutations();
  const [label, setLabel] = useState(type.label);
  const [error, setError] = useState("");
  useEffect(() => {
    if (editing) {
      setLabel(type.label);
      setError("");
    }
  }, [editing, type.label]);
  const save = () => {
    if (label.trim() === type.label) return onEdit(false);
    const problem = typeNameError(label, types, type.id);
    setError(problem);
    if (problem) return;
    mutations.renameType.mutate(
      { type, label },
      {
        onSuccess: () => {
          toast.success(`Renamed to ${label.trim()}`);
          onEdit(false);
        },
        onError: (failure) => setError(failure.message),
      },
    );
  };
  const detail = [
    `${uses} collection${uses === 1 ? "" : "s"}`,
    isFundingType(type) ? "pot and awards" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (editing)
    return (
      <li className="grid gap-1 px-3 py-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Input
            aria-label={`New name for ${type.label}`}
            value={label}
            maxLength={80}
            autoFocus
            className="h-8"
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                onEdit(false);
              }
            }}
          />
          <Button
            type="submit"
            size="sm"
            aria-label="Save name"
            disabled={mutations.renameType.isPending}
          >
            <Check className="size-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Cancel"
            onClick={() => onEdit(false)}
          >
            <X className="size-4" />
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </li>
    );
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">{type.label}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Rename ${type.label}`}
        onClick={() => onEdit(true)}
      >
        <Pencil className="size-4" />
      </Button>
    </li>
  );
}
