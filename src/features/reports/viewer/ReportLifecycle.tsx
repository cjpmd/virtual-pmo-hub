// Report lifecycle actions (spec §10). Phase 3 adds submit / return / approve / publish /
// withdraw; until then this shows nothing.
import type { BlockInstance, RatingScheme } from "../blocks/types";
import type { ReportPermissions, ReportRecord, ReportStatus } from "@/services/reports";

export const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  withdrawn: "Withdrawn",
};

export function ReportLifecycleActions(_props: {
  report: ReportRecord;
  permissions: ReportPermissions | null;
  scheme: RatingScheme;
  draft: { overallRating: string | null; blocks: BlockInstance[] };
  dirty: boolean;
  onDone: (event: string) => void | Promise<void>;
}) {
  return null;
}
