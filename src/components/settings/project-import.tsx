import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Download, TriangleAlert, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useOrgId } from "@/components/auth/organisation-provider";
import { useEntityMutations } from "@/hooks/use-entities";
import { downloadText, parseCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import {
  MAX_IMPORT_ROWS,
  PROJECT_IMPORT_FIELDS,
  guessProjectField,
  loadProjectImportRefs,
  projectImportTemplate,
  validateProjectRows,
  type ProjectMappingTarget,
} from "@/services/data-transfer";
import { qk } from "@/services/query-keys";
import { useSettings } from "@/services/settings";

const targets: ProjectMappingTarget[] = ["Ignore", ...PROJECT_IMPORT_FIELDS];

/** Project CSV import: upload → column mapping → validation preview → insert (all or none). */
export function ProjectImport({ close }: { close: () => void }) {
  const orgId = useOrgId();
  const settings = useSettings();
  const mutations = useEntityMutations();
  const refs = useQuery({
    queryKey: [...qk.projects.all(orgId), "import-refs"],
    queryFn: () => loadProjectImportRefs(orgId),
  });
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [text, setText] = useState("");
  const [mapping, setMapping] = useState<Record<number, ProjectMappingTarget>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const rows = text.trim() ? parseCsv(text) : [];
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const effective = header.map((name, index) => mapping[index] ?? guessProjectField(name));

  const validation =
    step === 3 && refs.data
      ? validateProjectRows(body, effective, refs.data, settings.regional.dateFormat)
      : null;
  const blocked = validation?.rows.filter((row) => row.errors.length) ?? [];
  const warned = validation?.rows.filter((row) => !row.errors.length && row.warnings.length) ?? [];
  const ready = validation?.valid.length ?? 0;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    setMapping({});
  };
  const runImport = () => {
    if (!validation) return;
    setFailure(null);
    mutations.importProjects.mutate(validation.valid, {
      onSuccess: (count) => {
        toast.success(`${count} project${count === 1 ? "" : "s"} imported`);
        close();
      },
      onError: (error) => setFailure(error.message),
    });
  };

  return (
    <>
      <button
        aria-label="Close import wizard"
        className="fixed inset-0 z-40 bg-overlay"
        onClick={close}
      />
      <aside
        role="dialog"
        aria-label="Import projects"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl overflow-y-auto border-l bg-background p-6 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Step {step} of 3</p>
            <h2 className="mt-2 font-display text-xl font-semibold">Import projects</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a CSV of new projects, map the columns, then review before importing. Up to{" "}
              {MAX_IMPORT_ROWS} rows; existing projects are not changed.
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={close} aria-label="Close">
            <X />
          </Button>
        </div>

        <div className="mt-5 flex gap-2">
          {[1, 2, 3].map((number) => (
            <span
              key={number}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                number <= step ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="mt-5 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void readFile(event.target.files?.[0])}
                className="block text-sm"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Or paste the CSV content
              </span>
              <Textarea
                rows={10}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setMapping({});
                }}
                placeholder="Paste the CSV here, including the header row…"
                className="font-mono text-xs"
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadText("project-import-template.csv", projectImportTemplate())}
            >
              <Download />
              Download template
            </Button>
            <p className="text-xs text-muted-foreground">
              {rows.length
                ? `${body.length} data rows and ${header.length} columns detected.`
                : "Nothing parsed yet."}{" "}
              A portfolio export re-imports with the same columns.
            </p>
            <Button disabled={!body.length} onClick={() => setStep(2)}>
              Map columns
              <ArrowRight />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Each CSV column maps to a project field. Health, budget and forecast columns are
              ignored.
            </p>
            <div className="divide-y rounded-md border">
              {header.map((name, index) => (
                <div
                  key={`${name}-${index}`}
                  className="grid gap-2 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
                >
                  <div>
                    <p className="text-sm font-medium">{name || `Column ${index + 1}`}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      e.g. {body[0]?.[index] || "—"}
                    </p>
                  </div>
                  <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
                  <select
                    aria-label={`Field for ${name || `column ${index + 1}`}`}
                    value={effective[index]}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [index]: event.target.value as ProjectMappingTarget,
                      }))
                    }
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {targets.map((field) => (
                      <option key={field}>{field}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button disabled={!effective.includes("Name")} onClick={() => setStep(3)}>
                Preview
                <ArrowRight />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-5 space-y-4">
            {refs.isPending && <p className="text-sm text-muted-foreground">Checking rows…</p>}
            {refs.error && (
              <p className="text-sm text-health-bad-foreground">{refs.error.message}</p>
            )}
            {validation?.tooMany && (
              <Notice tone="bad">
                The file has {body.length} rows; an import takes at most {MAX_IMPORT_ROWS}. Split it
                into smaller files.
              </Notice>
            )}
            {validation && !validation.tooMany && blocked.length > 0 && (
              <Notice tone="warn">
                {blocked.length} of the {validation.rows.length} rows can't be imported and will be
                skipped.
              </Notice>
            )}
            {failure && <Notice tone="bad">Nothing was imported. {failure}</Notice>}
            {validation && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-table-head text-muted-foreground">
                    <tr>
                      <th className="h-9 px-3 font-semibold">Row</th>
                      <th className="px-3 font-semibold">Code</th>
                      <th className="px-3 font-semibold">Name</th>
                      <th className="px-3 font-semibold">Programme / portfolio</th>
                      <th className="px-3 font-semibold">Problems</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...blocked, ...warned].slice(0, 50).map((row) => (
                      <tr
                        key={row.line}
                        className={cn("border-t", row.errors.length && "bg-health-warn/5")}
                      >
                        <td className="px-3 py-2 tabular-nums">{row.line}</td>
                        <td className="px-3 py-2">{row.values?.code ?? row.cells.Code}</td>
                        <td className="px-3 py-2">{row.cells.Name || "—"}</td>
                        <td className="px-3 py-2">
                          {row.cells.Programme || row.cells.Portfolio || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.errors.map((error) => (
                            <p key={error} className="text-health-bad-foreground">
                              {error}
                            </p>
                          ))}
                          {row.warnings.map((warning) => (
                            <p key={warning} className="text-health-warn-foreground">
                              {warning}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                    {!blocked.length && !warned.length && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                          Every row is ready to import.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Codes left blank are suggested from the name. The import is all or nothing: if saving
              fails, no projects are added.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button disabled={!ready || mutations.importProjects.isPending} onClick={runImport}>
                <Upload />
                Import {ready} project{ready === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function Notice({ tone, children }: { tone: "warn" | "bad"; children: ReactNode }) {
  return (
    <div
      role={tone === "bad" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-xs",
        tone === "warn"
          ? "border-health-warn/40 bg-health-warn/10"
          : "border-health-bad/40 bg-health-bad/10",
      )}
    >
      <TriangleAlert
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "warn" ? "text-health-warn-foreground" : "text-health-bad-foreground",
        )}
      />
      <p>{children}</p>
    </div>
  );
}
