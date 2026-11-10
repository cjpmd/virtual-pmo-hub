// "Sample" chip for records created by "Start with sample data" (GL-9).
import { FlaskConical } from "lucide-react";
import { useSampleIds } from "@/hooks/use-sample-data";
import { isSample, type SampleKind } from "@/services/sample-data";

export function SampleChip({ className = "" }: { className?: string | undefined }) {
  return (
    <span
      title="Sample data: an admin can remove it in Settings › Data."
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground ${className}`}
    >
      <FlaskConical className="size-3" aria-hidden />
      Sample
    </span>
  );
}

/** The chip when this record is sample data; nothing otherwise. */
export function SampleBadge({
  kind,
  id,
  className,
}: {
  kind: SampleKind | "projectCode";
  id: string | null | undefined;
  className?: string;
}) {
  const ids = useSampleIds().data;
  if (!isSample(ids, kind, id)) return null;
  return <SampleChip className={className} />;
}

/** For BoardWorkspace's titleAdornment: the chip on rows whose id is a sample record. */
export function useSampleAdornment(kind: SampleKind | "projectCode") {
  const ids = useSampleIds().data;
  return (row: { id: string }) =>
    isSample(ids, kind, row.id) ? <SampleChip className="ml-1" /> : null;
}
