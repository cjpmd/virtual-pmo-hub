import { describe, expect, it } from "vitest";
import { TERMS_VERSION } from "@/lib/legal";
import { termsAction } from "./terms";

describe("termsAction", () => {
  it("does nothing once the current version is recorded", () => {
    expect(termsAction(true, undefined)).toBe("none");
    expect(termsAction(true, { terms_version: "2020-01-01" })).toBe("none");
  });

  it("records the sign-up form's acceptance when it captured the current version", () => {
    expect(termsAction(false, { terms_version: TERMS_VERSION, terms_accepted_at: "x" })).toBe(
      "record_signup_form",
    );
  });

  it("asks Microsoft sign-ups, older accounts and anyone on an earlier version", () => {
    expect(termsAction(false, undefined)).toBe("prompt");
    expect(termsAction(false, {})).toBe("prompt");
    expect(termsAction(false, { terms_version: "2020-01-01" })).toBe("prompt");
  });
});
