// GL-22: a collection's projects. Add from a searchable list of the collection's workspace
// projects, remove, and (funding streams) set each project's award.
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SampleBadge } from "@/components/sample-badge";
import { useCollectionMutations } from "@/hooks/use-collections";
import { currencySymbol } from "@/lib/format";
import {
  FUNDING_TYPE,
  parseAmount,
  pickerCandidates,
  type CollectionView,
} from "@/services/collections";
import type { ProjectSummary } from "@/services/hierarchy";

/** How many matches the picker lists at once; searching narrows it. */
const PICKER_LIMIT = 50;

export function CollectionProjectsDialog({
  open,
  onOpenChange,
  collection,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: CollectionView;
  /** Every non-archived project the person can see. */
  projects: ProjectSummary[];
}) {
  const mutations = useCollectionMutations();
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setChosen(new Set());
    setFailure(null);
  }, [open]);

  const funding = collection.type === FUNDING_TYPE;
  const candidates = pickerCandidates(projects, collection, search);
  const members = projects
    .filter((project) => collection.projectIds.includes(project.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const hidden = collection.projectIds.length - members.length;

  const toggle = (id: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const add = () =>
    mutations.addProjects.mutate(
      { collectionId: collection.id, projectIds: [...chosen] },
      {
        onSuccess: () => {
          toast.success(chosen.size === 1 ? "Project added" : `${chosen.size} projects added`);
          setChosen(new Set());
          setFailure(null);
        },
        onError: (error) => setFailure(error.message),
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Projects in {collection.name}</DialogTitle>
          <DialogDescription>
            Add projects from this collection&apos;s workspace, or remove them.
            {funding && " Awards are what each project draws from the pot."}
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="collection-add-heading" className="grid gap-2">
          <h3 id="collection-add-heading" className="text-sm font-semibold">
            Add projects
          </h3>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              aria-label="Search projects"
              placeholder="Search by name or code"
              className="pl-8"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <ul
            className="max-h-56 divide-y overflow-y-auto rounded-md border"
            data-testid="collection-picker"
          >
            {candidates.slice(0, PICKER_LIMIT).map((project) => (
              <li key={project.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                  <Checkbox
                    checked={chosen.has(project.id)}
                    onCheckedChange={(on) => toggle(project.id, on === true)}
                    aria-label={`Add ${project.name}`}
                  />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <SampleBadge kind="project" id={project.id} />
                  <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
                  <span className="text-xs text-muted-foreground">{project.state}</span>
                </label>
              </li>
            ))}
            {!candidates.length && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                {search
                  ? "No projects match."
                  : "Every project in this workspace is already in it."}
              </li>
            )}
          </ul>
          {candidates.length > PICKER_LIMIT && (
            <p className="text-xs text-muted-foreground">
              Showing {PICKER_LIMIT} of {candidates.length}; search to narrow the list.
            </p>
          )}
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!chosen.size || mutations.addProjects.isPending}
              onClick={add}
            >
              {chosen.size > 1 ? `Add ${chosen.size} projects` : "Add project"}
            </Button>
          </div>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
        </section>

        <section aria-labelledby="collection-members-heading" className="grid gap-2">
          <h3 id="collection-members-heading" className="text-sm font-semibold">
            In this collection ({members.length})
          </h3>
          <ul
            className="max-h-72 divide-y overflow-y-auto rounded-md border"
            data-testid="collection-members"
          >
            {members.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <SampleBadge kind="project" id={project.id} />
                <span className="font-mono text-xs text-muted-foreground">{project.code}</span>
                {funding && (
                  <AwardInput
                    collectionId={collection.id}
                    projectId={project.id}
                    projectName={project.name}
                    amount={collection.awards[project.id] ?? null}
                  />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${project.name}`}
                  disabled={mutations.removeProject.isPending}
                  onClick={() =>
                    mutations.removeProject.mutate(
                      { collectionId: collection.id, projectId: project.id },
                      { onSuccess: () => toast.success(`${project.name} removed`) },
                    )
                  }
                >
                  <X className="size-4" />
                  Remove
                </Button>
              </li>
            ))}
            {!members.length && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                No projects yet.
              </li>
            )}
          </ul>
          {hidden > 0 && (
            <p className="text-xs text-muted-foreground">
              {hidden} archived project{hidden === 1 ? " is" : "s are"} still linked and not shown.
            </p>
          )}
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Award for one project: saved when the field loses focus, if it changed and is valid. */
function AwardInput({
  collectionId,
  projectId,
  projectName,
  amount,
}: {
  collectionId: string;
  projectId: string;
  projectName: string;
  amount: number | null;
}) {
  const mutations = useCollectionMutations();
  const [text, setText] = useState(amount == null ? "" : String(amount));
  const [error, setError] = useState(false);
  useEffect(() => setText(amount == null ? "" : String(amount)), [amount]);
  const save = () => {
    const value = parseAmount(text);
    if (value === "invalid") return setError(true);
    setError(false);
    if (value === amount) return;
    mutations.setAward.mutate(
      { collectionId, projectId, amount: value },
      { onSuccess: () => toast.success(`Award saved for ${projectName}`) },
    );
  };
  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{currencySymbol()}</span>
      <Input
        aria-label={`Award for ${projectName}`}
        aria-invalid={error || undefined}
        inputMode="decimal"
        placeholder="Award"
        className={`h-8 w-32 ${error ? "border-destructive" : ""}`}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
      />
    </span>
  );
}
