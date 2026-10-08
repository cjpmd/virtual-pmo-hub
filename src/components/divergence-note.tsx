// Declared vs evidenced for one project, with the divergence wording, its alert or justified
// state, and (for people who can edit the project) the justification form. Everything it shows
// comes from v_project_divergence via AssuranceRow.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RagPill, healthToRag } from "@/components/evidence-ui";
import { useJustifyDivergence } from "@/hooks/use-assurance";
import { divergenceText, type AssuranceRow } from "@/services/assurance";
import { cn } from "@/lib/utils";

export function DeclaredEvidencedPills({ row }: { row: AssuranceRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {row.declared ? (
        <RagPill rag={healthToRag(row.declared)} prefix="Declared" />
      ) : (
        <RagPill rag="Grey" prefix="Declared" label="No report yet" />
      )}
      <RagPill rag={healthToRag(row.evidenced)} prefix="Evidenced" />
    </span>
  );
}

export function DivergenceNote({
  row,
  canJustify,
  className,
}: {
  row: AssuranceRow;
  canJustify: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const justify = useJustifyDivergence();
  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <DeclaredEvidencedPills row={row} />
      {row.divergent && (
        <span
          className={cn(
            "text-xs font-medium",
            row.divergenceAlert ? "text-health-bad-foreground" : "text-health-warn-foreground",
          )}
        >
          {row.divergenceAlert ? "Divergence alert: " : ""}
          {divergenceText(row)}
        </span>
      )}
      {row.justified && (
        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium">
          Justified
        </span>
      )}
      {row.justified && row.justification && (
        <span className="text-xs text-muted-foreground">“{row.justification}”</span>
      )}
      {row.divergent && !row.justified && canJustify && !open && (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Add justification
        </Button>
      )}
      {open && (
        <form
          className="mt-2 w-full space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) return;
            justify.mutate(
              { row, text },
              {
                onSuccess: () => {
                  setOpen(false);
                  setText("");
                },
              },
            );
          }}
        >
          <Textarea
            aria-label={`Justification for ${row.name}`}
            value={text}
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
            placeholder="Why is the latest report better than the evidence?"
          />
          {justify.error && (
            <p role="alert" className="text-xs text-health-bad-foreground">
              {justify.error.message}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={justify.isPending || !text.trim()}>
              Save justification
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
