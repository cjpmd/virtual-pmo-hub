import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { withoutSolicitorMarkers } from "./legal";

describe("withoutSolicitorMarkers", () => {
  it("removes review markers and the space before them", () => {
    expect(withoutSolicitorMarkers("Scottish law applies. [[solicitor to confirm]]")).toBe(
      "Scottish law applies.",
    );
    expect(
      withoutSolicitorMarkers("Capped at £1,000. [[solicitor to confirm: cap]] Then more."),
    ).toBe("Capped at £1,000. Then more.");
  });

  it("leaves other placeholders in place", () => {
    expect(withoutSolicitorMarkers("Call [[phone]].")).toBe("Call [[phone]].");
  });
});

// The legal pages are live: nothing but solicitor markers (hidden on the page) may remain.
describe("legal page sources", () => {
  const files = [
    "src/routes/terms.tsx",
    "src/routes/privacy.tsx",
    "src/routes/dpa.tsx",
    "src/routes/security.tsx",
    "src/data/subprocessors.ts",
  ];

  it.each(files)("%s has no unfilled [[placeholder]] in its text", (file) => {
    const strings = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    expect(withoutSolicitorMarkers(strings).match(/\[\[[^\]]*\]\]/g) ?? []).toEqual([]);
  });
});
