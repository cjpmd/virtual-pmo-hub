// Published report snapshots (Phase 3 fills this in; until then nothing is published).
import type { ProjectMovement } from "@/features/reports/blocks/types";
import type { DeepDiveProject, SnapshotLookup } from "@/features/reports/viewer/ReportDocument";
import type { ReportContextData } from "@/services/reports";

export interface ReportSnapshot {
  meta: {
    scheme: ReportContextData["scheme"];
    deep_dives: DeepDiveProject[];
    forum: { name: string } | null;
    meeting: { meeting_date: string } | null;
  };
  lookup: SnapshotLookup;
  movement: Record<string, ProjectMovement>;
}

export function useReportSnapshot(_reportId: string | null): {
  data: ReportSnapshot | null;
  error: unknown;
} {
  return { data: null, error: null };
}
