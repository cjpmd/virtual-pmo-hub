import { describe, expect, it } from "vitest";
import { checkPassword, MIN_PASSWORD_LENGTH } from "./password";

describe("checkPassword", () => {
  it("refuses anything shorter than the minimum", () => {
    const result = checkPassword("a".repeat(MIN_PASSWORD_LENGTH - 1));
    expect(result).toMatchObject({ strength: 0, acceptable: false });
  });

  it("accepts ten characters but rates them weak and suggests improvements", () => {
    const result = checkPassword("abcdefghij");
    expect(result.acceptable).toBe(true);
    expect(result.strength).toBe(1);
    expect(result.hints.length).toBeGreaterThan(0);
  });

  it("rates a long, varied passphrase strong with no hints", () => {
    const result = checkPassword("Correct-Horse-Battery-9");
    expect(result).toEqual({ strength: 4, hints: [], acceptable: true });
  });

  it("marks passwords built from the email name or common words weak", () => {
    expect(checkPassword("Jsmith-2026-Long!", "jsmith@example.com").strength).toBe(1);
    expect(checkPassword("Password12345!!").strength).toBe(1);
    expect(checkPassword("aaaaaaaaaaaaaaaaaaaa").strength).toBe(1);
  });
});
