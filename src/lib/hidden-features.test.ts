// GL-3: the setup wizard and customer-facing copy don't lead to features that aren't live.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("hidden features", () => {
  it("the setup wizard doesn't offer Microsoft 365", () => {
    const wizard = readFileSync("src/routes/signup.setup.tsx", "utf8");
    expect(wizard).not.toContain("/connect-microsoft");
    expect(wizard).not.toMatch(/Connect Microsoft 365/);
  });

  it("page descriptions don't name a client", () => {
    for (const file of [
      "src/routes/resources.index.tsx",
      "src/routes/portfolio.index.tsx",
      "src/routes/portfolio.collections.tsx",
    ]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\bDTS\b/);
    }
  });
});
