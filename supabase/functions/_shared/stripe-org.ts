// GL-10 follow-up: which organisation a Stripe subscription belongs to, for stripe-webhook.
// The stored mapping (organisation_subscriptions.stripe_customer_id, written by
// create-checkout-session for the signed-in admin's organisation) wins over Stripe metadata,
// which anyone with dashboard access can edit. Metadata is used only when no mapping exists yet.
// When the mapping and the metadata disagree, or the customer is mapped to more than one
// organisation, nothing is written: the webhook logs it for a person to sort out.
// Plain TypeScript (no Deno globals) so it is unit-tested.

export type OrganisationResolution =
  | { organisationId: string; source: "mapping" | "metadata" }
  | { organisationId: null; reason: "no_organisation" }
  | { organisationId: null; reason: "metadata_conflict"; mapped: string; metadata: string }
  | { organisationId: null; reason: "ambiguous_mapping"; mapped: string[] };

/**
 * @param mappedOrganisationIds organisations whose stored stripe_customer_id is this customer
 * @param metadataOrganisationId organisation_id from the subscription's (else customer's) metadata
 */
export function resolveSubscriptionOrganisation(
  mappedOrganisationIds: readonly string[],
  metadataOrganisationId: string | null | undefined,
): OrganisationResolution {
  const mapped = [...new Set(mappedOrganisationIds.filter(Boolean))];
  const metadata = metadataOrganisationId?.trim() || null;
  if (mapped.length > 1) return { organisationId: null, reason: "ambiguous_mapping", mapped };
  const [stored] = mapped;
  if (stored) {
    if (metadata && metadata !== stored)
      return { organisationId: null, reason: "metadata_conflict", mapped: stored, metadata };
    return { organisationId: stored, source: "mapping" };
  }
  if (metadata) return { organisationId: metadata, source: "metadata" };
  return { organisationId: null, reason: "no_organisation" };
}
