// "Archived" badge for an archived (read-only) workspace (work package 1.6).
import { Archive } from "lucide-react";
import { useWorkspaceArchived } from "@/hooks/use-workspaces";

export function ArchivedBadge({ label = "Archived" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      <Archive className="size-3" />
      {label}
    </span>
  );
}

/** Shown on records in an archived workspace; nothing otherwise. */
export function ArchivedWorkspaceBadge({
  workspaceId,
}: {
  workspaceId: string | null | undefined;
}) {
  const archived = useWorkspaceArchived(workspaceId);
  if (!archived) return null;
  return (
    <span title="This workspace is archived: its records are read-only.">
      <ArchivedBadge label="Archived workspace" />
    </span>
  );
}
