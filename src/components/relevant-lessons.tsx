import { useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, ChevronDown, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLessons } from "@/hooks/use-lessons";
import { getRelevantLessons } from "@/services/lessons";
import { cn } from "@/lib/utils";

/** "Relevant lessons" shown at initiation and on a request (Prompt I3). */
export function RelevantLessons({
  projectTypeTags,
  categories,
  phaseIndex,
  excludeProjectId,
  requireTick = false,
  ticked,
  onTick,
  compact = false,
}: {
  projectTypeTags?: string[];
  categories?: string[];
  /** Lifecycle position (0 = first phase) the lessons are for. */
  phaseIndex?: number;
  excludeProjectId?: string;
  requireTick?: boolean;
  ticked?: boolean;
  onTick?: (value: boolean) => void;
  compact?: boolean;
}) {
  const lessons = useLessons();
  const { matched, themes } = useMemo(
    () =>
      lessons.data
        ? getRelevantLessons(lessons.data, {
            ...(projectTypeTags ? { projectTypeTags } : {}),
            ...(categories ? { categories } : {}),
            ...(phaseIndex !== undefined ? { phaseIndex } : {}),
            ...(excludeProjectId ? { excludeProjectId } : {}),
          })
        : { matched: [], themes: [] },
    [lessons.data, projectTypeTags, categories, phaseIndex, excludeProjectId],
  );
  const [open, setOpen] = useState(!compact);
  const shown = open ? matched.slice(0, compact ? 6 : 12) : [];

  return (
    <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
      >
        <BookOpenCheck className="size-5 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Relevant lessons</p>
          <p className="text-xs text-muted-foreground">
            {lessons.isPending ? (
              "Loading lessons…"
            ) : lessons.isError ? (
              "Lessons could not be loaded."
            ) : (
              <>
                {matched.length} lessons from similar projects, {themes.length} recurring theme
                {themes.length === 1 ? "" : "s"}
              </>
            )}
          </p>
        </div>
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {themes.length > 0 && (
            <div className="rounded-md border border-health-warn/40 bg-health-warn/10 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Repeat2 className="size-3.5 text-health-warn-foreground" />
                Recurring themes to plan for
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                {themes.map((theme) => (
                  <li key={theme.category}>
                    • <strong>{theme.category}</strong> — problems in {theme.projectCount} projects
                    ({theme.projects.slice(0, 3).join(", ")})
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-2">
            {shown.map((lesson) => (
              <div key={lesson.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
                      lesson.type === "Success"
                        ? "bg-health-good/20 text-health-good-foreground"
                        : "bg-health-bad/20 text-health-bad-foreground",
                    )}
                  >
                    {lesson.type}
                  </span>
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold">
                    {lesson.category}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {lesson.projectName} · {lesson.phaseName}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium">{lesson.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <strong>Recommendation:</strong> {lesson.recommendation}
                </p>
              </div>
            ))}
            {matched.length > shown.length && (
              <p className="text-xs text-muted-foreground">
                Showing {shown.length} of {matched.length}. The full log is on the Lessons page.
              </p>
            )}
          </div>
          {requireTick && (
            <label
              className={cn(
                "mt-2 flex items-start gap-2.5 rounded-md border p-3",
                ticked
                  ? "border-health-good/40 bg-health-good/10"
                  : "border-health-warn/40 bg-health-warn/10",
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(ticked)}
                onChange={(event) => onTick?.(event.target.checked)}
              />
              <span className="text-sm">
                <strong>Lessons reviewed</strong>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  The Phase 2 gate requires the project manager to confirm these lessons have been
                  reviewed and reflected in the plan.
                </span>
              </span>
              {ticked && (
                <CheckCircle2 className="ml-auto size-4 shrink-0 text-health-good-foreground" />
              )}
            </label>
          )}
          {!requireTick && compact && (
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Hide
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
