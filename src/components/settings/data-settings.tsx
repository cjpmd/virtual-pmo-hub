import { useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { todayIso } from "@/lib/today";
import { useSettings } from "@/services/settings";
import {
  NumberField,
  SettingsCard,
  useCanEditSettings,
} from "@/components/settings/settings-shell";
import { useOrgId } from "@/components/auth/organisation-provider";
import { LessonsImport } from "@/components/lessons-import";
import { ProjectImport } from "@/components/settings/project-import";
import { SampleDataSettings } from "@/components/settings/sample-data-settings";
import { useCan } from "@/hooks/use-permissions";
import { useLessons } from "@/hooks/use-lessons";
import { downloadText } from "@/lib/csv";
import { portfolioCsv, settingsJson } from "@/services/data-transfer";
import { exportAllData } from "@/services/organisation-export";
import { errorMessage } from "@/services/service-error";
import { toast } from "sonner";
import { patch } from "./settings-helpers";

/** The Lessons page's import wizard, with the lessons data it needs loaded on open. */
function SettingsLessonsImport({ close }: { close: () => void }) {
  const lessons = useLessons();
  const failed = lessons.error?.message;
  useEffect(() => {
    if (!failed) return;
    toast.error(failed);
    close();
  }, [failed, close]);
  if (!lessons.data) return null;
  return <LessonsImport data={lessons.data} close={close} />;
}

export function DataSettings() {
  const settings = useSettings();
  const data = settings.data;
  const orgId = useOrgId();
  // The card is open to everyone; each button carries its own rule (RLS still enforces writes).
  const canImportProjects = useCanEditSettings("pmo");
  const canImportLessons = useCan("contributor");
  const canExportSettings = useCanEditSettings("admin");
  const [open, setOpen] = useState<"projects" | "lessons" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  // GL-11b: every organisation table as JSON in a zip, built by the export-organisation edge
  // function; the browser follows the 24-hour signed link to download it.
  const exportEverything = async () => {
    setExportingAll(true);
    try {
      const result = await exportAllData(orgId);
      window.location.assign(result.url);
      toast.success(
        `Export ready: ${result.rows.toLocaleString("en-GB")} records from ${result.tables} tables. The link works for 24 hours.`,
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setExportingAll(false);
    }
  };
  const exportPortfolio = async () => {
    setExporting(true);
    try {
      // A byte-order mark so spreadsheet apps read the file as UTF-8.
      downloadText(`portfolio-${todayIso()}.csv`, `\ufeff${await portfolioCsv(orgId, settings)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The export failed.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <SettingsCard
        requires="self"
        title="Import and export"
        description="Move data in and out of the workspace."
      >
        <div className="flex flex-wrap gap-2">
          {canImportProjects && (
            <Button variant="outline" onClick={() => setOpen("projects")}>
              <Upload />
              Import projects (CSV)
            </Button>
          )}
          {canImportLessons && (
            <Button variant="outline" onClick={() => setOpen("lessons")}>
              <Upload />
              Import lessons (CSV)
            </Button>
          )}
          <Button variant="outline" disabled={exporting} onClick={() => void exportPortfolio()}>
            <Download />
            Export portfolio (CSV)
          </Button>
          {canExportSettings && (
            <Button
              variant="outline"
              onClick={() =>
                downloadText(
                  `settings-${todayIso()}.json`,
                  settingsJson(settings),
                  "application/json",
                )
              }
            >
              <Download />
              Export settings (JSON)
            </Button>
          )}
          {canExportSettings && (
            <Button
              variant="outline"
              disabled={exportingAll}
              onClick={() => void exportEverything()}
              data-testid="export-all-data"
            >
              <Download />
              {exportingAll ? "Preparing export…" : "Export all data (zip)"}
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          The portfolio export has ISO dates (YYYY-MM-DD) and plain amounts in{" "}
          {settings.regional.baseCurrency}, and re-imports with the same columns. Importing projects
          is for PMO members and admins; exporting settings is for admins.
        </p>
        {canExportSettings && (
          <p className="mt-2 text-xs text-muted-foreground">
            Export all data gives admins a zip with every record in the organisation as JSON (one
            file per table) and a manifest listing your uploaded files. It works while the
            organisation is read-only. The download link lasts 24 hours and the zip is removed after
            7 days.
          </p>
        )}
      </SettingsCard>
      {open === "projects" && <ProjectImport close={() => setOpen(null)} />}
      {open === "lessons" && <SettingsLessonsImport close={() => setOpen(null)} />}
      {canExportSettings && <SampleDataSettings />}
      <SettingsCard
        title="Retention"
        description="How long closed records are kept before archiving."
      >
        <div className="max-w-xs">
          <NumberField
            label="Retention period (months)"
            value={data.retentionMonths}
            onChange={(value) => patch("data", { retentionMonths: Math.max(12, value) })}
            min={12}
            hint={`${Math.round(data.retentionMonths / 12)} years`}
          />
        </div>
      </SettingsCard>
      <SettingsCard
        requires="self"
        title="Audit log"
        description="Recent changes across the organisation. Visible to PMO members and admins."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-table-head text-xs text-muted-foreground">
              <tr>
                <th className="h-10 px-3 font-semibold">When</th>
                <th className="px-3 font-semibold">Who</th>
                <th className="px-3 font-semibold">Action</th>
                <th className="px-3 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {!data.auditLog.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No audit entries you can see.
                  </td>
                </tr>
              )}
              {data.auditLog.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {formatDate(entry.timestamp, settings)} {entry.timestamp.slice(11, 16)}
                  </td>
                  <td className="px-3 py-2.5">{entry.actor}</td>
                  <td className="px-3 py-2.5 font-medium">{entry.action}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{entry.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>
    </>
  );
}
