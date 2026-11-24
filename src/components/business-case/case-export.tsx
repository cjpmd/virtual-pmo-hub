// Export a business case version to Word (.docx) or PDF (NHS-5 item 7), in Five Case structure
// when the version's sections are grouped by case. Both come from one model
// (services/five-case-export.ts). PDF uses the browser's print dialog ("Save as PDF"): the
// document renders into .case-print-root, shown only in print, A4 portrait (styles.css). Word is
// built in the browser by services/five-case-docx.ts, loaded on demand.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileDown, Printer } from "lucide-react";
import { toast } from "sonner";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFormat } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { todayIso } from "@/lib/today";
import type { BusinessCase, CaseVersion } from "@/services/business-cases";
import { buildCaseExport, type CaseExport } from "@/services/five-case-export";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CaseExportMenu({
  businessCase,
  version,
}: {
  businessCase: BusinessCase;
  version: CaseVersion;
}) {
  const format = useFormat();
  const { organisation } = useOrganisation();
  const [printing, setPrinting] = useState(false);
  const [busy, setBusy] = useState(false);
  const model = useMemo(
    () =>
      buildCaseExport(
        businessCase,
        version,
        { currency: (n) => format.currency(n), date: (d) => format.date(d) },
        { organisationName: organisation.name, preparedOn: format.date(todayIso()) },
      ),
    [businessCase, version, format, organisation.name],
  );
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    // Let the portal render before the dialog opens.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);
  const word = async () => {
    setBusy(true);
    try {
      const { caseExportToDocx } = await import("@/services/five-case-docx");
      download(await caseExportToDocx(model), `${model.fileName}.docx`);
    } catch (error) {
      toast.error(`The Word file couldn't be made: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy}>
            <FileDown />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void word()}>
            <FileDown />
            Word document (.docx)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPrinting(true)}>
            <Printer />
            PDF (print)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {printing && createPortal(<CasePrintDocument model={model} />, document.body)}
    </>
  );
}

/** The printable document: shown only in print (styles.css .case-print-root). */
export function CasePrintDocument({ model }: { model: CaseExport }) {
  return (
    <div className="case-print-root" data-testid="case-print-root">
      <header className="case-print-cover">
        <h1>{model.title}</h1>
        <p className="case-print-subtitle">{model.subtitle}</p>
        <dl>
          {model.meta.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </header>
      {model.blocks.map((block, index) => {
        switch (block.kind) {
          case "heading": {
            const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
            return <Tag key={index}>{block.text}</Tag>;
          }
          case "note":
            return (
              <p key={index} className="case-print-note">
                {block.text}
              </p>
            );
          case "markdown":
            return (
              <div key={index} className="case-print-text">
                <Markdown source={block.text} />
              </div>
            );
          case "table":
            return (
              <table key={index}>
                <thead>
                  <tr>
                    {block.columns.map((column, i) => (
                      <th key={i} className={block.numeric?.[i] ? "num" : undefined}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((value, i) => (
                        <td key={i} className={block.numeric?.[i] ? "num" : undefined}>
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
        }
      })}
    </div>
  );
}
