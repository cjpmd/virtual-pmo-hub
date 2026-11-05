// Escalate a project's open risks and issues to a forum (spec §5.4). The forum's packs show
// them in the escalations block and include the project by the "Escalated to this forum" rule.
import { toast } from "sonner";
import { useForums } from "@/hooks/use-forums";
import { useEscalatable, useSetEscalation } from "@/hooks/use-approvals";
import { formatDate } from "@/lib/format";
import { errorMessage } from "@/services/service-error";

export function EscalationsPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const items = useEscalatable(projectId);
  const forums = useForums();
  const set = useSetEscalation(projectId);
  if (!items.data?.length) return null;
  return (
    <section aria-label="Escalations" className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Escalate to a forum</h2>
      <ul className="divide-y text-sm">
        {items.data.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="text-xs uppercase text-muted-foreground">{item.kind}</span>
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground">{item.ref}</span> {item.title}
              {item.escalatedAt && (
                <span className="ml-1 text-xs text-muted-foreground">
                  escalated {formatDate(item.escalatedAt.slice(0, 10))}
                </span>
              )}
            </span>
            <select
              aria-label={`Escalate ${item.ref ?? item.title}`}
              className="h-8 rounded-md border bg-background px-2"
              disabled={!canEdit || set.isPending}
              value={item.forumId ?? ""}
              onChange={(e) =>
                set.mutate(
                  { item, forumId: e.target.value || null },
                  { onError: (err) => toast.error(errorMessage(err)) },
                )
              }
            >
              <option value="">Not escalated</option>
              {(forums.data ?? [])
                .filter((f) => f.active)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}
