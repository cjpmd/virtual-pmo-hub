// GL-22: New collection / Edit collection (name, type, workspace on create, pot for funding).
import { useEffect, useState, type ReactNode } from "react";
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
import { useCollectionMutations, useCollectionTypes } from "@/hooks/use-collections";
import { currencySymbol } from "@/lib/format";
import {
  isFundingLabel,
  parseAmount,
  validateCollectionDraft,
  type CollectionDraft,
  type CollectionDraftErrors,
  type CollectionView,
} from "@/services/collections";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

export function CollectionFormDialog({
  open,
  onOpenChange,
  collection,
  workspaces,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing this collection; creating a new one when absent. */
  collection?: CollectionView | undefined;
  /** Workspaces the person is PMO in (create only); asked for when there is more than one. */
  workspaces: { id: string; name: string }[];
  onCreated?: (id: string) => void;
}) {
  const types = useCollectionTypes().data ?? [];
  const mutations = useCollectionMutations();
  const [draft, setDraft] = useState<CollectionDraft>({
    name: "",
    typeId: "",
    workspaceId: "",
    pot: "",
  });
  const [errors, setErrors] = useState<CollectionDraftErrors>({});
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft({
      name: collection?.name ?? "",
      typeId: collection?.typeId ?? "",
      workspaceId: collection?.workspaceId ?? (workspaces.length === 1 ? workspaces[0]!.id : ""),
      pot: collection?.potAmount == null ? "" : String(collection.potAmount),
    });
    setErrors({});
    setFailure(null);
    // Reset only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep a type that has since been deactivated in Settings selectable for an existing collection.
  const options =
    collection && !types.some((type) => type.id === collection.typeId)
      ? [{ id: collection.typeId, label: collection.typeLabel }, ...types]
      : types;
  const funding = isFundingLabel(options.find((type) => type.id === draft.typeId)?.label);
  const pending = mutations.create.isPending || mutations.update.isPending;

  const submit = () => {
    const found = validateCollectionDraft(draft, funding);
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    const pot = parseAmount(draft.pot);
    // A non-funding type keeps whatever pot was stored, so switching type back loses nothing.
    const potAmount = funding ? (pot === "invalid" ? null : pot) : (collection?.potAmount ?? null);
    const fields = { name: draft.name, typeId: draft.typeId, potAmount };
    const done = { onError: (error: Error) => setFailure(error.message) };
    if (collection)
      mutations.update.mutate(
        { collection, ...fields },
        {
          ...done,
          onSuccess: () => {
            toast.success("Collection saved");
            onOpenChange(false);
          },
        },
      );
    else
      mutations.create.mutate(
        { ...fields, workspaceId: draft.workspaceId },
        {
          ...done,
          onSuccess: (written) => {
            toast.success("Collection created");
            onOpenChange(false);
            onCreated?.(written.id);
          },
        },
      );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{collection ? "Edit collection" : "New collection"}</DialogTitle>
          <DialogDescription>
            A cross-cutting group of projects for governance, priorities or funding.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field id="collection-name" label="Name" error={errors.name}>
            <Input
              id="collection-name"
              value={draft.name}
              maxLength={200}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Field>
          <Field id="collection-type" label="Type" error={errors.typeId}>
            <select
              id="collection-type"
              className={selectClass}
              value={draft.typeId}
              onChange={(event) => setDraft({ ...draft, typeId: event.target.value })}
            >
              <option value="">Choose a type…</option>
              {options.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>
          {!collection && workspaces.length > 1 && (
            <Field id="collection-workspace" label="Workspace" error={errors.workspaceId}>
              <select
                id="collection-workspace"
                className={selectClass}
                value={draft.workspaceId}
                onChange={(event) => setDraft({ ...draft, workspaceId: event.target.value })}
              >
                <option value="">Choose a workspace…</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {funding && (
            <Field
              id="collection-pot"
              label={`Pot (${currencySymbol()})`}
              error={errors.pot}
              hint="The money available to award from this funding stream. Optional."
            >
              <Input
                id="collection-pot"
                inputMode="decimal"
                value={draft.pot}
                onChange={(event) => setDraft({ ...draft, pot: event.target.value })}
              />
            </Field>
          )}
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {collection ? "Save" : "Create collection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
