import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken, inviteLink, toByteaHex } from "./invite-token";

describe("generateInviteToken", () => {
  it("is 43 URL-safe characters (32 random bytes, base64url, no padding)", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("fits the database's accepted token length (32 to 128)", () => {
    const { length } = generateInviteToken();
    expect(length).toBeGreaterThanOrEqual(32);
    expect(length).toBeLessThanOrEqual(128);
  });

  it("is different every time", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateInviteToken));
    expect(tokens.size).toBe(200);
  });
});

describe("hashInviteToken", () => {
  it("is SHA-256 of the UTF-8 bytes, as Postgres sha256(convert_to(token, 'UTF8')) computes it", async () => {
    const token = generateInviteToken();
    const expected = createHash("sha256").update(token, "utf8").digest("hex");
    await expect(hashInviteToken(token)).resolves.toBe(expected);
  });

  it("matches a known SHA-256 vector", async () => {
    await expect(hashInviteToken("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("gives 64 lowercase hex characters, i.e. a 32-byte bytea", async () => {
    await expect(hashInviteToken(generateInviteToken())).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different tokens", async () => {
    const [a, b] = await Promise.all([hashInviteToken("token-a"), hashInviteToken("token-b")]);
    expect(a).not.toBe(b);
  });
});

describe("toByteaHex", () => {
  it("prefixes the hash with \\x for Postgres bytea hex input", () => {
    expect(toByteaHex("ab12")).toBe("\\xab12");
  });
});

describe("inviteLink", () => {
  it("points at /invite with the token in the query string", () => {
    expect(inviteLink("https://pmo.originoverthrow.com", "abc_DEF-123")).toBe(
      "https://pmo.originoverthrow.com/invite?token=abc_DEF-123",
    );
  });

  it("copes with a trailing slash on APP_URL", () => {
    expect(inviteLink("https://pmo.originoverthrow.com/", "t")).toBe(
      "https://pmo.originoverthrow.com/invite?token=t",
    );
  });

  it("round-trips a generated token through the URL", () => {
    const token = generateInviteToken();
    const parsed = new URL(inviteLink("https://example.test", token));
    expect(parsed.searchParams.get("token")).toBe(token);
  });
});
