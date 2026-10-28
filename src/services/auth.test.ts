import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, auth } = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signInWithOAuth: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, auth } }));
import {
  isUnconfirmedEmail,
  joinDemoAsViewer,
  sendPasswordReset,
  signInWithPassword,
  signInWithProvider,
  signUpWithPassword,
} from "./auth";

const authError = (code: string, status = 400) =>
  Object.assign(new Error(code), { name: "AuthApiError", code, status, __isAuthError: true });

beforeEach(() => vi.clearAllMocks());

describe("read-only demo entry", () => {
  it("joins only through the approved viewer RPC without accepting another user's identity or role", async () => {
    rpc.mockResolvedValue({ data: "demo-org", error: null });
    await expect(joinDemoAsViewer()).resolves.toBe("demo-org");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("join_demo_as_viewer");
  });

  it("does not report success when the RPC refuses access", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Sign in first" } });
    await expect(joinDemoAsViewer()).rejects.toThrow("Sign in first");
  });

  it("does not continue when no demo organisation was returned", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(joinDemoAsViewer()).rejects.toThrow();
  });

  it("returns newly confirmed accounts to demo entry, not organisation setup", async () => {
    vi.stubGlobal("window", { location: { origin: "https://pmo.originoverthrow.com" } });
    auth.signUp.mockResolvedValue({ data: {}, error: null });
    try {
      await signUpWithPassword({
        name: " Visitor ",
        email: "visitor@example.com",
        password: "long-enough-password",
        next: "/auth/demo",
      });
      expect(auth.signUp).toHaveBeenCalledWith({
        email: "visitor@example.com",
        password: "long-enough-password",
        options: {
          emailRedirectTo: "https://pmo.originoverthrow.com/auth/callback?next=%2Fauth%2Fdemo",
          data: { full_name: "Visitor" },
          captchaToken: undefined,
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("email and password", () => {
  it("gives wrong email and wrong password the same message", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: authError("invalid_credentials") });
    await expect(
      signInWithPassword({ email: "nobody@example.com", password: "x".repeat(10) }),
    ).rejects.toThrow("Email or password is incorrect.");
  });

  it("flags an unconfirmed email so the page can offer to resend", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: authError("email_not_confirmed") });
    const error = await signInWithPassword({
      email: "new@example.com",
      password: "x".repeat(10),
    }).catch((e: unknown) => e);
    expect(isUnconfirmedEmail(error)).toBe(true);
  });

  it("does not reveal that an address is already registered", async () => {
    vi.stubGlobal("window", { location: { origin: "https://pmo.originoverthrow.com" } });
    auth.signUp.mockResolvedValue({ data: {}, error: authError("user_already_exists", 422) });
    try {
      await expect(
        signUpWithPassword({ name: "A", email: "taken@example.com", password: "x".repeat(10) }),
      ).resolves.toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sends reset links to the reset page", async () => {
    vi.stubGlobal("window", { location: { origin: "https://pmo.originoverthrow.com" } });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    try {
      await sendPasswordReset({ email: "user@example.com" });
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
        redirectTo: "https://pmo.originoverthrow.com/auth/reset-password",
        captchaToken: undefined,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Microsoft sign-in", () => {
  it("uses the azure provider with the OpenID scopes and returns to /auth/callback", async () => {
    vi.stubGlobal("window", { location: { origin: "https://pmo.originoverthrow.com" } });
    auth.signInWithOAuth.mockResolvedValue({ error: null });
    try {
      await signInWithProvider("azure");
      expect(auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "azure",
        options: {
          scopes: "email openid profile",
          redirectTo: "https://pmo.originoverthrow.com/auth/callback",
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
