// The programme's office note (work package 1.5): read by everyone who can see the programme,
// edited by the programme's manager and the workspace's PMO / admin. The database enforces
// the same rule; this only decides whether to offer the Edit button.
import { useState } from "react";
import { Pencil, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { useProgrammeNote } from "@/hooks/use-notes-layout";
import { useWorkspaceRole } from "@/hooks/use-permissions";
import { atLeast } from "@/services/auth";
import type { ProgrammeSummary } from "@/services/hierarchy";
import { NOTE_MAX_LENGTH } from "@/services/programme-notes";
import { errorMessage } from "@/services/service-error";
import { useFormat } from "@/lib/format";

export function ProgrammeOfficeNote({ programme }: { programme: ProgrammeSummary }) {
  const { query, save } = useProgrammeNote(programme.id);
  const role = useWorkspaceRole(programme.workspaceId);
  const myResourceId = useMyResourceId();
  const canEdit =
    atLeast(role, "pmo") || Boolean(programme.managerId && programme.managerId === myResourceId);
  const { date } = useFormat();
  const [draft, setDraft] = useState<string | null>(null);
  const note = query.data;
  const editing = draft !== null;
  const tooLong = (draft?.length ?? 0) > NOTE_MAX_LENGTH;

  const submit = () => {
    if (draft === null || !note || tooLong) return;
    save.mutate(
      { note: draft.trim(), lastSeen: note.updatedAt },
      { onSuccess: () => setDraft(null) },
    );
  };

  return (
    <section
      aria-label="Programme office note"
      className="rounded-lg border border-border/70 bg-card p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        <UserRound className="size-4 text-primary" />
        <p className="text-sm font-semibold">Programme office note</p>
        {canEdit && note && !editing && (
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setDraft(note.note)}
          >
            <Pencil />
            Edit
          </Button>
        )}
      </div>
      {query.isPending && <p className="mt-3 text-sm text-muted-foreground">Loading…</p>}
      {query.isError && (
        <p className="mt-3 text-sm text-health-bad-foreground">{query.error.message}</p>
      )}
      {note && !editing && (
        <>
          <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
            {note.note || "No office note yet."}
          </p>
          {note.updatedAt && note.note && (
            <p className="mt-3 text-xs text-muted-foreground">
              Last updated{note.updatedByName ? ` by ${note.updatedByName}` : ""} on{" "}
              {date(note.updatedAt.slice(0, 10))}
            </p>
          )}
        </>
      )}
      {editing && (
        <div className="mt-3 max-w-3xl space-y-2">
          <Textarea
            aria-label="Office note text"
            rows={8}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <p
            className={
              tooLong ? "text-xs text-health-bad-foreground" : "text-xs text-muted-foreground"
            }
          >
            {draft.length.toLocaleString("en-GB")} / {NOTE_MAX_LENGTH.toLocaleString("en-GB")}{" "}
            characters
          </p>
          {save.isError && (
            <p role="alert" className="text-sm text-health-bad-foreground">
              {errorMessage(save.error)}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} disabled={save.isPending || tooLong}>
              {save.isPending ? "Saving…" : "Save note"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(null);
                save.reset();
              }}
              disabled={save.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
