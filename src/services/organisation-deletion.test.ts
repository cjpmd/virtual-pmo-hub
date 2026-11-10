import { describe, expect, it } from "vitest";
import { deletionErrorMessage, emailMatches, nameMatches } from "./organisation-deletion";

describe("typed confirmations (GL-11)", () => {
  it("needs the organisation's exact name, ignoring surrounding spaces", () => {
    expect(nameMatches("  Acme Health ", "Acme Health")).toBe(true);
    expect(nameMatches("acme health", "Acme Health")).toBe(false);
    expect(nameMatches("", "")).toBe(false);
  });
  it("matches the email case-insensitively", () => {
    expect(emailMatches(" Sam@Example.org ", "sam@example.org")).toBe(true);
    expect(emailMatches("sam@example.com", "sam@example.org")).toBe(false);
    expect(emailMatches("", "")).toBe(false);
  });
});

describe("deletionErrorMessage", () => {
  it("maps the database's hints to sentences", () => {
    expect(deletionErrorMessage({ code: "reauth_required", message: "x" }, "f")).toMatch(
      /sign in again/,
    );
    expect(deletionErrorMessage({ code: "closure_not_enabled" }, "f")).toMatch(/isn't switched on/);
  });
  it("keeps the database's message for last_admin (it names the organisations)", () => {
    expect(
      deletionErrorMessage({ code: "last_admin", message: "You're the last admin of Acme." }, "f"),
    ).toBe("You're the last admin of Acme.");
  });
  it("falls back to the message, then the fallback", () => {
    expect(deletionErrorMessage({ code: "other", message: "Nope." }, "f")).toBe("Nope.");
    expect(deletionErrorMessage(null, "Fallback.")).toBe("Fallback.");
  });
});
