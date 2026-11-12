// Reports for a funding collection (GL-14 Phase B). The collection page lists the collection's
// published reports and starts new ones from the "Funding committee" template, which replaced
// the old Funding packs.
import type { ReportListItem, TemplateRecord } from "@/services/reports";

/** The system template Phase A seeded for collection-scoped packs. */
export const FUNDING_TEMPLATE_NAME = "Funding committee";

/** Published reports scoped to this collection, newest meeting (else as-at) first. */
export function collectionReports(
  reports: readonly ReportListItem[],
  collectionId: string,
): ReportListItem[] {
  const when = (r: ReportListItem) => r.meetingDate ?? r.asAt;
  return reports
    .filter(
      (r) =>
        r.scopeType === "collection" &&
        r.scopeEntityId === collectionId &&
        r.status === "published",
    )
    .sort((a, b) => when(b).localeCompare(when(a)));
}

/** Reports in the list filtered to one collection (any status); every report when null. */
export function filterByCollection(
  reports: readonly ReportListItem[],
  collectionId: string | null,
): ReportListItem[] {
  if (!collectionId) return [...reports];
  return reports.filter((r) => r.scopeType === "collection" && r.scopeEntityId === collectionId);
}

/** The template a new collection report starts from: the system "Funding committee" one if it
 *  exists and isn't archived, else any active collection-scoped template, else none. */
export function defaultCollectionTemplate(
  templates: readonly TemplateRecord[],
): TemplateRecord | null {
  const active = templates.filter((t) => !t.archivedAt && t.scopeType === "collection");
  return (
    active.find((t) => t.isSystem && t.name === FUNDING_TEMPLATE_NAME) ??
    active.find((t) => t.name === FUNDING_TEMPLATE_NAME) ??
    active[0] ??
    null
  );
}
