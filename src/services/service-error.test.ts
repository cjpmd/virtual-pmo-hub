import { describe, expect, it } from "vitest";
import type { PostgrestError } from "@supabase/supabase-js";
import { fromPostgrest, fromStorageUpload, isReadOnlyError } from "./service-error";

const READ_ONLY_MESSAGE =
  "This organisation is read-only because its trial or subscription has ended. An admin can subscribe in Settings › Subscription to restore editing.";

const pgError = (fields: Partial<PostgrestError>): PostgrestError =>
  ({ code: "", message: "", details: "", hint: "", ...fields }) as PostgrestError;

describe("read-only refusals (GL-4)", () => {
  it("maps the org_read_only hint to a read_only error with the friendly message", () => {
    const error = fromPostgrest(
      pgError({ code: "P0001", message: READ_ONLY_MESSAGE, hint: "org_read_only" }),
      "Saving the project",
    );
    expect(error.kind).toBe("read_only");
    expect(error.message).toBe(`Saving the project: ${READ_ONLY_MESSAGE}`);
    expect(error.code).toBe("P0001");
  });

  it("works without a context", () => {
    const error = fromPostgrest(pgError({ code: "P0001", message: "x", hint: "org_read_only" }));
    expect(error.kind).toBe("read_only");
    expect(error.message).toBe(READ_ONLY_MESSAGE);
  });

  it("leaves other trigger messages as invalid", () => {
    const error = fromPostgrest(
      pgError({ code: "P0001", message: "Attach the acceptance evidence first", hint: "other" }),
    );
    expect(error.kind).toBe("invalid");
    expect(error.message).toBe("Attach the acceptance evidence first");
  });

  it("recognises a storage upload refused by the read-only check (message only)", () => {
    expect(isReadOnlyError({ message: READ_ONLY_MESSAGE })).toBe(true);
    const error = fromStorageUpload(
      { message: READ_ONLY_MESSAGE },
      "Uploading the logo",
      "forbidden",
    );
    expect(error.kind).toBe("read_only");
    expect(error.message).toBe(`Uploading the logo: ${READ_ONLY_MESSAGE}`);
  });

  it("keeps other storage errors as the caller's kind", () => {
    expect(isReadOnlyError({ message: "new row violates row-level security policy" })).toBe(false);
    const error = fromStorageUpload(
      { message: "new row violates row-level security policy" },
      "Uploading the logo",
      "forbidden",
    );
    expect(error.kind).toBe("forbidden");
    expect(error.message).toBe("Uploading the logo: new row violates row-level security policy");
  });

  it("is false for no error", () => {
    expect(isReadOnlyError(null)).toBe(false);
    expect(isReadOnlyError(undefined)).toBe(false);
  });
});
