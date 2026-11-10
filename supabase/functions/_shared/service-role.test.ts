import { describe, expect, it } from "vitest";
import { isServiceRoleRequest, jwtRole } from "./service-role";

const jwt = (payload: object) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");

describe("jwtRole", () => {
  it("reads the role claim", () => {
    expect(jwtRole(jwt({ role: "service_role", iss: "supabase" }))).toBe("service_role");
    expect(jwtRole(jwt({ role: "anon" }))).toBe("anon");
  });

  it("is null for anything that isn't a JWT", () => {
    expect(jwtRole("sb_secret_abc")).toBeNull();
    expect(jwtRole("a.%%%.c")).toBeNull();
    expect(jwtRole(jwt({ sub: "user" }))).toBeNull();
  });
});

describe("isServiceRoleRequest", () => {
  it("accepts a service-role JWT (the key in Vault)", () => {
    expect(isServiceRoleRequest(`Bearer ${jwt({ role: "service_role" })}`, "sb_secret_other")).toBe(true);
  });

  it("accepts the runtime key itself", () => {
    expect(isServiceRoleRequest("Bearer sb_secret_runtime", "sb_secret_runtime")).toBe(true);
  });

  it("refuses users, anon and missing headers", () => {
    expect(isServiceRoleRequest(`Bearer ${jwt({ role: "authenticated" })}`, "k")).toBe(false);
    expect(isServiceRoleRequest(`Bearer ${jwt({ role: "anon" })}`, "k")).toBe(false);
    expect(isServiceRoleRequest(null, "k")).toBe(false);
    expect(isServiceRoleRequest("Bearer ", undefined)).toBe(false);
  });
});
