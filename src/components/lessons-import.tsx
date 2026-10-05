import { useState } from "react";
import { ArrowRight, CheckCircle2, Download, FileSpreadsheet, TriangleAlert, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { lessonCsvColumns, lessonsToCsv, parseCsv, resolveImportRow, type ImportRow, type LessonsData } from "@/services/lessons";
import { useLessonMutations } from "@/hooks/use-lessons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const targetFields = ["Ignore", "Reference", "Project", "Phase", "Sprint", "Type", "Category", "Summary", "What happened", "Impact", "Root cause", "Recommendation", "Applicability", "Project type tags", "Raised by", "Date", "Status"] as const;
const sample = `Title,Lesson Type,Category,Project,Phase,What happened,Impact,Root cause,Recommendation,Raised By,Date Raised
"Test environment shared with BAU",Problem,"[""Testing""]","Ebbot (chatbot)","Phase 4 - Build & Test","The test environment was shared with a live support workstream.","Two test runs were invalidated.","No dedicated environment was requested at planning.","Request a dedicated test environment at the design gate.","Rowan Blake",14/05/2026
"Supplier daily stand-up",Success,"[""Vendor Management""]","Unified Comms (Phase 2)","Phase 3 - Design & Procure","A short daily call replaced weekly reporting.","Issues resolved same-day.","Short feedback loops suit distributed teams.","Agree a daily contact rhythm with delivery suppliers.","Iona Craig",03/02/2026`;

/** CSV import wizard with a column-mapping step and preview (Prompt I3). */
export function LessonsImport({ data, close }: { data: LessonsData; close: () => void }) {
  const mutations = useLessonMutations();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [text, setText] = useState("");
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const rows = text.trim() ? parseCsv(text) : [];
  const header = rows[0] ?? [];
  const body = rows.slice(1);

  const guess = (name: string) => {
    const cleaned = name.toLowerCase();
    if (cleaned.includes("title") || cleaned.includes("summary")) return "Summary";
    if (cleaned.includes("lesson type") || cleaned === "type") return "Type";
    if (cleaned.includes("categor")) return "Category";
    if (cleaned.includes("project type")) return "Project type tags";
    if (cleaned.includes("project")) return "Project";
    if (cleaned.includes("phase")) return "Phase";
    if (cleaned.includes("sprint")) return "Sprint";
    if (cleaned.includes("what happened") || cleaned.includes("detail")) return "What happened";
    if (cleaned.includes("impact")) return "Impact";
    if (cleaned.includes("root")) return "Root cause";
    if (cleaned.includes("recommend")) return "Recommendation";
    if (cleaned.includes("applicab")) return "Applicability";
    // "Date Raised" is a date; "Raised By" is a person.
    if (cleaned.includes("date")) return "Date";
    if (cleaned.includes("raised")) return "Raised by";
    if (cleaned.includes("status")) return "Status";
    if (cleaned.includes("ref")) return "Reference";
    return "Ignore";
  };
  const effective = (index: number) => mapping[index] ?? guess(header[index] ?? "");
  const columnFor = (field: string) => header.findIndex((_, index) => effective(index) === field);
  const resolved = body.map(row => {
    const value = (field: string) => { const index = columnFor(field); return index >= 0 ? row[index] ?? "" : ""; };
    const item: ImportRow = {
      summary: value("Summary"), project: value("Project"), phase: value("Phase"), sprint: value("Sprint"), type: value("Type"),
      category: value("Category"), whatHappened: value("What happened"), impact: value("Impact"), rootCause: value("Root cause"),
      recommendation: value("Recommendation"), applicability: value("Applicability"), tags: value("Project type tags"),
      raisedBy: value("Raised by"), date: value("Date"), status: value("Status"),
    };
    return resolveImportRow(data, item);
  });
  const preview = resolved.slice(0, 8);
  const blocked = resolved.filter(item => item.problems.length);
  const ready = resolved.length - blocked.length;
  const runImport = () => mutations.importLessons.mutate({ data, rows: resolved }, {
    onSuccess: count => { toast.success(`${count} lesson${count === 1 ? "" : "s"} imported`); close(); },
    onError: error => toast.error(error.message),
  });

  const download = () => {
    const blob = new Blob([lessonsToCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "lessons-learned.csv"; anchor.click();
    URL.revokeObjectURL(url);
  };

  return <>
    <button aria-label="Close import wizard" className="fixed inset-0 z-40 bg-overlay" onClick={close} />
    <aside role="dialog" aria-label="Import lessons" className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl overflow-y-auto border-l bg-background p-6 shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-primary">Step {step} of 3</p>
          <h2 className="mt-2 font-display text-xl font-semibold">Import lessons</h2>
          <p className="mt-1 text-sm text-muted-foreground">Paste a CSV exported from the SharePoint lessons list, map the columns, then review before importing.</p>
        </div>
        <Button size="icon" variant="ghost" onClick={close} aria-label="Close"><X /></Button>
      </div>

      <div className="mt-5 flex gap-2">{[1, 2, 3].map(number => <span key={number} className={cn("h-1.5 flex-1 rounded-full", number <= step ? "bg-primary" : "bg-muted")} />)}</div>

      {step === 1 && <div className="mt-5 space-y-4">
        <label className="block space-y-1.5"><span className="text-xs font-semibold text-muted-foreground">CSV content</span>
          <Textarea rows={12} value={text} onChange={event => setText(event.target.value)} placeholder="Paste the CSV here, including the header row…" className="font-mono text-xs" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setText(sample)}><FileSpreadsheet />Use a sample export</Button>
          <Button variant="outline" size="sm" onClick={download}><Download />Export current lessons to CSV</Button>
        </div>
        <p className="text-xs text-muted-foreground">{rows.length ? `${body.length} data rows and ${header.length} columns detected.` : "Nothing parsed yet."}</p>
        <Button disabled={!body.length} onClick={() => setStep(2)}>Map columns<ArrowRight /></Button>
      </div>}

      {step === 2 && <div className="mt-5 space-y-4">
        <p className="text-sm text-muted-foreground">Each CSV column maps to a lesson field. Sensible guesses are pre-selected.</p>
        <div className="divide-y rounded-md border">
          {header.map((name, index) => <div key={`${name}-${index}`} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div><p className="text-sm font-medium">{name || `Column ${index + 1}`}</p><p className="truncate text-xs text-muted-foreground">e.g. {body[0]?.[index] ?? "—"}</p></div>
            <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
            <select value={effective(index)} onChange={event => setMapping(current => ({ ...current, [index]: event.target.value }))} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              {targetFields.map(field => <option key={field}>{field}</option>)}
            </select>
          </div>)}
        </div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setStep(1)}>Back</Button><Button onClick={() => setStep(3)}>Preview<ArrowRight /></Button></div>
      </div>}

      {step === 3 && <div className="mt-5 space-y-4">
        {blocked.length > 0 && <div className="flex items-start gap-2 rounded-md border border-health-warn/40 bg-health-warn/10 p-3 text-xs">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-health-warn-foreground" />
          <div>
            <p>{blocked.length} of the {resolved.length} rows can't be imported and will be skipped. SharePoint values like <code className="rounded bg-muted px-1">[&quot;Project Management&quot;]</code> are unwrapped automatically; the project, category and type must match this organisation's lists.</p>
            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">{blocked.slice(0, 5).map((item, index) => <li key={index}>• {item.row.summary || `Row ${resolved.indexOf(item) + 1}`}: {item.problems.join("; ")}</li>)}</ul>
          </div>
        </div>}
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-table-head text-muted-foreground"><tr><th className="h-9 px-3 font-semibold">Summary</th><th className="px-3 font-semibold">Project</th><th className="px-3 font-semibold">Phase</th><th className="px-3 font-semibold">Type</th><th className="px-3 font-semibold">Category</th><th className="px-3 font-semibold">Raised by</th><th className="px-3 font-semibold">Date</th></tr></thead>
            <tbody>{preview.map((item, index) => <tr key={index} className={cn("border-t", item.problems.length && "bg-health-warn/5")}>
              <td className="px-3 py-2">{item.row.summary || <span className="text-health-bad-foreground">missing</span>}</td>
              <td className="px-3 py-2">{item.project ? item.project.name : <span className="text-health-warn-foreground">{item.row.project || "—"}</span>}</td>
              <td className="px-3 py-2">{item.phase ? <span className="text-health-good-foreground">{item.phase.shortName}</span> : <span className="text-muted-foreground">{item.row.phase || "—"}</span>}</td>
              <td className="px-3 py-2">{item.type ?? <span className="text-health-warn-foreground">{item.row.type || "—"}</span>}</td>
              <td className="px-3 py-2">{item.category?.label ?? <span className="text-health-warn-foreground">{item.row.category || "—"}</span>}</td>
              <td className="px-3 py-2">{item.row.raisedBy}</td>
              <td className="px-3 py-2">{item.row.date}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Showing the first {preview.length} of {body.length} rows.</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
          <Button disabled={!ready || mutations.importLessons.isPending} onClick={runImport}><Upload />Import {ready} lesson{ready === 1 ? "" : "s"}</Button>
        </div>
      </div>}

      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="size-3.5" />Export uses the same columns: {lessonCsvColumns.join(", ")}.</p>
    </aside>
  </>;
}
