import { describe, expect, it } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  it("uses the singular for exactly one", () => {
    expect(plural(1, "decision")).toBe("1 decision");
    expect(plural(0, "decision")).toBe("0 decisions");
    expect(plural(2, "day")).toBe("2 days");
    expect(plural(-1, "day")).toBe("-1 days");
  });
  it("takes an irregular plural", () => {
    expect(plural(3, "action overdue", "actions overdue")).toBe("3 actions overdue");
    expect(plural(1, "action overdue", "actions overdue")).toBe("1 action overdue");
  });
});
