// Actuals import (design §1.5): upload a CSV, map its columns, preview every row resolved to a
// project, cost line and month with its problems, then commit in one transaction
// (commit_actuals_import). Nothing leaves the browser until the commit. Column mappings are
// remembered per organisation in localStorage, by column name: a convenience, not shared state.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { useOrgId } from "@/components/auth/organisation-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useFinancialMutations,
  useFinancialPeriods,
  useLookupOptions,
} from "@/hooks/use-financials";
import { useProjects } from "@/hooks/use-hierarchy";
import { useFormat } from "@/lib/format";
import { parseCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";
import {
  buildPreview,
  guessMapping,
  importTotals,
  monthLabel,
  toCommitRows,
  type ImportLine,
  type ImportMapping,
} from "@/services/actuals-import";
import { listCostLinesFor, listImportedReferences, type ImportMode } from "@/services/financials";

type Role = Exclude<keyof ImportMapping, "hasHeader">;
const roles: Array<{ key: Role; label: string; required?: boolean; hint?: string }> = [
  { key: "date", label: "Date or month", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "line", label: "Cost line", hint: "Map a cost line or a category" },
  { key: "category", label: "Category" },
  { key: "project", label: "Project code", hint: "Without it, every row goes to this project" },
  {
    key: "reference",
    label: "Reference",
    hint: "Invoice or journal number; duplicates are flagged",
  },
];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const storageKey = (orgId: string) => `vpmo.actualsImportMapping.${orgId}`;

/** The saved mapping (by column name) applied to this file's header, if every name is there. */
function savedMapping(orgId: string, header: string[]): ImportMapping | null {
  try {
    const raw = window.localStorage.getItem(storageKey(orgId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Record<Role, string>> & { hasHeader?: boolean };
    const mapping: ImportMapping = { ...guessMapping(header), hasHeader: saved.hasHeader ?? true };
    for (const { key } of roles) {
      const name = saved[key];
      if (!name) {
        mapping[key] = -1;
        continue;
      }
      const index = header.findIndex((column) => column.trim() === name);
      if (index < 0) return null;
      mapping[key] = index;
    }
    return mapping;
  } catch {
    return null;
  }
}

function saveMapping(orgId: string, header: string[], mapping: ImportMapping) {
  try {
    const value: Record<string, unknown> = { hasHeader: mapping.hasHeader };
    for (const { key } of roles) if (mapping[key] >= 0) value[key] = header[mapping[key]]?.trim();
    window.localStorage.setItem(storageKey(orgId), JSON.stringify(value));
  } catch {
    // Storage blocked: the mapping just isn't remembered.
  }
}

export function ActualsImportDialog({
  open,
  onOpenChange,
  workspaceId,
  defaultProject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** The project whose tab opened the import: rows without a project code go here. */
  defaultProject: { id: string; code: string } | null;
}) {
  const orgId = useOrgId();
  const format = useFormat();
  const projects = useProjects();
  const categories = useLookupOptions("cost_category");
  const periods = useFinancialPeriods();
  const { commitImport } = useFinancialMutations();
  const committing = commitImport.isPending || commitImport.isSuccess;
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [mode, setMode] = useState<ImportMode>("replace");
  const [createMissingLines, setCreateMissingLines] = useState(false);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [lookups, setLookups] = useState<{ lines: ImportLine[]; references: Set<string> } | null>(
    null,
  );

  const header = useMemo(() => file?.rows[0] ?? [], [file]);
  const columnName = (index: number) =>
    mapping?.hasHeader ? header[index]?.trim() || `Column ${index + 1}` : `Column ${index + 1}`;

  const onFile = async (chosen: File | undefined) => {
    setFileError(null);
    setFile(null);
    setMapping(null);
    setExcluded(new Set());
    setLookups(null);
    if (!chosen) return;
    if (!/\.csv$/i.test(chosen.name) && chosen.type !== "text/csv") {
      setFileError("Choose a CSV file (save the spreadsheet as CSV first).");
      return;
    }
    if (chosen.size > MAX_FILE_BYTES) {
      setFileError("That file is over 5 MB. Split it by month and import each part.");
      return;
    }
    const rows = parseCsv(await chosen.text());
    if (rows.length < 2) {
      setFileError("The file has no data rows.");
      return;
    }
    setFile({ name: chosen.name, rows });
    setMapping(savedMapping(orgId, rows[0]!) ?? guessMapping(rows[0]!));
  };

  // Cost lines of the projects the file names, and references imported before.
  const allProjects = useMemo(() => projects.data ?? [], [projects.data]);
  const defaultProjectId = defaultProject?.id ?? null;
  useEffect(() => {
    // Once a commit has started the preview is frozen: refetching would flag its own rows as
    // "imported before".
    if (!file || !mapping || committing) return;
    let cancelled = false;
    const body = mapping.hasHeader ? file.rows.slice(1) : file.rows;
    const codes = new Set(
      mapping.project >= 0
        ? body.map((row) => (row[mapping.project] ?? "").trim().toLowerCase())
        : [],
    );
    const ids = new Set(
      allProjects
        .filter((project) => codes.has(project.code.toLowerCase()))
        .map((project) => project.id),
    );
    if (mapping.project < 0 && defaultProjectId) ids.add(defaultProjectId);
    const references =
      mapping.reference >= 0
        ? body.map((row) => (row[mapping.reference] ?? "").trim()).filter(Boolean)
        : [];
    setLookups(null);
    Promise.all([listCostLinesFor([...ids]), listImportedReferences(workspaceId, references)])
      .then(([lines, found]) => {
        if (!cancelled) setLookups({ lines, references: found });
      })
      .catch((error: Error) => {
        if (!cancelled) setFileError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [file, mapping, allProjects, defaultProjectId, workspaceId, committing]);

  const ready = Boolean(
    mapping &&
    mapping.date >= 0 &&
    mapping.amount >= 0 &&
    (mapping.line >= 0 || mapping.category >= 0),
  );
  const preview = useMemo(() => {
    if (!file || !mapping || !ready || !lookups) return [];
    return buildPreview(file.rows, mapping, {
      workspaceId,
      defaultProjectId,
      projects: allProjects.map((project) => ({
        id: project.id,
        code: project.code,
        name: project.name,
        workspaceId: project.workspaceId,
      })),
      lines: lookups.lines,
      categories: (categories.data ?? []).map((item) => ({ id: item.id, label: item.label })),
      closedMonths: new Set(
        (periods.data ?? []).filter((period) => period.closed).map((period) => period.periodMonth),
      ),
      existingReferences: lookups.references,
      createMissingLines,
    });
  }, [
    file,
    mapping,
    ready,
    lookups,
    workspaceId,
    defaultProjectId,
    allProjects,
    categories.data,
    periods.data,
    createMissingLines,
  ]);

  const blocking = preview.filter((row) => row.errors.length && !excluded.has(row.rowNumber));
  const included = preview.filter((row) => !excluded.has(row.rowNumber));
  const totals = importTotals(preview, excluded);

  const commit = () => {
    if (!file || !mapping) return;
    let rows;
    try {
      rows = toCommitRows(preview, excluded);
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }
    saveMapping(orgId, header, mapping);
    commitImport.mutate(
      { workspaceId, fileName: file.name, mode, rows },
      {
        onSuccess: (result) => {
          toast.success(
            `Imported ${result.rowCount} row${result.rowCount === 1 ? "" : "s"}, ${format.currency(result.total)}` +
              (result.linesCreated
                ? `; ${result.linesCreated} new cost line${result.linesCreated === 1 ? "" : "s"}`
                : ""),
          );
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import actuals</DialogTitle>
          <DialogDescription>
            Upload a CSV export from the finance system. Nothing is saved until you import; every
            row is checked first.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm hover:bg-accent/40">
            <FileUp className="size-4" />
            {file ? file.name : "Choose a CSV file"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="CSV file"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
          </label>
          {fileError && <p className="text-sm text-destructive">{fileError}</p>}
        </section>

        {file && mapping && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">1. Map the columns</h3>
            <label className="flex w-fit items-center gap-2 text-sm">
              <Checkbox
                checked={mapping.hasHeader}
                onCheckedChange={(value) => setMapping({ ...mapping, hasHeader: value === true })}
              />
              The first row is a header
            </label>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => (
                <label key={role.key} className="block space-y-1">
                  <span className="text-xs font-medium">
                    {role.label}
                    {role.required && <span className="text-destructive"> *</span>}
                  </span>
                  <Select
                    value={String(mapping[role.key])}
                    onValueChange={(value) => setMapping({ ...mapping, [role.key]: Number(value) })}
                  >
                    <SelectTrigger aria-label={role.label}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-1">Not in the file</SelectItem>
                      {header.map((_, index) => (
                        <SelectItem key={index} value={String(index)}>
                          {columnName(index)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {role.hint && (
                    <span className="block text-[11px] text-muted-foreground">{role.hint}</span>
                  )}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-start gap-6 rounded-md bg-muted/40 p-3 text-sm">
              <RadioGroup
                value={mode}
                onValueChange={(value) => setMode(value as ImportMode)}
                className="gap-1.5"
              >
                <label className="flex items-center gap-2">
                  <RadioGroupItem value="replace" />
                  Replace: each line's actual for the month becomes the imported total
                </label>
                <label className="flex items-center gap-2">
                  <RadioGroupItem value="add" />
                  Add to what is already there
                </label>
              </RadioGroup>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={createMissingLines}
                  onCheckedChange={(value) => setCreateMissingLines(value === true)}
                />
                Create a line per category where missing
              </label>
            </div>
            {!ready && (
              <p className="text-sm text-muted-foreground">
                Map the date, the amount, and a cost line or category to see the preview.
              </p>
            )}
          </section>
        )}

        {ready && !lookups && !fileError && (
          <p className="text-sm text-muted-foreground">Checking the rows…</p>
        )}

        {preview.length > 0 && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                2. Check the rows ({included.length} of {preview.length} included
                {blocking.length ? `, ${blocking.length} with problems` : ""})
              </h3>
              {preview.some((row) => row.errors.length) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setExcluded(
                      new Set(
                        preview.filter((row) => row.errors.length).map((row) => row.rowNumber),
                      ),
                    )
                  }
                >
                  Exclude rows with problems
                </Button>
              )}
            </div>
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Include</th>
                    <th className="px-2 py-1.5 font-medium">Row</th>
                    <th className="px-2 py-1.5 font-medium">Project</th>
                    <th className="px-2 py-1.5 font-medium">Cost line</th>
                    <th className="px-2 py-1.5 font-medium">Month</th>
                    <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                    <th className="px-2 py-1.5 font-medium">Reference</th>
                    <th className="px-2 py-1.5 font-medium">Problems</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => {
                    const out = excluded.has(row.rowNumber);
                    return (
                      <tr
                        key={row.rowNumber}
                        className={cn(
                          "border-t",
                          row.errors.length && !out && "bg-destructive/5",
                          out && "text-muted-foreground line-through",
                        )}
                      >
                        <td className="px-2 py-1">
                          <Checkbox
                            aria-label={`Include row ${row.rowNumber}`}
                            checked={!out}
                            onCheckedChange={(value) =>
                              setExcluded((current) => {
                                const next = new Set(current);
                                if (value === true) next.delete(row.rowNumber);
                                else next.add(row.rowNumber);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1 tabular-nums">{row.rowNumber}</td>
                        <td className="px-2 py-1">{row.projectCode}</td>
                        <td className="px-2 py-1">{row.lineLabel}</td>
                        <td className="px-2 py-1">{row.month ? monthLabel(row.month) : ""}</td>
                        <td
                          className={cn(
                            "px-2 py-1 text-right tabular-nums",
                            (row.amount ?? 0) < 0 && "font-semibold text-health-bad-foreground",
                          )}
                        >
                          {row.amount === null ? "" : format.currency(row.amount)}
                        </td>
                        <td className="px-2 py-1">{row.reference}</td>
                        <td className="px-2 py-1">
                          {row.errors.map((error) => (
                            <span key={error} className="block text-destructive">
                              {error}
                            </span>
                          ))}
                          {row.warnings.map((warning) => (
                            <span key={warning} className="block text-health-warn-foreground">
                              {warning}
                            </span>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <TotalsTable
                title="By month"
                rows={totals.byMonth.map((item) => [
                  monthLabel(item.month),
                  format.currency(item.total),
                ])}
              />
              <TotalsTable
                title="By project"
                rows={totals.byProject.map((item) => [
                  `${item.projectCode} (${item.rows} row${item.rows === 1 ? "" : "s"})`,
                  format.currency(item.total),
                ])}
              />
            </div>
          </section>
        )}

        <DialogFooter className="items-center gap-3">
          {preview.length > 0 && (
            <span className="mr-auto text-sm text-muted-foreground">
              {blocking.length
                ? `Fix or exclude ${blocking.length} row${blocking.length === 1 ? "" : "s"} to import.`
                : `${included.length} rows, ${format.currency(totals.total)}`}
            </span>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              !preview.length || !included.length || blocking.length > 0 || commitImport.isPending
            }
            onClick={commit}
          >
            {commitImport.isPending ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TotalsTable({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="rounded-md border p-2">
      <p className="mb-1 font-semibold">{title}</p>
      {rows.length ? (
        rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 py-0.5">
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
          </div>
        ))
      ) : (
        <p className="text-muted-foreground">Nothing to import yet.</p>
      )}
    </div>
  );
}
