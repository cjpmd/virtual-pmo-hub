import { describe, expect, it } from "vitest";
import { effectiveDigest, orgDefaultDigest, SUPPORTED_EVENTS } from "./notification-settings";
import { notificationEvents } from "@/data/settings-data";

const org = (digest: "Real time" | "Daily" | "Weekly", email = true) => ({
  digest,
  channels: { inApp: true, email, teams: false },
});

describe("notification digest", () => {
  it("maps the organisation default", () => {
    expect(orgDefaultDigest(org("Real time"))).toBe("immediate");
    expect(orgDefaultDigest(org("Daily"))).toBe("daily");
    expect(orgDefaultDigest(org("Weekly"))).toBe("weekly");
  });
  it("lets the person choose, unless the organisation switched email off", () => {
    expect(effectiveDigest(org("Daily"), null)).toBe("daily");
    expect(effectiveDigest(org("Daily"), "immediate")).toBe("immediate");
    expect(effectiveDigest(org("Daily"), "off")).toBe("off");
    expect(effectiveDigest(org("Real time", false), "immediate")).toBe("off");
  });
  it("supports only events that exist in Settings", () => {
    for (const event of SUPPORTED_EVENTS) expect(notificationEvents).toContain(event);
  });
});
