/** Only same-site paths are allowed as a return address after sign-in. */
export const safeNext = (value: unknown): string | undefined =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : undefined;
