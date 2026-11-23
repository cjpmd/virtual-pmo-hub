// Efficiency import (NHS-4 part 5): new schemes, or monthly values for existing schemes, from a
// CSV or XLSX file. Upload → map columns → preview → import, all or nothing. The rules (and why
// later stages come in at Plan in progress, and stored values are never replaced) are in
// services/efficiency-import.ts.
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Download, TriangleAlert, Upload, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  VALUE_KINDS,
  VALUE_KIND_LABELS,
  financialYearLabel,
  type ValueKind,
} from "@/data/efficiency";
import { useEfficiencyMutations, useSchemeOptions } from "@/hooks/use-efficiency";
import { useWorkspaceRoles } from "@/hooks/use-permissions";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { downloadText, parseCsv } from "@/lib/csv";
import { useFormat } from "@/lib/format";
import { useModuleTerm } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { readTableFile } from "@/lib/xlsx-read";
import { atLeast } from "@/services/auth";
import type { EfficiencyScheme } from "@/services/efficiency";
import {
  MAX_SCHEME_IMPORT_ROWS,
  MAX_VALUE_IMPORT_VALUES,
  SCHEME_IMPORT_FIELDS,
  VALUE_FIELDS,
  columnLabel,
  guessSchemeField,
  guessValueColumn,
  loadExistingValueKeys,
  referencedSchemes,
  schemeImportTemplate,
  validateSchemeRows,
  validateValueRows,
  valueImportTemplate,
  type AmountSplit,
  type SchemeMappingTarget,
  type ValueColumn,
  type ValueImportScheme,
} from "@/services/efficiency-import";

export type ImportMode = "schemes" | "values";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const schemeTargets: SchemeMappingTarget[] = ["Ignore", ...SCHEME_IMPORT_FIELDS];

interface Props {
  schemes: EfficiencyScheme[];
  financialYear: number;
  close: () => void;
}

