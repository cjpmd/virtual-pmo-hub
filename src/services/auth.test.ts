import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, signInWithOtp } = vi.hoisted(() => ({ rpc: vi.fn(), signInWithOtp: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, auth: { signInWithOtp } },
}));
import { joinDemoAsViewer, sendMagicLink } from "./auth";

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
    signInWithOtp.mockResolvedValue({ error: null });
    try {
      await sendMagicLink("visitor@example.com", "/auth/demo");
      expect(signInWithOtp).toHaveBeenCalledWith({
        email: "visitor@example.com",
        options: {
          shouldCreateUser: true,
          emailRedirectTo: "https://pmo.originoverthrow.com/auth/callback?next=%2Fauth%2Fdemo",
        },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});