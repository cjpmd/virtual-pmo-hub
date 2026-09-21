import { useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, CircleAlert, ClipboardCheck, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { lessonCategories } from "@/data/lessons-data";
import type { LessonApplicability, LessonCategory, LessonType, Project } from "@/data/types";
import { getLifecyclePhases, getPhaseIndex } from "@/services/pmo";
import { getPhaseLessonsReviews, getProjectLessons, type ResolvedLesson } from "@/services/lessons";
import { cn } from "@/lib/utils";

interface DraftLesson { id: string; phaseId: string; type: LessonType; category: LessonCategory; summary: string; whatHappened: string; impact: string; rootCause: string; recommendation: string; applicability: LessonApplicability }
interface ReviewAnswers { wentWell: string; didNot: string; differently: string; recommendation: string; category: LessonCategory; sprint: string }
const blankAnswers = (): ReviewAnswers => ({ wentWell: "", didNot: "", differently: "", recommendation: "", category: "Project Management", sprint: "" });

/** Lessons on the project page: grouped by phase, with a guided phase review (Prompt I3). */
export function LessonsTab({ project }: { project: Project }) {
  const phases = getLifecyclePhases();
  const currentIndex = getPhaseIndex(project.stage);
  const existing = useMemo(() => getProjectLessons(project.id), [project.id]);
  const reviews = useMemo(() => getPhaseLessonsReviews(project.id), [project.id]);
  const [drafts, setDrafts] = useState<DraftLesson[]>([]);
  const [heldReviews, setHeldReviews] = useState<string[]>([]);
  const [reviewPhase, setReviewPhase] = useState<string | null>(null);
  const [answers, setAnswers] = useState<ReviewAnswers>(blankAnswers);
  const [closure, setClosure] = useState(false);

  const reviewHeld = (phaseId: string) => reviews.some(review => review.phaseId === phaseId) || heldReviews.includes(phaseId);
  const lessonsFor = (phaseId: string): Array<ResolvedLesson | DraftLesson> => [...existing.filter(lesson => lesson.phaseId === phaseId), ...drafts.filter(draft => draft.phaseId === phaseId)];
  const missingReviews = phases.slice(0, currentIndex).filter(phase => !reviewHeld(phase.id));

  const saveReview = () => {
    if (!reviewPhase) return;
    const stamp = Date.now();
    const created: DraftLesson[] = [];
    if (answers.wentWell.trim()) created.push({ id: `draft-${stamp}-s`, phaseId: reviewPhase, type: "Success", category: answers.category, summary: answers.wentWell.split(".")[0]?.slice(0, 90) ?? answers.wentWell, whatHappened: answers.wentWell, impact: "Recorded in the phase lessons review.", rootCause: "—", recommendation: answers.recommendation || "Keep doing this on similar projects.", applicability: "Similar projects" });
    if (answers.didNot.trim()) created.push({ id: `draft-${stamp}-p`, phaseId: reviewPhase, type: "Problem", category: answers.category, summary: answers.didNot.split(".")[0]?.slice(0, 90) ?? answers.didNot, whatHappened: answers.didNot, impact: "Recorded in the phase lessons review.", rootCause: answers.differently || "To be confirmed with the team.", recommendation: answers.recommendation || answers.differently, applicability: "Similar projects" });
    setDrafts(current => [...current, ...created]);
    setHeldReviews(current => [...current, reviewPhase]);
    setReviewPhase(null);
    setAnswers(blankAnswers());
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4 shadow-sm">
      <BookOpenCheck className="size-5 text-primary" />
      <div className="mr-auto">
        <p className="text-sm font-semibold">{existing.length + drafts.length} lessons logged</p>
        <p className="text-xs text-muted-foreground">{reviews.length + heldReviews.length} phase reviews held · {missingReviews.length} gate{missingReviews.length === 1 ? "" : "s"} passed without one</p>
      </div>
      <Button onClick={() => setReviewPhase(project.stage === phases[phases.length - 1]?.name ? phases[phases.length - 1]?.id ?? "phase-6" : phases[currentIndex]?.id ?? "phase-1")}><Plus />Run phase lessons review</Button>
      {project.state === "Closed" || currentIndex >= phases.length - 1 ? <Button variant="outline" onClick={() => setClosure(true)}><ClipboardCheck />Closure retrospective</Button> : null}
    </div>

    {missingReviews.length > 0 && <div className="flex flex-wrap items-start gap-2 rounded-md border border-health-bad/40 bg-health-bad/10 p-4 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-health-bad-foreground" />
      <div>
        <p className="font-semibold">Phase lessons review outstanding</p>
        <p className="mt-1 text-xs text-muted-foreground">{missingReviews.map(phase => phase.shortName).join(", ")} passed their gate without a lessons review. Each gate checklist shows this as a failing criterion.</p>
      </div>
    </div>}

    <div className="space-y-4">
      {phases.map((phase, index) => {
        const items = lessonsFor(phase.id);
        const held = reviewHeld(phase.id);
        const passed = index < currentIndex;
        return <section key={phase.id} className="rounded-lg border bg-card shadow-sm">
          <header className="flex flex-wrap items-center gap-3 border-b p-4">
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", index < currentIndex ? "bg-primary text-primary-foreground" : index === currentIndex ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>{index + 1}</span>
            <div className="mr-auto min-w-0">
              <h3 className="truncate text-sm font-semibold">{phase.name}</h3>
              <p className="text-xs text-muted-foreground">{items.length} lesson{items.length === 1 ? "" : "s"}</p>
            </div>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", held ? "bg-health-good/20 text-health-good-foreground" : passed ? "bg-health-bad/20 text-health-bad-foreground" : "bg-muted text-muted-foreground")}>
              {held ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />}Phase lessons review {held ? "completed" : passed ? "missing" : "not due"}
            </span>
            <Button size="sm" variant="outline" onClick={() => setReviewPhase(phase.id)}>Run review</Button>
          </header>
          {items.length > 0 && <div className="divide-y">
            {items.map(lesson => <div key={lesson.id} className="p-4">
              <div className="flex flex-wrap items-start gap-2">
                <span className={cn("rounded px-2 py-0.5 text-[10px] font-bold uppercase", lesson.type === "Success" ? "bg-health-good/20 text-health-good-foreground" : "bg-health-bad/20 text-health-bad-foreground")}>{lesson.type}</span>
                <span className="rounded bg-accent px-2 py-0.5 text-[10px] font-semibold">{lesson.category}</span>
                <p className="w-full text-sm font-medium">{"reference" in lesson ? `${lesson.reference} · ` : "New · "}{lesson.summary}</p>
              </div>
              <div className="mt-2 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                <p><strong className="text-foreground">What happened:</strong> {lesson.whatHappened}</p>
                <p><strong className="text-foreground">Impact:</strong> {lesson.impact}</p>
                <p><strong className="text-foreground">Root cause:</strong> {lesson.rootCause}</p>
                <p><strong className="text-foreground">Recommendation:</strong> {lesson.recommendation}</p>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{"raisedBy" in lesson ? `${lesson.raisedBy} · ${lesson.date} · ` : ""}{lesson.applicability}{"sprint" in lesson && lesson.sprint ? ` · ${lesson.sprint}` : ""}{"status" in lesson ? ` · ${lesson.status}` : " · Identified"}</p>
              {"actions" in lesson && lesson.actions.length > 0 && <div className="mt-2 rounded-md border bg-muted/30 p-3">
                {lesson.actions.map(action => <p key={action.id} className="text-xs"><strong>Improvement action:</strong> {action.description} · {action.owner} · due {action.dueDate} · {action.status}{action.embeddedIn ? ` · embedded in ${action.embeddedIn}` : ""}</p>)}
              </div>}
            </div>)}
          </div>}
          {!items.length && <p className="p-5 text-center text-sm text-muted-foreground">No lessons recorded for this phase.</p>}
        </section>;
      })}
    </div>

    {reviewPhase && <>
      <button aria-label="Close lessons review" className="fixed inset-0 z-40 bg-overlay" onClick={() => setReviewPhase(null)} />
      <aside role="dialog" aria-label="Phase lessons review" className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div><p className="text-xs font-semibold uppercase text-primary">Guided review</p><h2 className="mt-2 font-display text-xl font-semibold">{getLifecyclePhases().find(phase => phase.id === reviewPhase)?.name}</h2></div>
          <Button size="icon" variant="ghost" onClick={() => setReviewPhase(null)} aria-label="Close"><X /></Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Four questions with the team. Answers become lesson records against this phase.</p>
        <label className="mt-5 block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">What went well?</span><Textarea rows={3} value={answers.wentWell} onChange={event => setAnswers({ ...answers, wentWell: event.target.value })} /></label>
        <label className="mt-4 block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">What didn't?</span><Textarea rows={3} value={answers.didNot} onChange={event => setAnswers({ ...answers, didNot: event.target.value })} /></label>
        <label className="mt-4 block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">What would we do differently?</span><Textarea rows={3} value={answers.differently} onChange={event => setAnswers({ ...answers, differently: event.target.value })} /></label>
        <label className="mt-4 block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Recommendation</span><Textarea rows={2} value={answers.recommendation} onChange={event => setAnswers({ ...answers, recommendation: event.target.value })} /></label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Category</span>
            <select value={answers.category} onChange={event => setAnswers({ ...answers, category: event.target.value as LessonCategory })} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">{lessonCategories.map(category => <option key={category}>{category}</option>)}</select>
          </label>
          <label className="space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">Sprint (optional)</span><Input value={answers.sprint} onChange={event => setAnswers({ ...answers, sprint: event.target.value })} placeholder="Sprint 7" /></label>
        </div>
        <div className="mt-6 flex gap-2">
          <Button onClick={saveReview} disabled={!answers.wentWell.trim() && !answers.didNot.trim()}><CheckCircle2 />Save review and create lessons</Button>
          <Button variant="outline" onClick={() => setReviewPhase(null)}>Cancel</Button>
        </div>
      </aside>
    </>}

    {closure && <>
      <button aria-label="Close closure retrospective" className="fixed inset-0 z-40 bg-overlay" onClick={() => setClosure(false)} />
      <aside role="dialog" aria-label="Closure retrospective" className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div><p className="text-xs font-semibold uppercase text-primary">Project closure</p><h2 className="mt-2 font-display text-xl font-semibold">Closure retrospective</h2></div>
          <Button size="icon" variant="ghost" onClick={() => setClosure(false)} aria-label="Close"><X /></Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{project.name} is closing. Run a final retrospective across every phase and confirm the recommendations worth carrying forward.</p>
        <div className="mt-5 space-y-3">
          {phases.map(phase => <div key={phase.id} className="flex items-center gap-3 rounded-md border p-3">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <div className="flex-1"><p className="text-sm font-medium">{phase.shortName}</p><p className="text-xs text-muted-foreground">{lessonsFor(phase.id).length} lessons · review {reviewHeld(phase.id) ? "held" : "not held"}</p></div>
            {!reviewHeld(phase.id) && <Button size="sm" variant="outline" onClick={() => { setClosure(false); setReviewPhase(phase.id) }}>Run now</Button>}
          </div>)}
        </div>
        <Button className="mt-6" onClick={() => setClosure(false)}><CheckCircle2 />Mark closure retrospective complete</Button>
      </aside>
    </>}
  </div>;
}
