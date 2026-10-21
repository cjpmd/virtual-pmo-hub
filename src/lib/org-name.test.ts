import { describe, expect, it } from "vitest";
import { orgFromDomain } from "./org-name";

describe("orgFromDomain", () => {
  it("suggests a name from the first part of the domain", () => {
    expect(orgFromDomain("acme-corp.com")).toBe("Acme Corp");
    expect(orgFromDomain("Northwind.co.uk")).toBe("Northwind");
  });

  it("no longer turns .ac.uk domains into 'University of …'", () => {
    expect(orgFromDomain("dundee.ac.uk")).toBe("Dundee");
  });

  it("gives no suggestion for free email providers", () => {
    for (const domain of [
      "gmail.com",
      "googlemail.com",
      "outlook.com",
      "hotmail.co.uk",
      "live.com",
      "icloud.com",
      "yahoo.co.uk",
      "proton.me",
      "protonmail.com",
      "aol.com",
    ])
      expect(orgFromDomain(domain)).toBe("");
  });

  it("handles an empty domain", () => {
    expect(orgFromDomain("")).toBe("");
  });
});
