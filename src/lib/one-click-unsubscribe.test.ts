import { describe, expect, it, vi } from "vitest";
import { handleOneClickUnsubscribe } from "./one-click-unsubscribe";

const TOKEN = "a".repeat(64);
const post = (query: string) =>
  new Request(`https://pmo.example.org/notifications/unsubscribe${query}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });

describe("handleOneClickUnsubscribe", () => {
  it("unsubscribes with the token from the link", async () => {
    const unsubscribe = vi.fn(async () => true);
    const response = await handleOneClickUnsubscribe(post(`?token=${TOKEN}`), unsubscribe);
    expect(response.status).toBe(200);
    expect(unsubscribe).toHaveBeenCalledWith(TOKEN);
  });
  it("refuses a missing or malformed token without calling the database", async () => {
    const unsubscribe = vi.fn(async () => true);
    expect((await handleOneClickUnsubscribe(post(""), unsubscribe)).status).toBe(400);
    expect((await handleOneClickUnsubscribe(post("?token=short"), unsubscribe)).status).toBe(400);
    expect(unsubscribe).not.toHaveBeenCalled();
  });
  it("reports an unknown token and a database failure", async () => {
    expect(
      (await handleOneClickUnsubscribe(post(`?token=${TOKEN}`), async () => false)).status,
    ).toBe(400);
    expect(
      (
        await handleOneClickUnsubscribe(post(`?token=${TOKEN}`), async () => {
          throw new Error("down");
        })
      ).status,
    ).toBe(502);
  });
});
