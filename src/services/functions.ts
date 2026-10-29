// Calls a Supabase edge function and turns its failures into ServiceErrors. The 2.1 and 2.3
// functions answer errors as { error, code, ...extra } with a matching HTTP status; the error
// keeps the whole body so a screen can use extra fields (e.g. hostedInvoiceUrl on a 402).
import { supabase } from "@/integrations/supabase/client";
import { ServiceError, type ServiceErrorKind } from "./service-error";

export const kindForStatus = (status: number | undefined): ServiceErrorKind =>
  status === 401
    ? "unauthenticated"
    : status === 403
      ? "forbidden"
      : status === 404
        ? "not_found"
        : status === 409
          ? "conflict"
          : status === 400 || status === 402
            ? "invalid"
            : "unknown";

/** A failed edge-function call, with the function's JSON body when it sent one. */
export class FunctionCallError extends ServiceError {
  readonly status: number | undefined;
  readonly body: Record<string, unknown> | null;

  constructor(
    kind: ServiceErrorKind,
    message: string,
    options: {
      status?: number | undefined;
      body?: Record<string, unknown> | null;
      code?: string | undefined;
      cause?: unknown;
    },
  ) {
    super(kind, message, { code: options.code, cause: options.cause });
    this.name = "FunctionCallError";
    this.status = options.status;
    this.body = options.body ?? null;
  }
}

export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    // FunctionsHttpError keeps the function's Response in `context`; other errors (relay or
    // fetch failures) carry none.
    const context = (error as { context?: unknown }).context;
    if (context && typeof (context as Response).json === "function") {
      const response = context as Response;
      const parsed = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const text = parsed?.["error"];
      const code = parsed?.["code"];
      const message = typeof text === "string" && text ? text : fallback;
      throw new FunctionCallError(kindForStatus(response.status), message, {
        status: response.status,
        body: parsed,
        code: typeof code === "string" ? code : undefined,
        cause: error,
      });
    }
    throw new FunctionCallError("network", `${fallback} Check your connection and try again.`, {
      cause: error,
    });
  }
  if (data === null || data === undefined) throw new ServiceError("unknown", fallback);
  return data;
}
