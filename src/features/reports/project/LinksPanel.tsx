// Links panel on the project page (spec §16): link the project to another record with a link
// type. Dependencies from the dependency register show here too (read-only).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrgId } from "@/components/auth/organisation-provider";
import { qk } from "@/services/query-keys";
import {
  LINK_TYPES,
  TARGET_TYPES,
  addProjectLink,
  labelsFor,
  listProjectLinks,
  removeLink,
  searchLinkTargets,
  type TargetType,
} from "@/services/record-links";
import { errorMessage } from "@/services/service-error";

const label = (v: string) => v.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function LinksPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const orgId = useOrgId();
  const client = useQueryClient();
  const key = [...qk.org(orgId), "projects", projectId, "record-links"];
  const links = useQuery({
    queryKey: key,
    queryFn: async () => {
      const rows = await listProjectLinks(projectId);
      return { rows, labels: await labelsFor(rows) };
    },
  });
  const [type, setType] = useState<TargetType>("project");
  const [linkType, setLinkType] = useState<string>("relates_to");
  const [query, setQuery] = useState("");
  const targets = useQuery({
    queryKey: [...key, "search", type, query],
    queryFn: () => searchLinkTargets(type, query),
    enabled: canEdit,
  });
  const add = useMutation({
    mutationFn: (toId: string) => addProjectLink(projectId, type, toId, linkType),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeLink(id),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section aria-label="Links" className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Linked records</h2>
      <ul className="divide-y text-sm">
        {(links.data?.rows ?? []).map((l) => (
          <li key={l.id} className="flex items-center gap-2 py-1.5">
            <span className="w-28 shrink-0 text-xs text-muted-foreground">
              {label(l.linkType)}
              {l.direction === "in" ? " (from)" : ""}
            </span>
            <span className="min-w-0 flex-1">
              {links.data?.labels.get(l.otherId) ?? l.otherType}{" "}
              <span className="text-xs text-muted-foreground">{l.otherType}</span>
            </span>
            {l.source === "dependencies" ? (
              <span className="text-xs text-muted-foreground">Dependency register</span>
            ) : (
              canEdit && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="Remove link"
                  onClick={() => remove.mutate(l.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )
            )}
          </li>
        ))}
        {links.data?.rows.length === 0 && (
          <li className="py-1.5 text-muted-foreground">No links yet.</li>
        )}
      </ul>
      {canEdit && (
        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Link type"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={linkType}
              onChange={(e) => setLinkType(e.target.value)}
            >
              {LINK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
            <select
              aria-label="Record type"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as TargetType)}
            >
              {TARGET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {label(t)}
                </option>
              ))}
            </select>
            <Input
              aria-label="Find a record"
              className="h-9 w-56"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="max-h-40 overflow-auto text-sm">
            {(targets.data ?? [])
              .filter((t) => t.id !== projectId)
              .map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-0.5">
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    disabled={add.isPending}
                    onClick={() => add.mutate(t.id)}
                  >
                    Link
                  </Button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