export function EfficiencyImport({ schemes, financialYear, close }: Props) {
  const term = useModuleTerm();
  const fmt = useFormat();
  const mutations = useEfficiencyMutations();
  const options = useSchemeOptions();
  const roles = useWorkspaceRoles().data ?? [];
  const workspaces = (useWorkspaces().data ?? []).filter(
    (w) => !w.archivedAt && roles.some((r) => r.workspaceId === w.id && atLeast(r.role, "manager")),
  );
  const managed = new Set(workspaces.map((w) => w.id));
  const startMonth = fmt.settings.regional.financialYearStartMonth || 4;
  const units = fmt.settings.lists.businessUnits ?? [];

  const [mode, setMode] = useState<ImportMode>("schemes");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<string[][]>([]);
  const [text, setText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [schemeMapping, setSchemeMapping] = useState<Record<number, SchemeMappingTarget>>({});
  const [valueMapping, setValueMapping] = useState<Record<number, ValueColumn>>({});
  const [workspaceId, setWorkspaceId] = useState("");
  const [year, setYear] = useState(financialYear);
  const [defaultKind, setDefaultKind] = useState<ValueKind>("plan");
  const [split, setSplit] = useState<AmountSplit>("recurrence");
  const [failure, setFailure] = useState<string | null>(null);

  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const ws = workspaceId || workspaces[0]?.id || "";
  const fy = { financialYear: year, startMonth };
  const schemeColumns = header.map((h, i) => schemeMapping[i] ?? guessSchemeField(h));
  const valueColumns = header.map((h, i) => valueMapping[i] ?? guessValueColumn(h, fy));

  const importSchemesList: ValueImportScheme[] = schemes.map((s) => ({
    id: s.id,
    ref: s.ref,
    title: s.title,
    recurrence: s.recurrence,
    editable: managed.has(s.workspaceId),
  }));
  const named =
    mode === "values" && step === 3
      ? referencedSchemes(body, valueColumns, importSchemesList).map((s) => s.id)
      : [];
  const existing = useQuery({
    queryKey: ["efficiency-import-existing", named],
    queryFn: () => loadExistingValueKeys(named),
    enabled: mode === "values" && step === 3,
    staleTime: 0,
  });

  const schemeCheck =
    mode === "schemes" && step === 3 && options.data
      ? validateSchemeRows(body, schemeColumns, {
          schemes: schemes.map((s) => ({ ref: s.ref, title: s.title })),
          people: options.data.people,
          categories: options.data.categories,
          units,
        })
      : null;
  const valueCheck =
    mode === "values" && step === 3 && existing.data
      ? validateValueRows(body, valueColumns, importSchemesList, existing.data, {
          defaultKind,
          split,
        })
      : null;
  const check = schemeCheck ?? valueCheck;
  const problemRows = (check?.rows ?? []).filter((r) => r.errors.length || r.warnings.length);
  const blocked = (check?.rows ?? []).filter((r) => r.errors.length).length;
  const ready = schemeCheck ? schemeCheck.valid.length : (valueCheck?.valid.length ?? 0);
  const busy = mutations.importSchemes.isPending || mutations.importValues.isPending;

  const reset = (next: string[][]) => {
    setRows(next);
    setSchemeMapping({});
    setValueMapping({});
    setFailure(null);
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      reset(await readTableFile(file, parseCsv));
      setText("");
    } catch (error) {
      reset([]);
      setFileError(error instanceof Error ? error.message : "Couldn't read the file.");
    }
  };
  const runImport = () => {
    setFailure(null);
    const done = (count: number, noun: string) => {
      toast.success(`${count} ${noun}${count === 1 ? "" : "s"} imported.`);
      close();
    };
    const fail = (error: Error) => setFailure(error.message);
    if (schemeCheck)
      mutations.importSchemes.mutate(
        { workspaceId: ws, rows: schemeCheck.valid },
        { onSuccess: (n) => done(n, "scheme"), onError: fail },
      );
    else if (valueCheck)
      mutations.importValues.mutate(valueCheck.valid, {
        onSuccess: (n) => done(n, "value"),
        onError: fail,
      });
  };
  const canPreview =
    mode === "schemes"
      ? schemeColumns.includes("Title") && Boolean(ws)
      : valueColumns.some((c) => c.field === "Scheme");

  return (
    <>
      <button aria-label="Close import" className="fixed inset-0 z-40 bg-overlay" onClick={close} />
      <aside
        role="dialog"
        aria-label={`Import ${term("efficiency.schemePlural").toLowerCase()}`}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-3xl overflow-y-auto border-l bg-background p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Step {step} of 3</p>
            <h2 className="mt-2 font-display text-xl font-semibold">
              Import{" "}
              {mode === "schemes"
                ? term("efficiency.schemePlural").toLowerCase()
                : "monthly values"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "schemes"
                ? `New ${term("efficiency.schemePlural").toLowerCase()} from a CSV or Excel file, up to ${MAX_SCHEME_IMPORT_ROWS} rows. Existing schemes are not changed.`
                : `Plan, forecast or actual values for existing schemes, found by ref or exact title, up to ${MAX_VALUE_IMPORT_VALUES} values. Months that already have a value are left alone.`}{" "}
              Do not enter patient-identifiable information.
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={close} aria-label="Close">
            <X />
          </Button>
        </div>

        <div className="mt-5 flex gap-2" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={cn("h-1.5 flex-1 rounded-full", n <= step ? "bg-primary" : "bg-muted")}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="mt-5 space-y-4">
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-semibold text-muted-foreground">
                What to import
              </legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {(["schemes", "values"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="efficiency-import-mode"
                      checked={mode === m}
                      onChange={() => {
                        setMode(m);
                        setSchemeMapping({});
                        setValueMapping({});
                      }}
                    />
                    {m === "schemes"
                      ? `New ${term("efficiency.schemePlural").toLowerCase()}`
                      : "Monthly values"}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                CSV or Excel (.xlsx) file
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => void readFile(event.target.files?.[0])}
                className="block text-sm"
              />
              <span className="block text-xs text-muted-foreground">
                The first worksheet is read; the first row holds the headings.
              </span>
            </label>
            {fileError && <Notice tone="bad">{fileError}</Notice>}
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Or paste CSV</span>
              <Textarea
                rows={8}
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  reset(event.target.value.trim() ? parseCsv(event.target.value) : []);
                }}
                placeholder="Paste the CSV here, including the header row…"
                className="font-mono text-xs"
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                mode === "schemes"
                  ? downloadText("scheme-import-template.csv", schemeImportTemplate())
                  : downloadText("scheme-values-import-template.csv", valueImportTemplate())
              }
            >
              <Download />
              Download template
            </Button>
            <p className="text-xs text-muted-foreground">
              {rows.length
                ? `${body.length} data rows and ${header.length} columns found.`
                : "Nothing read yet."}
              {mode === "values" &&
                " One row per scheme, month and kind, or one row per scheme with a column per month (Apr-26, May-26, …)."}
            </p>
            <Button disabled={!body.length} onClick={() => setStep(2)}>
              Map columns
              <ArrowRight />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="mt-5 space-y-4">
            {mode === "schemes" ? (
              <label className="block text-xs">
                <span className="block font-semibold text-muted-foreground">Workspace</span>
                {workspaces.length ? (
                  <select
                    className={selectClass}
                    value={ws}
                    onChange={(e) => setWorkspaceId(e.target.value)}
                  >
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm">
                    You need to be a manager or above in an active workspace to import schemes.
                  </span>
                )}
              </label>
            ) : (
              <div className="flex flex-wrap gap-4">
                <label className="text-xs">
                  <span className="block font-semibold text-muted-foreground">
                    Financial year (for headings like "Apr")
                  </span>
                  <select
                    className={selectClass}
                    value={year}
                    onChange={(e) => {
                      setYear(Number(e.target.value));
                      setValueMapping({});
                    }}
                  >
                    {[financialYear - 1, financialYear, financialYear + 1, financialYear + 2].map(
                      (y) => (
                        <option key={y} value={y}>
                          {financialYearLabel(y, startMonth)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="block font-semibold text-muted-foreground">
                    Kind when the file doesn't say
                  </span>
                  <select
                    className={selectClass}
                    value={defaultKind}
                    onChange={(e) => setDefaultKind(e.target.value as ValueKind)}
                  >
                    {VALUE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {VALUE_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="block font-semibold text-muted-foreground">
                    Single amounts are
                  </span>
                  <select
                    className={selectClass}
                    value={split}
                    onChange={(e) => setSplit(e.target.value as AmountSplit)}
                  >
                    <option value="recurrence">Recurrent unless the scheme is non-recurrent</option>
                    <option value="recurrent">Recurrent</option>
                    <option value="non_recurrent">Non-recurrent</option>
                  </select>
                </label>
              </div>
            )}
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
                  <ArrowRight
                    className="hidden size-4 text-muted-foreground sm:block"
                    aria-hidden
                  />
                  {mode === "schemes" ? (
                    <select
                      aria-label={`Field for ${name || `column ${index + 1}`}`}
                      value={schemeColumns[index]}
                      onChange={(e) =>
                        setSchemeMapping((m) => ({
                          ...m,
                          [index]: e.target.value as SchemeMappingTarget,
                        }))
                      }
                      className={selectClass}
                    >
                      {schemeTargets.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  ) : (
                    <ValueColumnSelect
                      label={name || `column ${index + 1}`}
                      value={valueColumns[index]!}
                      guessed={guessValueColumn(name, fy)}
                      onChange={(c) => setValueMapping((m) => ({ ...m, [index]: c }))}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button disabled={!canPreview} onClick={() => setStep(3)}>
                Preview
                <ArrowRight />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="mt-5 space-y-4">
            {(options.isPending || existing.isFetching) && (
              <p className="text-sm text-muted-foreground">Checking rows…</p>
            )}
            {(options.error || existing.error) && (
              <Notice tone="bad">{(options.error ?? existing.error)!.message}</Notice>
            )}
            {check?.tooMany && (
              <Notice tone="bad">
                The file is too big for one import ({MAX_SCHEME_IMPORT_ROWS} rows
                {mode === "values" ? ` or ${MAX_VALUE_IMPORT_VALUES} values` : ""}). Split it into
                smaller files.
              </Notice>
            )}
            {check && !check.tooMany && blocked > 0 && (
              <Notice tone="warn">
                {blocked} of the {check.rows.length} rows can't be imported and will be skipped.
              </Notice>
            )}
            {failure && <Notice tone="bad">Nothing was imported. {failure}</Notice>}
            {check && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[600px] text-left text-xs">
                  <caption className="sr-only">Rows with problems</caption>
                  <thead className="bg-table-head text-muted-foreground">
                    <tr>
                      <th scope="col" className="h-9 px-3 font-semibold">
                        Row
                      </th>
                      <th scope="col" className="px-3 font-semibold">
                        {mode === "schemes" ? "Title" : "Scheme"}
                      </th>
                      <th scope="col" className="px-3 font-semibold">
                        Problems
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {problemRows.slice(0, 50).map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={cn(
                          "border-t align-top",
                          row.errors.length && "bg-health-warn/5",
                        )}
                      >
                        <td className="px-3 py-2 tabular-nums">{row.rowNumber}</td>
                        <td className="px-3 py-2">
                          {("title" in row ? row.title : row.scheme) || "—"}
                        </td>
                        <td className="px-3 py-2">
                          {row.errors.map((e) => (
                            <p key={e} className="text-health-bad-foreground">
                              <span className="sr-only">Error: </span>
                              {e}
                            </p>
                          ))}
                          {row.warnings.map((w) => (
                            <p key={w} className="text-health-warn-foreground">
                              <span className="sr-only">Warning: </span>
                              {w}
                            </p>
                          ))}
                        </td>
                      </tr>
                    ))}
                    {!problemRows.length && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                          Every row is ready to import.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {problemRows.length > 50 && (
                  <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                    Showing the first 50 of {problemRows.length} rows with problems.
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              The import is all or nothing: if saving fails, nothing is added.
              {mode === "values" &&
                " Imported actuals still need finance validation on each scheme."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button disabled={!ready || busy || Boolean(check?.tooMany)} onClick={runImport}>
                <Upload />
                Import {ready} {mode === "schemes" ? "scheme" : "value"}
                {ready === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

/** A values column's field. A detected month heading can be kept or ignored. */
function ValueColumnSelect({
  label,
  value,
  guessed,
  onChange,
}: {
  label: string;
  value: ValueColumn;
  guessed: ValueColumn;
  onChange: (column: ValueColumn) => void;
}) {
  const monthOption = guessed.field === "MonthColumn" ? guessed : null;
  const current = value.field === "MonthColumn" ? "MonthColumn" : value.field;
  return (
    <select
      aria-label={`Field for ${label}`}
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v === "MonthColumn" && monthOption ? monthOption : ({ field: v } as ValueColumn));
      }}
      className={selectClass}
    >
      <option value="Ignore">Ignore</option>
      {monthOption && <option value="MonthColumn">Month: {columnLabel(monthOption)}</option>}
      {VALUE_FIELDS.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
    </select>
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
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "warn" ? "text-health-warn-foreground" : "text-health-bad-foreground",
        )}
      />
      <p>{children}</p>
    </div>
  );
}
