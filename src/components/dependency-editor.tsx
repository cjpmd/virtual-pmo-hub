import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { X, Trash2 } from "lucide-react";
import type { Dependency, DependencyType } from "@/data/types";
import { buildDependencyGraph, nodeForEnd, type GraphNode } from "@/services/dependency-graph";
import type { DependenciesData, EndInput, ResolvedDependency } from "@/services/dependencies";
import { useDependencyMutations } from "@/hooks/use-dependencies";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { useCan } from "@/hooks/use-permissions";
import { todayIso } from "@/lib/today";

const kinds: DependencyType[] = ["Sequencing", "Alignment", "Information", "Resource", "External"];
/** Every endpoint a dependency can use: programmes, projects, their milestones and known external parties. */
function options(data: DependenciesData): GraphNode[] {
  const graph = buildDependencyGraph(data.dependencies, "milestone");
  const nodes = new Map([...graph.nodes].filter(([, node]) => node.kind === "External"));
  const programmeName = new Map(data.programmes.map((programme) => [programme.id, programme.name]));
  data.programmes.forEach((programme) =>
    nodes.set(`programme:${programme.id}`, {
      id: `programme:${programme.id}`,
      label: programme.name,
      sublabel: "Programme",
      kind: "Programme",
      programmeId: programme.id,
    }),
  );
  data.projects.forEach((project) => {
    nodes.set(`project:${project.id}`, {
      id: `project:${project.id}`,
      label: project.name,
      sublabel: programmeName.get(project.programmeId ?? "") ?? "Project",
      kind: "Project",
      projectId: project.id,
      ...(project.programmeId ? { programmeId: project.programmeId } : {}),
    });
    project.milestones.forEach((milestone) =>
      nodes.set(`milestone:${project.id}:${milestone.id}`, {
        id: `milestone:${project.id}:${milestone.id}`,
        label: milestone.title,
        sublabel: project.name,
        kind: "Milestone",
        projectId: project.id,
        ...(project.programmeId ? { programmeId: project.programmeId } : {}),
      }),
    );
  });
  return Array.from(nodes.values()).sort((a, b) => a.label.localeCompare(b.label));
}
function endFromNode(node: GraphNode, ownerId: string | null): EndInput {
  return {
    kind: node.kind,
    programmeId: node.programmeId ?? null,
    projectId: node.projectId ?? null,
    milestoneId: node.kind === "Milestone" ? node.id.split(":").slice(2).join(":") : null,
    externalName: node.kind === "External" ? node.label : null,
    ownerId,
  };
}

