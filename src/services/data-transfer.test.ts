import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";
import { defaultSettings } from "@/data/settings-data";
import {
  MAX_IMPORT_ROWS,
  PROJECT_IMPORT_FIELDS,
  guessProjectField,
  importProjects,
  parseImportDate,
  portfolioCsvColumns,
  settingsJson,
  suggestProjectCode,
  validateProjectRows,
  type ProjectImportRefs,
} from "./data-transfer";

const refs: ProjectImportRefs = {
  portfolios: [
    { id: "pf1", name: "Digital" },
    { id: "pf2", name: "Estates" },
  ],
  programmes: [
    { id: "pg1", name: "Student Systems", portfolioId: "pf1" },
    { id: "pg2", name: "Refurbishment", portfolioId: "pf1" },
    { id: "pg3", name: "Refurbishment", portfolioId: "pf2" },
  ],
  phases: [
    { id: "ph1", name: "Initiate", shortName: "P1", gateName: null, index: 0 },
    { id: "ph2", name: "Plan", shortName: "P2", gateName: null, index: 1 },
  ],
  people: [
    { id: "r1", name: "Rowan Blake", email: "rowan@example.org", jobTitle: null, isBookable: true },
    { id: "r2", name: "Sam Lee", email: null, jobTitle: null, isBookable: true },
    { id: "r3", name: "Sam Lee", email: "sam.lee@example.org", jobTitle: null, isBookable: true },
  ],
  codes: ["SIS", "CRM"],
};

const header = [...PROJECT_IMPORT_FIELDS];
const mapping = header.map(guessProjectField);
const row = (values: Partial<Record<(typeof PROJECT_IMPORT_FIELDS)[number], string>>) =>
  header.map((field) => values[field] ?? "");
const validate = (rows: string[][], dateFormat = "DD/MM/YYYY") =>
  validateProjectRows(rows, mapping, refs, dateFormat);

describe("project import validation", () => {
  it("accepts a complete row and resolves every reference", () => {
    const result = validate([
      row({
        Code: "new1",
        Name: "New portal",
        Programme: "Student Systems",
        Phase: "Plan",
        Tier: "Large",
        State: "On Hold",
        Manager: "rowan@example.org",
        Start: "01/02/2026",
        Finish: "2026-12-31",
      }),
    ]);
    expect(result.rows[0]!.errors).toEqual([]);
    expect(result.valid).toEqual([
      {
        code: "NEW1",
        codeSuggested: false,
        name: "New portal",
        programmeId: "pg1",
        portfolioId: null,
        phaseId: "ph2",
        tier: "large",
        state: "on_hold",
        managerId: "r1",
        sponsorId: null,
        startDate: "2026-02-01",
        finishDate: "2026-12-31",
      },
    ]);
  });

  it("uses the portfolio when there is no programme, and defaults tier and state", () => {
    const [values] = validate([row({ Name: "Roof", Portfolio: "estates" })]).valid;
    expect(values).toMatchObject({
      programmeId: null,
      portfolioId: "pf2",
      tier: "medium",
      state: "active",
      phaseId: null,
    });
  });

  it("reports unknown programme, portfolio, phase, tier and state", () => {
    const [result] = validate([
      row({ Name: "X", Programme: "Nope", Phase: "Close", Tier: "Huge", State: "Done" }),
    ]).rows;
    expect(result!.errors).toEqual([
      'Unknown programme "Nope"',
      'Unknown phase "Close"',
      'Unknown tier "Huge"',
      'Unknown state "Done"',
    ]);
    expect(validate([row({ Name: "X", Portfolio: "Nope" })]).rows[0]!.errors).toEqual([
      'Unknown portfolio "Nope"',
    ]);
    expect(validate([row({ Name: "X" })]).rows[0]!.errors).toEqual([
      "A programme or a portfolio is needed",
    ]);
  });

  it("needs a portfolio to pick between programmes with the same name", () => {
    expect(validate([row({ Name: "X", Programme: "Refurbishment" })]).rows[0]!.errors).toEqual([
      'Programme "Refurbishment" is in more than one portfolio; add the portfolio',
    ]);
    const [values] = validate([
      row({ Name: "X", Programme: "Refurbishment", Portfolio: "Estates" }),
    ]).valid;
    expect(values!.programmeId).toBe("pg3");
  });

  it("rejects bad dates and a finish before the start", () => {
    expect(
      validate([row({ Name: "X", Portfolio: "Digital", Start: "31/02/2026" })]).rows[0]!.errors,
    ).toEqual(['Start "31/02/2026" is not a valid date']);
    expect(
      validate([
        row({ Name: "X", Portfolio: "Digital", Start: "2026-05-01", Finish: "2026-04-30" }),
      ]).rows[0]!.errors,
    ).toEqual(["Finish is before start"]);
  });

  it("reads dates in the organisation's format", () => {
    expect(parseImportDate("02/01/2026", "DD/MM/YYYY")).toBe("2026-01-02");
    expect(parseImportDate("02/01/2026", "MM/DD/YYYY")).toBe("2026-02-01");
    expect(parseImportDate("2.1.2026", "DD.MM.YYYY")).toBe("2026-01-02");
    expect(parseImportDate("2026-13-01", "DD/MM/YYYY")).toBeNull();
    expect(parseImportDate("next week", "DD/MM/YYYY")).toBeNull();
  });

  it("rejects codes already used, repeated in the file or badly formed", () => {
    const result = validate([
      row({ Code: "crm", Name: "A", Portfolio: "Digital" }),
      row({ Code: "NEW", Name: "B", Portfolio: "Digital" }),
      row({ Code: "new", Name: "C", Portfolio: "Digital" }),
      row({ Code: "A-1", Name: "D", Portfolio: "Digital" }),
    ]);
    expect(result.rows.map((r) => r.errors)).toEqual([
      ["Code CRM is already used"],
      [],
      ["Code NEW appears more than once in the file"],
      ['Code "A-1" must be 2–10 letters or digits'],
    ]);
    expect(result.valid.map((v) => v.code)).toEqual(["NEW"]);
  });

  it("suggests distinct codes for blank ones, avoiding existing and supplied codes", () => {
    const result = validate([
      row({ Name: "Student Information System", Portfolio: "Digital" }),
      row({ Name: "Student Insight Service", Portfolio: "Digital" }),
      row({ Code: "SIS3", Name: "Other", Portfolio: "Digital" }),
      row({ Name: "Student Info Store", Portfolio: "Digital" }),
    ]);
    expect(result.valid.map((v) => [v.code, v.codeSuggested])).toEqual([
      ["SIS2", true],
      ["SIS4", true],
      ["SIS3", false],
      ["SIS5", true],
    ]);
  });

  it("mirrors the database code suggestion for short names", () => {
    expect(suggestProjectCode("Hr", new Set())).toBe("HRP");
    expect(suggestProjectCode("A very long project name here", new Set())).toBe("AVLPNH");
  });

  it("warns and imports unassigned when a person is not found or is ambiguous", () => {
    const result = validate([
      row({ Name: "X", Portfolio: "Digital", Manager: "Nobody", Sponsor: "Sam Lee" }),
    ]);
    expect(result.rows[0]!.errors).toEqual([]);
    expect(result.rows[0]!.warnings).toEqual([
      'Manager "Nobody" not found; imported unassigned',
      'Sponsor "Sam Lee" matches 2 people; imported unassigned',
    ]);
    expect(result.valid[0]).toMatchObject({ managerId: null, sponsorId: null });
    // An email picks one of the two.
    expect(
      validate([row({ Name: "X", Portfolio: "Digital", Sponsor: "SAM.LEE@example.org" })]).valid[0]!
        .sponsorId,
    ).toBe("r3");
  });

  it(`takes at most ${MAX_IMPORT_ROWS} rows`, async () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_, i) => row({ Name: `Project ${i}`, Portfolio: "Digital" }));
    const atLimit = validate(rows(MAX_IMPORT_ROWS));
    expect(atLimit.tooMany).toBe(false);
    expect(atLimit.valid).toHaveLength(MAX_IMPORT_ROWS);
    const over = validate(rows(MAX_IMPORT_ROWS + 1));
    expect(over.tooMany).toBe(true);
    expect(over.valid).toEqual([]);
    // The service refuses an oversized batch before sending anything.
    await expect(importProjects(Array(MAX_IMPORT_ROWS + 1).fill(atLimit.valid[0]))).rejects.toThrow(
      `at most ${MAX_IMPORT_ROWS}`,
    );
  });
});

