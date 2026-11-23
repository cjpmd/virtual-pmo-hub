import { describe, expect, it } from "vitest";
import {
  guessSchemeField,
  guessValueColumn,
  parseImportAmount,
  parseImportMonth,
  parseValueKind,
  referencedSchemes,
  validateSchemeRows,
  validateValueRows,
  valueKey,
  type SchemeImportRefs,
  type ValueImportScheme,
} from "./efficiency-import";

describe("parseImportMonth", () => {
  it.each([
    ["2026-04", "2026-04-01"],
    ["2026-04-15", "2026-04-01"],
    ["01/04/2026", "2026-04-01"],
    ["1/4/26", "2026-04-01"],
    ["04/2026", "2026-04-01"],
    ["Apr 2026", "2026-04-01"],
    ["April-26", "2026-04-01"],
    ["Sept 26", "2026-09-01"],
    ["2026 Mar", "2026-03-01"],
    ["46113", "2026-04-01"],
  ])("%s → %s", (text, month) => {
    expect(parseImportMonth(text)).toBe(month);
  });
  it("needs the financial year for a bare month name", () => {
    expect(parseImportMonth("Jan")).toBeNull();
    expect(parseImportMonth("Jan", { financialYear: 2026, startMonth: 4 })).toBe("2027-01-01");
    expect(parseImportMonth("Apr", { financialYear: 2026, startMonth: 4 })).toBe("2026-04-01");
  });
  it("refuses what isn't a month", () => {
    for (const t of ["", "Month", "13/2026", "2026-13", "Ma 26", "12345", "Total"])
      expect(parseImportMonth(t, { financialYear: 2026, startMonth: 4 })).toBeNull();
  });
});

describe("parseImportAmount", () => {
  it("reads money as spreadsheets write it", () => {
    expect(parseImportAmount("£1,250.50")).toBe(1250.5);
    expect(parseImportAmount("(1,000)")).toBe(-1000);
    expect(parseImportAmount("1234.5678")).toBe(1234.57);
    expect(parseImportAmount("-")).toBe(0);
    expect(parseImportAmount("")).toBe(0);
    expect(parseImportAmount("12k")).toBeNull();
  });
});

describe("parseValueKind", () => {
  it("knows the kinds", () => {
    expect(parseValueKind("Planned")).toBe("plan");
    expect(parseValueKind("FCST")).toBe("forecast");
    expect(parseValueKind("Actuals")).toBe("actual");
    expect(parseValueKind("Target")).toBeNull();
  });
});

describe("guessSchemeField", () => {
  it("maps common CIP tracker headings", () => {
    expect(guessSchemeField("Scheme title")).toBe("Title");
    expect(guessSchemeField("CIP Ref")).toBe("Ref");
    expect(guessSchemeField("Directorate")).toBe("Unit");
    expect(guessSchemeField("Recurrent / non-recurrent")).toBe("Recurrence");
    expect(guessSchemeField("Pay / non-pay")).toBe("Savings type");
    expect(guessSchemeField("Planning category")).toBe("Confidence");
    expect(guessSchemeField("FYE")).toBe("Full-year effect");
    expect(guessSchemeField("Executive lead")).toBe("Executive lead");
    expect(guessSchemeField("Finance lead")).toBe("Finance lead");
    expect(guessSchemeField("Scheme lead")).toBe("Scheme lead");
    expect(guessSchemeField("Status")).toBe("Stage");
    expect(guessSchemeField("Comments")).toBe("Ignore");
  });
});

const refs: SchemeImportRefs = {
  schemes: [{ ref: "EFF-1", title: "Agency reduction" }],
  people: [
    { id: "p1", name: "Asha Patel" },
    { id: "p2", name: "Sam Lee" },
    { id: "p3", name: "Sam Lee" },
  ],
  categories: [{ value: "medicines", label: "Medicines" }],
  units: ["Surgery", "Medicine"],
};
const header = [
  "Title",
  "Unit",
  "Category",
  "Savings type",
  "Recurrence",
  "Stage",
  "Confidence",
  "Scheme lead",
  "Finance lead",
  "Start month",
  "Full-year effect",
  "Ref",
] as const;

