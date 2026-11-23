// Business case export (NHS-5 item 7): one document model for a version, in Five Case structure
// when its sections are grouped by case (Strategic, Economic, Commercial, Financial, Management),
// rendered to Word (.docx, services/five-case-docx.ts, loaded on demand) and printed to PDF
// (components/business-case/case-export.tsx). Pure: everything comes from the loaded case, and the
// formatters are the organisation's (currency, date). Standard (ungrouped) cases export in their
// own section order.
import {
  businessCaseStatusLabel,
  classificationLabel,
  type BusinessCase,
  type CaseVersion,
} from "./business-cases";
import {
  CASE_GROUPS,
  appraiseOption,
  caseGroupLabel,
  objectiveKindLabel,
  stageLabel,
  type CaseGroup,
} from "./five-case";

export type ExportBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "markdown"; text: string }
  | { kind: "note"; text: string }
  | { kind: "table"; columns: string[]; rows: string[][]; numeric?: boolean[] };

export interface CaseExport {
  title: string;
  subtitle: string;
  meta: [string, string][];
  blocks: ExportBlock[];
  /** File name without extension, safe for downloads. */
  fileName: string;
}

export interface ExportFormat {
  currency: (value: number) => string;
  date: (iso: string) => string;
}

const dash = "—";

/** A download-safe file name: letters, digits, spaces, hyphens; at most 80 characters. */
export function safeFileName(text: string) {
  const cleaned = text
    .replace(/[^\p{L}\p{N} -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  return cleaned || "Business case";
}

export function buildCaseExport(
  businessCase: Pick<BusinessCase, "title">,
  version: CaseVersion,
  format: ExportFormat,
  options: { organisationName?: string | null; preparedOn: string } = { preparedOn: "" },
): CaseExport {
  const money = (value: number | null | undefined) =>
    value === null || value === undefined ? dash : format.currency(value);
  const preferred = version.options.find((option) => option.isPreferred);
  const grouped = version.sections.some((section) => section.caseGroup);
  const staged = version.stage !== "single";
  const blocks: ExportBlock[] = [];

  const meta: [string, string][] = [
    ["Stage", stageLabel[version.stage]],
    ["Version", `v${version.version} · ${businessCaseStatusLabel[version.status]}`],
  ];
  if (version.submittedAt)
    meta.push([
      "Submitted",
      `${format.date(version.submittedAt)}${version.submittedBy ? ` by ${version.submittedBy}` : ""}`,
    ]);
  if (version.decidedAt) meta.push(["Decided", format.date(version.decidedAt)]);
  meta.push(["Whole-life cost", money(preferred?.wholeLifeCost ?? version.wholeLifeCost)]);
  if (version.fundingRequested !== null)
    meta.push(["Funding requested", money(version.fundingRequested)]);
  if (preferred) meta.push(["Preferred option", preferred.name]);
  if (options.organisationName) meta.push(["Organisation", options.organisationName]);
  if (options.preparedOn) meta.push(["Exported", options.preparedOn]);

  const sectionBlocks = (section: CaseVersion["sections"][number]): ExportBlock[] => [
    { kind: "heading", level: 2, text: section.title },
    section.content.trim()
      ? { kind: "markdown", text: section.content }
      : { kind: "note", text: "Not written yet." },
  ];

  const objectivesBlocks = (): ExportBlock[] => {
    if (!version.objectives.length) return [];
    return [
      { kind: "heading", level: 3, text: "Spending objectives and critical success factors" },
      {
        kind: "table",
        columns: ["Type", "Objective or factor", "Measure"],
        rows: [...version.objectives]
          .sort((a, b) =>
            a.kind === b.kind
              ? a.sortOrder - b.sortOrder
              : a.kind === "spending_objective"
                ? -1
                : 1,
          )
          .map((o) => [
            objectiveKindLabel[o.kind],
            o.description ? `${o.title}: ${o.description}` : o.title,
            o.measure ?? dash,
          ]),
      },
    ];
  };

  const optionsBlocks = (): ExportBlock[] => {
    if (!version.options.length) return [];
    const out: ExportBlock[] = [
      {
        kind: "heading",
        level: 2,
        text: staged || grouped ? "Options (long and short list)" : "Options",
      },
      {
        kind: "table",
        columns: ["Option", "List", "Whole-life cost", "Delivery cost", "Notes"],
        numeric: [false, false, true, true, false],
        rows: version.options.map((o) => [
          `${o.name}${o.isPreferred ? " (preferred)" : ""}`,
          o.listStage === "long" ? "Long list (discounted)" : "Short list",
          money(o.wholeLifeCost),
          money(o.deliveryCost),
          [o.shortlistNote, o.description].filter(Boolean).join(" · ") || dash,
        ]),
      },
    ];
    const appraised = version.options.filter(
      (o) => o.listStage === "short" && version.optionYears.some((y) => y.optionId === o.id),
    );
    if (appraised.length) {
      out.push(
        { kind: "heading", level: 3, text: "Appraisal summary" },
        {
          kind: "note",
          text: `Present values at a ${version.discountRate}% discount rate over ${version.appraisalYears} years${
            version.priceBaseYear ? `, ${version.priceBaseYear} prices` : ""
          }, with each option's optimism bias added to its costs. An aid to the economic case, not a substitute for finance review.`,
        },
        {
          kind: "table",
          columns: [
            "Option",
            "PV costs (with bias)",
            "PV cash benefits",
            "PV non-cash benefits",
            "NPV",
            "NPSV",
            "BCR",
          ],
          numeric: [false, true, true, true, true, true, true],
          rows: appraised.map((o) => {
            const r = appraiseOption(
              version.optionYears.filter((y) => y.optionId === o.id),
              {
                discountRatePct: version.discountRate,
                appraisalYears: version.appraisalYears,
                optimismBiasPct: o.optimismBiasPct,
              },
            );
            return [
              `${o.name}${o.isPreferred ? " (preferred)" : ""}`,
              money(r.pvCostAdjusted),
              money(r.pvCashBenefit),
              money(r.pvNonCashBenefit),
              money(r.npv),
              money(r.npsv),
              r.bcr === null ? dash : r.bcr.toFixed(2),
            ];
          }),
        },
      );
    }
    return out;
  };

  const benefitsBlocks = (): ExportBlock[] => {
    if (!version.benefits.length) return [];
    const total = version.benefits.reduce((sum, b) => sum + b.annualValue * b.yearsCounted, 0);
    return [
      { kind: "heading", level: 2, text: "Benefits" },
      {
        kind: "table",
        columns: ["Benefit", "Classification", "Measure", "Annual value", "Years", "Counted"],
        numeric: [false, false, false, true, true, true],
        rows: [
          ...version.benefits.map((b) => [
            b.title,
            classificationLabel[b.classification],
            b.measure ?? dash,
            money(b.annualValue),
            String(b.yearsCounted),
            money(b.annualValue * b.yearsCounted),
          ]),
          ["Total", "", "", "", "", money(total)],
        ],
      },
    ];
  };

  const financialBlocks = (): ExportBlock[] => {
    if (!preferred) return [];
    const years = version.optionYears.filter((y) => y.optionId === preferred.id);
    const out: ExportBlock[] = [
      { kind: "heading", level: 3, text: "Affordability of the preferred option" },
      {
        kind: "table",
        columns: ["Measure", "Amount"],
        numeric: [false, true],
        rows: [
          ["Whole-life cost", money(preferred.wholeLifeCost)],
          ["Delivery cost (the project budget once approved)", money(preferred.deliveryCost)],
          ["Funding requested", money(version.fundingRequested)],
        ],
      },
    ];
    if (years.length) {
      const sorted = [...years].sort((a, b) => a.yearIndex - b.yearIndex);
      out.push({
        kind: "table",
        columns: ["Year", "Capital", "Revenue", "Total"],
        numeric: [false, true, true, true],
        rows: sorted.map((y) => [
          `Year ${y.yearIndex}${version.priceBaseYear ? ` (${version.priceBaseYear + y.yearIndex})` : ""}`,
          money(y.capitalCost),
          money(y.revenueCost),
          money(y.capitalCost + y.revenueCost),
        ]),
      });
    }
    return out;
  };

  if (grouped) {
    const extras: Record<CaseGroup, ExportBlock[]> = {
      strategic: [],
      economic: [...optionsBlocks(), ...benefitsBlocks()],
      commercial: [],
      financial: financialBlocks(),
      management: [],
    };
    const ungrouped = version.sections.filter((s) => !s.caseGroup);
    let objectivesPlaced = false;
    for (const group of CASE_GROUPS) {
      const sections = version.sections.filter((s) => s.caseGroup === group);
      if (!sections.length && !extras[group].length) continue;
      blocks.push({ kind: "heading", level: 1, text: caseGroupLabel[group] });
      for (const section of sections) {
        blocks.push(...sectionBlocks(section));
        if (section.key === "fc_case_for_change") {
          blocks.push(...objectivesBlocks());
          objectivesPlaced = true;
        }
      }
      if (group === "strategic" && !objectivesPlaced) {
        blocks.push(...objectivesBlocks());
        objectivesPlaced = true;
      }
      blocks.push(...extras[group]);
    }
    if (ungrouped.length) {
      blocks.push({ kind: "heading", level: 1, text: "Other sections" });
      for (const section of ungrouped) blocks.push(...sectionBlocks(section));
    }
  } else {
    for (const section of version.sections) blocks.push(...sectionBlocks(section));
    blocks.push(...objectivesBlocks(), ...optionsBlocks(), ...benefitsBlocks());
  }

  if (version.approval) {
    const decisions = version.approval.steps.map((step) => [
      step.name,
      step.decision === "approved"
        ? "Approved"
        : step.decision === "rejected"
          ? "Rejected"
          : "Awaiting decision",
      step.approverName ?? dash,
      step.decidedAt ? format.date(step.decidedAt) : dash,
      step.comment ?? dash,
    ]);
    blocks.push(
      { kind: "heading", level: 1, text: "Approval record" },
      {
        kind: "table",
        columns: ["Step", "Decision", "Recorded by", "Date", "Comment or conditions"],
        rows: decisions,
      },
    );
  }

  const title = businessCase.title;
  return {
    title,
    subtitle: staged ? stageLabel[version.stage] : "Business case",
    meta,
    blocks,
    fileName: safeFileName(
      `${title} ${staged ? version.stage.toUpperCase() : ""} v${version.version}`,
    ),
  };
}

// ---- Markdown for Word -----------------------------------------------------------------------

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}
export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3; runs: TextRun[] }
  | { kind: "bullet" | "number"; runs: TextRun[] }
  | { kind: "paragraph"; runs: TextRun[] };

