import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALLOWED_ORIGINS,
  allowedOrigin,
  allowedOrigins,
  bearerMatches,
} from "./report-pdf-guard";

const PROD = "https://pmo.originoverthrow.com";

describe("allowedOrigins", () => {
  it("defaults to the production app", () => {
    expect(allowedOrigins(undefined)).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(allowedOrigins("")).toEqual([PROD]);
    expect(allowedOrigins(" , ")).toEqual([PROD]);
  });

  it("normalises entries to origins and drops anything that isn't an http(s) URL", () => {
    expect(
      allowedOrigins(
        `${PROD}/, https://preview--ormo.lovable.app/some/path, not a url, ftp://files.example, ${PROD}`,
      ),
    ).toEqual([PROD, "https://preview--ormo.lovable.app"]);
  });
});

describe("allowedOrigin", () => {
  const allowed = [PROD, "https://preview--ormo.lovable.app"];

  it("accepts an allowed origin, with or without a path or trailing slash", () => {
    expect(allowedOrigin(PROD, allowed)).toBe(PROD);
    expect(allowedOrigin(`${PROD}/`, allowed)).toBe(PROD);
    expect(allowedOrigin(`${PROD}/anything?x=1`, allowed)).toBe(PROD);
    expect(allowedOrigin("HTTPS://PMO.originoverthrow.com", allowed)).toBe(PROD);
    expect(allowedOrigin("https://preview--ormo.lovable.app", allowed)).toBe(
      "https://preview--ormo.lovable.app",
    );
  });

  it("refuses hosts that only look like the app", () => {
    expect(allowedOrigin("https://pmo.originoverthrow.com.evil.example", allowed)).toBeNull();
    expect(allowedOrigin("https://evil.example/pmo.originoverthrow.com", allowed)).toBeNull();
    expect(
      allowedOrigin("https://evil.example?https://pmo.originoverthrow.com", allowed),
    ).toBeNull();
    expect(allowedOrigin("https://xpmo.originoverthrow.com", allowed)).toBeNull();
    expect(allowedOrigin("https://originoverthrow.com", allowed)).toBeNull();
  });

  it("refuses credentials, other ports and other schemes", () => {
    expect(allowedOrigin("https://pmo.originoverthrow.com@evil.example", allowed)).toBeNull();
    expect(allowedOrigin("https://user:pass@pmo.originoverthrow.com", allowed)).toBeNull();
    expect(allowedOrigin("https://pmo.originoverthrow.com:8443", allowed)).toBeNull();
    expect(allowedOrigin("http://pmo.originoverthrow.com", allowed)).toBeNull();
    expect(allowedOrigin("file:///etc/passwd", allowed)).toBeNull();
    expect(allowedOrigin("javascript:alert(1)", allowed)).toBeNull();
    expect(allowedOrigin("http://169.254.169.254/latest/meta-data", allowed)).toBeNull();
  });

  it("refuses missing or malformed values", () => {
    expect(allowedOrigin(undefined, allowed)).toBeNull();
    expect(allowedOrigin(null, allowed)).toBeNull();
    expect(allowedOrigin(42, allowed)).toBeNull();
    expect(allowedOrigin("", allowed)).toBeNull();
    expect(allowedOrigin("pmo.originoverthrow.com", allowed)).toBeNull();
  });

  it("allows plain http only when that exact origin is listed (local testing)", () => {
    expect(allowedOrigin("http://localhost:8080/x", ["http://localhost:8080"])).toBe(
      "http://localhost:8080",
    );
    expect(allowedOrigin("http://localhost:8081", ["http://localhost:8080"])).toBeNull();
  });
});

describe("bearerMatches", () => {
  it("accepts only the exact secret as a bearer token", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerMatches("Bearer s3cre", "s3cret")).toBe(false);
    expect(bearerMatches("Bearer s3cretX", "s3cret")).toBe(false);
    expect(bearerMatches("bearer s3cret", "s3cret")).toBe(false);
    expect(bearerMatches("s3cret", "s3cret")).toBe(false);
    expect(bearerMatches(null, "s3cret")).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    expect(bearerMatches("Bearer ", "")).toBe(false);
    expect(bearerMatches("Bearer anything", undefined)).toBe(false);
  });
});
