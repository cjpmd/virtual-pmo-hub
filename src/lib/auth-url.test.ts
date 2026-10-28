import { describe, expect, it } from "vitest";
import { authUrlParams, readAuthUrlError } from "./auth-url";

const read = (search: string, hash = "") => readAuthUrlError(authUrlParams(search, hash));

describe("readAuthUrlError", () => {
  it("returns null when the URL carries no error", () => {
    expect(read("?next=%2Fportfolio", "#access_token=abc&type=signup")).toBeNull();
  });

  it("explains admin consent instead of showing the raw Entra error", () => {
    const error = read(
      "?error=access_denied&error_description=AADSTS65001%3A+The+user+or+administrator+has+not+consented",
    );
    expect(error?.kind).toBe("consent");
    expect(error?.message).toMatch(/IT administrator/);
    expect(error?.message).not.toMatch(/AADSTS/);
    expect(error?.detail).toMatch(/AADSTS65001/);
  });

  it("recognises admin-consent-required errors delivered in the hash", () => {
    expect(
      read("", "#error=server_error&error_description=AADSTS90094+Need+admin+approval")?.kind,
    ).toBe("consent");
  });

  it("treats a declined consent prompt as cancelled", () => {
    expect(read("?error=access_denied&error_description=AADSTS65004+User+declined")?.kind).toBe(
      "cancelled",
    );
  });

  it("explains a Microsoft account without an email address", () => {
    expect(
      read("?error=server_error&error_description=Error+getting+user+email+from+external+provider")
        ?.kind,
    ).toBe("no_email");
  });

  it("recognises expired email links", () => {
    expect(
      read(
        "",
        "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      )?.kind,
    ).toBe("expired");
  });
});