describe("shared project CSV columns", () => {
  it("maps every portfolio export column without re-mapping", () => {
    const columns = portfolioCsvColumns("GBP");
    expect(columns).toContain("Budget (GBP)");
    const guessed = columns.map(guessProjectField);
    for (const field of PROJECT_IMPORT_FIELDS)
      expect(guessed.filter((g) => g === field)).toEqual([field]);
    // Health, budget and forecast columns are ignored.
    expect(guessed.filter((g) => g === "Ignore")).toHaveLength(
      columns.length - PROJECT_IMPORT_FIELDS.length,
    );
  });
});

describe("CSV writer", () => {
  it("escapes quotes, commas and line breaks, and round-trips through the parser", () => {
    const text = toCsv(
      ["A", "B"],
      [
        ['say "hi", ok', "two\nlines"],
        [12.5, null],
      ],
    );
    expect(parseCsv(text)).toEqual([
      ["A", "B"],
      ['say "hi", ok', "two\nlines"],
      ["12.5", ""],
    ]);
  });

  it("keeps formula-like text as text but leaves numbers alone", () => {
    expect(toCsv(["A"], [["=SUM(A1)"], ["-5"], ["@x"]])).toBe("A\r\n'=SUM(A1)\r\n-5\r\n'@x");
  });
});

describe("settings export", () => {
  it("leaves out member emails, the audit log and the logo link", () => {
    const settings = {
      ...defaultSettings,
      organisation: { ...defaultSettings.organisation, logoDataUrl: "https://x/sign?token=abc" },
      users: [
        {
          id: "u1",
          name: "Rowan Blake",
          email: "rowan@example.org",
          role: "Admin" as const,
          team: "PMO",
          active: true,
        },
      ],
      data: {
        retentionMonths: 84,
        auditLog: [{ id: "a", timestamp: "", actor: "A", action: "B", detail: "C" }],
      },
    };
    const text = settingsJson(settings);
    const parsed = JSON.parse(text);
    for (const user of settings.users) expect(text).not.toContain(user.email);
    expect(text).not.toContain("token=abc");
    expect(parsed.data).toEqual({ retentionMonths: 84 });
    expect(parsed.users[0]).toMatchObject({ id: "u1", name: "Rowan Blake" });
    expect(parsed.users[0]).not.toHaveProperty("email");
    expect(parsed).not.toHaveProperty("currentUserId");
  });
});
