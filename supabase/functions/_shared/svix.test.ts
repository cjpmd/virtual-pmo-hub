import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TOLERANCE_SECONDS, signSvix, verifySvix } from "./svix";

const rawKey = randomBytes(24);
const secret = `whsec_${rawKey.toString("base64")}`;
const id = "msg_2LhYwGcOD9ZqQYlHz0kXzr1RfqM";
const now = 1_793_300_000;
const timestamp = String(now);
const payload = JSON.stringify({ type: "email.bounced", data: { email_id: "01a1891e-7fcf-70ac" } });

/** Signature computed independently with Node's HMAC, as Svix documents it. */
const nodeSignature = (body = payload, ts = timestamp, msgId = id) =>
  createHmac("sha256", rawKey).update(`${msgId}.${ts}.${body}`).digest("base64");

describe("signSvix", () => {
  it("matches Node's HMAC-SHA256 over id.timestamp.body with the whsec_ key", async () => {
    await expect(signSvix(secret, id, timestamp, payload)).resolves.toBe(nodeSignature());
  });
});

describe("verifySvix", () => {
  const headers = (signature: string, ts = timestamp) => ({ id, timestamp: ts, signature });

  it("accepts a correctly signed, recent request", async () => {
    await expect(verifySvix(secret, headers(`v1,${nodeSignature()}`), payload, now)).resolves.toBe(true);
  });

  it("accepts any matching signature in a space-separated list (key rotation)", async () => {
    const other = createHmac("sha256", randomBytes(24)).update("x").digest("base64");
    await expect(verifySvix(secret, headers(`v1,${other} v1,${nodeSignature()}`), payload, now)).resolves.toBe(true);
  });

  it("refuses a changed body", async () => {
    await expect(verifySvix(secret, headers(`v1,${nodeSignature()}`), payload.replace("bounced", "delivered"), now)).resolves.toBe(false);
  });

  it("refuses a signature made with another secret", async () => {
    const forged = createHmac("sha256", randomBytes(24)).update(`${id}.${timestamp}.${payload}`).digest("base64");
    await expect(verifySvix(secret, headers(`v1,${forged}`), payload, now)).resolves.toBe(false);
  });

  it("refuses timestamps outside the 5-minute window, both ways", async () => {
    const old = String(now - TOLERANCE_SECONDS - 1);
    const future = String(now + TOLERANCE_SECONDS + 1);
    await expect(verifySvix(secret, headers(`v1,${nodeSignature(payload, old)}`, old), payload, now)).resolves.toBe(false);
    await expect(verifySvix(secret, headers(`v1,${nodeSignature(payload, future)}`, future), payload, now)).resolves.toBe(false);
  });

  it("refuses missing headers, a non-v1 version, and a malformed secret", async () => {
    await expect(verifySvix(secret, { id: null, timestamp, signature: `v1,${nodeSignature()}` }, payload, now)).resolves.toBe(false);
    await expect(verifySvix(secret, headers(`v2,${nodeSignature()}`), payload, now)).resolves.toBe(false);
    await expect(verifySvix("whsec_%%%not-base64", headers(`v1,${nodeSignature()}`), payload, now)).resolves.toBe(false);
    await expect(verifySvix("", headers(`v1,${nodeSignature()}`), payload, now)).resolves.toBe(false);
  });
});