describe("validateSchemeRows", () => {
  const mapping = header.map((h) => guessSchemeField(h));
  it("maps a good row to stored values", () => {
    const result = validateSchemeRows(
      [
        [
          "Biosimilar switch",
          "medicine",
          "Medicines",
          "Non-pay",
          "R",
          "Plan in progress",
          "Plans in progress",
          "Asha Patel",
          "",
          "Apr-26",
          "£120,000",
          "",
        ],
      ],
      mapping,
      refs,
    );
    expect(result.rows[0]!.errors).toEqual([]);
    expect(result.valid).toEqual([
      expect.objectContaining({
        title: "Biosimilar switch",
        businessUnit: "Medicine",
        category: "medicines",
        savingsType: "non_pay",
        recurrence: "recurrent",
        stage: "plan_in_progress",
        confidence: "plans_in_progress",
        schemeLeadId: "p1",
        financeLeadId: null,
        startMonth: "2026-04-01",
        fullYearEffect: 120000,
      }),
    ]);
  });
  it("brings later stages in at plan in progress, with a warning", () => {
    const result = validateSchemeRows(
      [["Theatre utilisation", "", "", "", "", "In delivery", "", "", "", "", "", ""]],
      mapping,
      refs,
    );
    expect(result.valid[0]!.stage).toBe("plan_in_progress");
    expect(result.rows[0]!.warnings.join(" ")).toMatch(/finance validation/);
  });
  it("refuses unknown lists and existing refs, warns on people and repeats", () => {
    const result = validateSchemeRows(
      [
        [
          "Agency reduction",
          "Estates",
          "Cars",
          "Wages",
          "Sometimes",
          "Maybe",
          "High",
          "Sam Lee",
          "Nobody",
          "soon",
          "-5",
          "eff-1",
        ],
        ["New", "", "", "", "", "", "", "Sam Lee", "", "", "", "EFF-99"],
      ],
      mapping,
      refs,
    );
    const [bad, warned] = result.rows;
    expect(bad!.errors).toHaveLength(9);
    expect(bad!.errors.join(" ")).toMatch(/EFF-1 already exists/);
    expect(warned!.errors).toEqual([]);
    expect(warned!.warnings.join(" ")).toMatch(/more than one person/);
    expect(warned!.warnings.join(" ")).toMatch(/Ref is ignored/);
    expect(result.valid).toHaveLength(1);
  });
  it("needs a title and caps the rows", () => {
    expect(validateSchemeRows([[""]], ["Title"], refs).rows[0]!.errors).toEqual([
      "Title is required.",
    ]);
    const many = Array.from({ length: 501 }, (_, i) => [`S${i}`]);
    const result = validateSchemeRows(many, ["Title"], refs);
    expect(result.tooMany).toBe(true);
    expect(result.valid).toEqual([]);
  });
});

const schemes: ValueImportScheme[] = [
  { id: "s1", ref: "EFF-1", title: "Agency reduction", recurrence: "recurrent", editable: true },
  { id: "s2", ref: "EFF-2", title: "Car parking", recurrence: "non_recurrent", editable: true },
  { id: "s3", ref: "EFF-3", title: "Car parking", recurrence: "recurrent", editable: true },
  { id: "s4", ref: "EFF-4", title: "Locked", recurrence: "recurrent", editable: false },
];
const year = { financialYear: 2026, startMonth: 4 };

describe("guessValueColumn", () => {
  it("recognises month headings, with or without a kind", () => {
    expect(guessValueColumn("Apr-26")).toEqual({
      field: "MonthColumn",
      month: "2026-04-01",
      kind: null,
    });
    expect(guessValueColumn("Actual May 2026")).toEqual({
      field: "MonthColumn",
      month: "2026-05-01",
      kind: "actual",
    });
    expect(guessValueColumn("Feb", year)).toEqual({
      field: "MonthColumn",
      month: "2027-02-01",
      kind: null,
    });
    expect(guessValueColumn("Scheme ref")).toEqual({ field: "Scheme" });
    expect(guessValueColumn("Non-recurrent")).toEqual({ field: "Non-recurrent" });
    expect(guessValueColumn("Recurrent")).toEqual({ field: "Recurrent" });
    expect(guessValueColumn("Notes")).toEqual({ field: "Ignore" });
  });
});

