// One error type for every Supabase-backed service, so screens handle failures the same way.
// Services throw ServiceError; TanStack Query surfaces it as `error`; components show
// `error.message` (already written for people) and may branch on `error.kind`.
import type { AuthError, PostgrestError } from "@supabase/supabase-js";

export type ServiceErrorKind =
  | "unauthenticated" // no session, or the session expired
  | "forbidden" // RLS or a permission check refused the write
  | "not_found" // the record does not exist or is not visible to this user
  | "conflict" // unique constraint, e.g. a project code already in use
  | "invalid" // check constraint, foreign key or a rule enforced by a trigger
  | "network" // the request did not reach the server
  | "timeout" // the database gave up (statement timeout) or the gateway did
  | "unknown";

export class ServiceError extends Error {
  readonly kind: ServiceErrorKind;
  readonly code: string | undefined;
  readonly detail: string | undefined;

  constructor(
    kind: ServiceErrorKind,
    message: string,
    options?: { code?: string | undefined; detail?: string | undefined; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ServiceError";
    this.kind = kind;
    this.code = options?.code;
    this.detail = options?.detail;
  }
}

const messages: Record<ServiceErrorKind, string> = {
  unauthenticated: "Your session has ended. Sign in again to continue.",
  forbidden: "You don't have permission to make this change.",
  not_found: "We couldn't find that record. It may have been archived, or you may not have access.",
  conflict: "That value is already in use.",
  invalid: "That change isn't valid.",
  network: "We couldn't reach the server. Check your connection and try again.",
  timeout: "This is taking too long — please try again.",
  unknown: "Something went wrong. Please try again.",
};

/**
 * Triggers that enforce a rule raise their own sentence with a standard code (42501 for a
 * role check, 23514 for a missing precondition), e.g. "Attach the acceptance evidence first".
 * Those read better than the generic text; Postgres's own wording for RLS, privileges and
 * constraints does not, so it keeps the generic message.
 */
const POSTGRES_WORDING =
  /^(new row|permission denied|insert or update|update or delete|null value|duplicate key|invalid input|value too long|column |relation |violates)/i;
const isRuleMessage = (kind: ServiceErrorKind, text: string | undefined) =>
  (kind === "forbidden" || kind === "invalid") && !!text && !POSTGRES_WORDING.test(text);

/** Maps a PostgREST error (from supabase-js) to a ServiceError with a readable message. */
export function fromPostgrest(
  error: PostgrestError,
  context?: string,
  status?: number,
): ServiceError {
  const code = error.code;
  let kind: ServiceErrorKind = "unknown";
  let message = messages.unknown;
  if (code === "57014" || /statement timeout|canceling statement/i.test(error.message ?? ""))
    kind = "timeout";
  else if (code === "42501" || code === "PGRST301") kind = "forbidden";
  else if (code === "PGRST116") kind = "not_found";
  else if (code === "23505") kind = "conflict";
  else if (
    code === "23503" ||
    code === "23514" ||
    code === "23502" ||
    code === "22P02" ||
    code === "22023" // raise ... using errcode '22023' in RPCs: a rule message for people
  )
    kind = "invalid";
  else if (code === "P0001")
    kind = "invalid"; // raise exception in a trigger: its text is meant for people
  else if (!code && /fetch|network/i.test(error.message)) kind = "network";
  // PostgREST answers a statement timeout with HTTP 500; a gateway timeout is 504.
  else if (status === 500 || status === 504) kind = "timeout";
  message =
    (kind === "invalid" && code === "P0001") || isRuleMessage(kind, error.message)
      ? error.message
      : messages[kind];
  if (kind === "conflict" && error.details) message = `${messages.conflict} ${error.details}`;
  return new ServiceError(kind, context ? `${context}: ${message}` : message, {
    code,
    detail: [error.message, error.details, error.hint].filter(Boolean).join(" — "),
    cause: error,
  });
}

export function fromAuth(error: AuthError): ServiceError {
  // AuthRetryableFetchError (status 0) means the request never reached the server.
  if (
    error.name === "AuthRetryableFetchError" ||
    !error.status ||
    /fetch|network/i.test(error.message)
  )
    return new ServiceError("network", messages.network, { code: error.code, cause: error });
  if (error.status === 429)
    return new ServiceError("invalid", "Too many attempts. Wait a minute and try again.", {
      code: error.code,
      cause: error,
    });
  if (error.status === 401 || error.status === 403)
    return new ServiceError("unauthenticated", messages.unauthenticated, {
      code: error.code,
      cause: error,
    });
  return new ServiceError("unknown", error.message || messages.unknown, {
    code: error.code,
    cause: error,
  });
}

/** Returns `data` or throws a ServiceError. Use for every supabase-js call in a service. */
export function unwrap<T>(
  result: { data: T; error: PostgrestError | null; status?: number },
  context?: string,
): NonNullable<T> {
  if (result.error) throw fromPostgrest(result.error, context, result.status);
  if (result.data === null || result.data === undefined)
    throw new ServiceError("not_found", messages.not_found);
  return result.data as NonNullable<T>;
}

/** Like unwrap, but a missing row is a valid answer (`maybeSingle()`). */
export function unwrapMaybe<T>(
  result: { data: T; error: PostgrestError | null; status?: number },
  context?: string,
): T | null {
  if (result.error) throw fromPostgrest(result.error, context, result.status);
  return result.data ?? null;
}

/**
 * A write that RLS silently filtered (update/delete matched no visible row) returns no error
 * and no rows. Writes select the row back, so an empty result means "not allowed or not there".
 */
export function unwrapWrite<T>(
  result: { data: T; error: PostgrestError | null; status?: number },
  context?: string,
): NonNullable<T> {
  if (result.error) throw fromPostgrest(result.error, context, result.status);
  if (
    result.data === null ||
    result.data === undefined ||
    (Array.isArray(result.data) && result.data.length === 0)
  )
    throw new ServiceError(
      "forbidden",
      context ? `${context}: ${messages.forbidden}` : messages.forbidden,
    );
  return result.data as NonNullable<T>;
}

export const isServiceError = (error: unknown): error is ServiceError =>
  error instanceof ServiceError;

/** Text to show for any thrown value. */
export const errorMessage = (error: unknown) =>
  isServiceError(error) ? error.message : error instanceof Error ? error.message : messages.unknown;