/** Inline **bold**, *italic* / _italic_ and `code`, as lib/markdown.tsx reads them. */
export function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) runs.push({ text: text.slice(last, match.index) });
    const token = match[0];
    if (token.startsWith("**")) runs.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith("`")) runs.push({ text: token.slice(1, -1), code: true });
    else runs.push({ text: token.slice(1, -1), italic: true });
    last = match.index + token.length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs;
}

/** The same small Markdown subset as lib/markdown.tsx, as blocks for the Word export. */
export function markdownBlocks(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  const bullet = /^\s*[-*]\s+/;
  const numbered = /^\s*\d+[.)]\s+/;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "#").length as 1 | 2 | 3,
        runs: inlineRuns(heading[2] ?? ""),
      });
      i++;
      continue;
    }
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const rule = ordered ? numbered : bullet;
      while (i < lines.length && rule.test(lines[i] ?? "")) {
        blocks.push({
          kind: ordered ? "number" : "bullet",
          runs: inlineRuns((lines[i] ?? "").replace(rule, "")),
        });
        i++;
      }
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !/^(#{1,3})\s/.test(lines[i] ?? "") &&
      !bullet.test(lines[i] ?? "") &&
      !numbered.test(lines[i] ?? "")
    ) {
      para.push(lines[i] ?? "");
      i++;
    }
    blocks.push({ kind: "paragraph", runs: inlineRuns(para.join(" ")) });
  }
  return blocks;
}