describe("validateValueRows", () => {
  const options = { defaultKind: "plan" as const, split: "recurrence" as const };
  it("reads a long file", () => {
    const head = ["Scheme", "Kind", "Month", "Recurrent", "Non-recurrent"];
    const columns = head.map((h) => guessValueColumn(h));
    const result = validateValueRows(
      [
        ["EFF-1", "Actual", "Apr-26", "1,000", "250"],
        ["agency reduction", "", "2026-05", "1000", ""],
      ],
      columns,
      schemes,
      new Set(),
      options,
    );
    expect(result.rows.map((r) => r.errors)).toEqual([[], []]);
    expect(result.valid).toEqual([
      { schemeId: "s1", month: "2026-04-01", kind: "actual", recurrent: 1000, nonRecurrent: 250 },
      { schemeId: "s1", month: "2026-05-01", kind: "plan", recurrent: 1000, nonRecurrent: 0 },
    ]);
  });
  it("reads a wide file and splits amounts by the scheme's recurrence", () => {
    const head = ["Ref", "Apr", "May", "Jun", "Comments"];
    const columns = head.map((h) => guessValueColumn(h, year));
    const result = validateValueRows(
      [
        ["EFF-1", "100", "", "0", "x"],
        ["EFF-2", "50", "60", "", ""],
      ],
      columns,
      schemes,
      new Set(),
      { ...options, defaultKind: "forecast" },
    );
    expect(result.valid).toEqual([
      { schemeId: "s1", month: "2026-04-01", kind: "forecast", recurrent: 100, nonRecurrent: 0 },
      { schemeId: "s2", month: "2026-04-01", kind: "forecast", recurrent: 0, nonRecurrent: 50 },
      { schemeId: "s2", month: "2026-05-01", kind: "forecast", recurrent: 0, nonRecurrent: 60 },
    ]);
  });
  it("refuses stored values, repeats, ambiguous titles and schemes the person can't edit", () => {
    const columns = ["Scheme", "Plan Apr-26"].map((h) => guessValueColumn(h));
    const result = validateValueRows(
      [
        ["EFF-1", "10"],
        ["EFF-1", "20"],
        ["Car parking", "5"],
        ["EFF-4", "5"],
        ["EFF-9", "5"],
        ["EFF-2", "abc"],
      ],
      columns,
      schemes,
      new Set([valueKey("s1", "2026-04-01", "plan")]),
      options,
    );
    expect(result.rows.map((r) => r.errors.length)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(result.rows[0]!.errors[0]).toMatch(/already has a plan 2026-04 value/);
    expect(result.rows[1]!.errors[0]).toMatch(/already has/);
    expect(result.rows[2]!.errors[0]).toMatch(/use its ref/);
    expect(result.rows[3]!.errors[0]).toMatch(/can't add values/);
    expect(result.valid).toEqual([]);
  });
  it("reports a repeat within the file", () => {
    const columns = ["Scheme", "Plan Apr-26"].map((h) => guessValueColumn(h));
    const result = validateValueRows(
      [
        ["EFF-1", "10"],
        ["EFF-1", "20"],
      ],
      columns,
      schemes,
      new Set(),
      options,
    );
    expect(result.rows[1]!.errors[0]).toMatch(/more than once/);
    expect(result.valid).toHaveLength(1);
  });
  it("says what the file is missing", () => {
    const result = validateValueRows(
      [["EFF-1", "10"]],
      [{ field: "Scheme" }, { field: "Ignore" }],
      schemes,
      new Set(),
      options,
    );
    expect(result.rows[0]!.errors[0]).toMatch(/Month column/);
  });
  it("lists the schemes a file names", () => {
    const columns = ["Scheme"].map((h) => guessValueColumn(h));
    expect(
      referencedSchemes([["eff-2"], ["Agency reduction"]], columns, schemes).map((s) => s.id),
    ).toEqual(["s1", "s2"]);
  });
});
