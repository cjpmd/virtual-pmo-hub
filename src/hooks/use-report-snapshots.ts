// Published report snapshots (spec §4: published reports render only from snapshots). The
// '__meta' row carries the scheme, forum, meeting and deep-dives as published; '__changes'
// carries the comparison with the previous pack, turned into movement markers here.
import { useQuery } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import type { ProjectMovement } from "@/features/reports/blocks/types";
import { toMovement, type ChangesData } from "@/features/reports/engine/diff";
import type { DeepDiveProject, SnapshotLookup } from "@/features/reports/viewer/ReportDocument";
import { qk } from "@/services/query-keys";
import { listSnapshots, type ReportContextData, type SnapshotRow } from "@/services/reports";

export interface ReportSnapshot {
  meta: {
    scheme: ReportContextData["scheme"];
    deep_dives: DeepDiveProject[];
    forum: { name: string } | null;
    meeting: { meeting_date: string } | null;
  };
  lookup: SnapshotLookup;
  movement: Record<string, ProjectMovement>;
  changes: ChangesData | null;
  /** The data-basis note stored when the pack was published. */
  dataBasis: string | null;
}

export function snapshotFrom(rows: SnapshotRow[]): ReportSnapshot {
  const map = new Map(
    rows.map((row) => [`${row.blockInstanceId}:${row.entityId ?? ""}`, row.data]),
  );
  const meta = (map.get("__meta:") ?? {}) as Partial<ReportSnapshot["meta"]>;
  const changes = (map.get("__changes:") ?? null) as ChangesData | null;
  return {
    meta: {
      scheme: meta.scheme ?? null,
      deep_dives: meta.deep_dives ?? [],
      forum: meta.forum ?? null,
      meeting: meta.meeting ?? null,
    },
    lookup: (blockId, entityId) => map.get(`${blockId}:${entityId ?? ""}`),
    movement: toMovement(changes),
    changes,
    dataBasis: ((map.get("__basis:") ?? null) as { text?: string } | null)?.text ?? null,
  };
}

export function useReportSnapshot(reportId: string | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.reports.snapshots(orgId, reportId ?? ""),
    queryFn: async () => snapshotFrom(await listSnapshots(reportId!)),
    enabled: !!reportId,
    staleTime: Infinity,
  });
}
