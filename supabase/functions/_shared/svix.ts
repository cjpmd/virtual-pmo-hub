// Work package 2.1. Verifies Resend webhook signatures (Resend signs with Svix).
// Signed content: "<svix-id>.<svix-timestamp>.<raw body>", HMAC-SHA256 with the base64 key after
// the "whsec_" prefix of the secret. The svix-signature header lists one or more "v1,<base64>"
// signatures separated by spaces (several while a secret is being rotated); any match passes.
// Timestamps more than 5 minutes from now are refused, so a captured request can't be replayed.
// Plain TypeScript on Web Crypto: runs in Deno (edge functions) and Node (Vitest).

export const TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** Constant-time comparison of two strings of the same length. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The expected "v1" signature (base64) for this message. */
export async function signSvix(secret: string, id: string, timestamp: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`));
  return toBase64(new Uint8Array(mac));
}

/** True only for a correctly signed, recent request. `payload` must be the raw request body. */
export async function verifySvix(
  secret: string,
  headers: SvixHeaders,
  payload: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) return false;
  let expected: string;
  try {
    expected = await signSvix(secret, id, timestamp, payload);
  } catch {
    return false; // malformed secret
  }
  return signature
    .split(" ")
    .map((part) => part.split(","))
    .some(([version, value]) => version === "v1" && typeof value === "string" && safeEqual(value, expected));
}