export function DependencyEditor({
  data,
  item,
  fromId,
  toId,
  onClose,
}: {
  data: DependenciesData;
  item?: ResolvedDependency;
  fromId?: string;
  toId?: string;
  onClose: () => void;
}) {
  const nodes = useMemo(() => options(data), [data]);
  const mutations = useDependencyMutations();
  const raisedById = useMyResourceId();
  const canDelete = useCan("manager", item?.workspaceId);
  const [externalName, setExternalName] = useState("");
  const [giverId, setGiverId] = useState(
    fromId ?? (item ? nodeForEnd(item.giver, "milestone")?.id : "") ?? "",
  );
  const [receiverId, setReceiverId] = useState(
    toId ?? (item ? nodeForEnd(item.receiver, "milestone")?.id : "") ?? "",
  );
  const [description, setDescription] = useState(item?.description ?? "");
  const [givingOwner, setGivingOwner] = useState(item?.giver.owner ?? "");
  const [receivingOwner, setReceivingOwner] = useState(item?.receiver.owner ?? "");
  const [type, setType] = useState<DependencyType>(item?.type ?? "Sequencing");
  const [requiredBy, setRequiredBy] = useState(item?.requiredBy ?? "");
  const [criticality, setCriticality] = useState<Dependency["criticality"]>(
    item?.criticality ?? "Medium",
  );
  const [validation, setValidation] = useState<Dependency["validation"]>(
    item?.validation ?? "Proposed",
  );
  const external = (id: string): GraphNode | undefined =>
    id === "external:new" && externalName.trim()
      ? {
          id: `external:${externalName.trim()}`,
          label: externalName.trim(),
          sublabel: "External party",
          kind: "External",
        }
      : undefined;
  const giver = nodes.find((node) => node.id === giverId) ?? external(giverId),
    receiver = nodes.find((node) => node.id === receiverId) ?? external(receiverId);
  const personId = (name: string) =>
    name.trim() ? data.people.find((person) => person.name === name.trim())?.id : null;
  const givingOwnerId = personId(givingOwner),
    receivingOwnerId = personId(receivingOwner);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(requiredBy);
  const valid = Boolean(
    giver &&
    receiver &&
    giver.id !== receiver.id &&
    description.trim() &&
    givingOwnerId !== undefined &&
    receivingOwnerId !== undefined &&
    validDate,
  );
  const busy = mutations.create.isPending || mutations.update.isPending;
  const submit = () => {
    if (!valid || !giver || !receiver) return;
    const input = {
      giver: endFromNode(giver, givingOwnerId ?? null),
      receiver: endFromNode(receiver, receivingOwnerId ?? null),
      type,
      description,
      requiredBy,
      criticality,
      validation,
    };
    if (item)
      mutations.update.mutate(
        { id: item.id, input, lastSeen: item.updatedAt },
        { onSuccess: onClose },
      );
    else mutations.create.mutate({ input, raisedById, today: todayIso() }, { onSuccess: onClose });
  };
  return (
    <>
      <div className="fixed inset-0 z-40 bg-overlay" onClick={onClose} />
      <aside
        role="dialog"
        aria-label={item ? "Edit dependency" : "New dependency"}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-background p-6 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">
              {item?.reference ?? "Workshop"}
            </p>
            <h2 className="mt-2 font-display text-xl font-semibold">
              {item ? "Edit dependency" : "New dependency"}
            </h2>
          </div>
          <Button size="icon" variant="ghost" aria-label="Close editor" onClick={onClose}>
            <X />
          </Button>
        </div>
        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="block space-y-1 text-sm font-medium">
            Giving side
            <select
              aria-label="Giving side"
              value={giverId}
              onChange={(event) => setGiverId(event.target.value)}
              className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
            >
              <option value="">Select giving side</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label} · {node.sublabel}
                </option>
              ))}
              <option value="external:new">New external party…</option>
            </select>
          </label>
          {(giverId === "external:new" || receiverId === "external:new") && (
            <label className="block space-y-1 text-sm font-medium">
              External party name
              <Input
                value={externalName}
                onChange={(event) => setExternalName(event.target.value)}
                placeholder="e.g. Jisc"
              />
            </label>
          )}
          <datalist id="dependency-people">
            {data.people.map((person) => (
              <option key={person.id} value={person.name} />
            ))}
          </datalist>
          <label className="block space-y-1 text-sm font-medium">
            Giving owner
            <Input
              list="dependency-people"
              value={givingOwner}
              onChange={(event) => setGivingOwner(event.target.value)}
              placeholder="Choose a person"
            />
          </label>
          {givingOwnerId === undefined && (
            <p className="text-xs text-health-bad-foreground">
              Choose the giving owner from the people list.
            </p>
          )}
          <label className="block space-y-1 text-sm font-medium">
            Receiving side
            <select
              aria-label="Receiving side"
              value={receiverId}
              onChange={(event) => setReceiverId(event.target.value)}
              className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
            >
              <option value="">Select receiving side</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label} · {node.sublabel}
                </option>
              ))}
              <option value="external:new">New external party…</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm font-medium">
            Receiving owner
            <Input
              list="dependency-people"
              value={receivingOwner}
              onChange={(event) => setReceivingOwner(event.target.value)}
              placeholder="Choose a person"
            />
          </label>
          {receivingOwnerId === undefined && (
            <p className="text-xs text-health-bad-foreground">
              Choose the receiving owner from the people list.
            </p>
          )}
          <label className="block space-y-1 text-sm font-medium">
            Dependency description
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm font-medium">
              Type
              <select
                value={type}
                onChange={(event) => setType(event.target.value as DependencyType)}
                className="w-full rounded-md border bg-background p-2 text-sm"
              >
                {kinds.map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Criticality
              <select
                value={criticality}
                onChange={(event) =>
                  setCriticality(event.target.value as Dependency["criticality"])
                }
                className="w-full rounded-md border bg-background p-2 text-sm"
              >
                {["Low", "Medium", "High"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1 text-sm font-medium">
              Required by
              <Input
                type="date"
                value={requiredBy}
                onChange={(event) => setRequiredBy(event.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm font-medium">
              Validation
              <select
                value={validation}
                onChange={(event) => setValidation(event.target.value as Dependency["validation"])}
                className="w-full rounded-md border bg-background p-2 text-sm"
              >
                {["Inferred", "Proposed", "Confirmed", "Closed", "Broken"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          {giver && receiver && giver.id === receiver.id && (
            <p className="text-sm text-health-bad-foreground">
              Giving and receiving sides must be different.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-5">
            {item && canDelete ? (
              <Button
                type="button"
                variant="outline"
                className="text-health-bad-foreground"
                disabled={mutations.remove.isPending}
                onClick={() => {
                  if (window.confirm(`Delete ${item.reference}? This can't be undone.`))
                    mutations.remove.mutate([item.id], { onSuccess: onClose });
                }}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {item && item.validation !== "Closed" && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    mutations.update.mutate(
                      { id: item.id, input: { validation: "Closed" }, lastSeen: item.updatedAt },
                      { onSuccess: onClose },
                    )
                  }
                >
                  Close dependency
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!valid || busy}>
                Save dependency
              </Button>
            </div>
          </div>
        </form>
      </aside>
    </>
  );
}
