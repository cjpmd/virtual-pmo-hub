// Work package 2.1. Invitation tokens: made and hashed here, never stored in plain text.
// The database keeps sha256(token) (organisation_invites.token_hash) and compares
// sha256(convert_to(p_token, 'UTF8')) on accept, so the hash must be of the UTF-8 bytes.
// Plain TypeScript on Web Crypto: runs in Deno (edge functions) and Node (Vitest).

const TOKEN_BYTES = 32;

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** 32 random bytes, base64url without padding: 43 URL-safe characters. */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** SHA-256 of the token's UTF-8 bytes, as 64 lowercase hex characters. */
export async function hashInviteToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toHex(new Uint8Array(digest));
}

/** The hash in Postgres bytea hex input form, for an RPC argument sent through PostgREST. */
export const toByteaHex = (hexHash: string) => `\\x${hexHash}`;

/** The link in the invitation email: APP_URL/invite?token=… */
export function inviteLink(appUrl: string, token: string): string {
  const url = new URL("/invite", appUrl.replace(/\/+$/, "") + "/");
  url.searchParams.set("token", token);
  return url.toString();
}
