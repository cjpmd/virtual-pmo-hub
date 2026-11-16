// GL-7 follow-up: records of who accepted which Terms (and DPA) version for which organisation
// (docs/sql/gl-7-terms-acceptances.sql). public.accept_terms is the only writer; people read
// their own records (organisation admins read the organisation's).
import { supabase } from "@/integrations/supabase/client";
import { TERMS_VERSION } from "@/lib/legal";
import { unwrap, unwrapMaybe } from "./service-error";

export type TermsMethod = "organisation_setup" | "signup_form" | "sign_in_prompt";

/** Records the current Terms version for the signed-in person in this organisation. Idempotent. */
export async function acceptTerms(orgId: string, method: TermsMethod): Promise<string> {
  return unwrap(
    await supabase.rpc("accept_terms", {
      p_organisation_id: orgId,
      p_terms_version: TERMS_VERSION,
      p_method: method,
    }),
    "Recording that you accepted the terms",
  );
}

/** Has this person accepted the current Terms version for this organisation? */
export async function hasAcceptedCurrentTerms(orgId: string, profileId: string): Promise<boolean> {
  const row = unwrapMaybe(
    await supabase
      .from("terms_acceptances")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("profile_id", profileId)
      .eq("terms_version", TERMS_VERSION)
      .maybeSingle(),
    "Checking the terms",
  );
  return row !== null;
}

/**
 * What the sign-in check does for someone with no record of the current version: record it
 * silently when the email sign-up form already captured this version (auth user metadata), else
 * ask. Microsoft sign-ups, invitees from before GL-7 and everyone after a version change are asked.
 */
export function termsAction(
  accepted: boolean,
  userMetadata: Record<string, unknown> | undefined,
): "none" | "record_signup_form" | "prompt" {
  if (accepted) return "none";
  return userMetadata?.["terms_version"] === TERMS_VERSION ? "record_signup_form" : "prompt";
}
