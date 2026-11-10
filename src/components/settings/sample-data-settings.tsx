// Settings › Data › Sample data (GL-9): admins add the sample portfolio when none is active, and
// remove it (archive, never delete) when it is. The database checks the admin role again.
import { FlaskConical, Archive } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { SettingsCard } from "@/components/settings/settings-shell";
import { useOrgWritable } from "@/hooks/use-org-access";
import { useSampleDataMutations, useSampleIds } from "@/hooks/use-sample-data";
import { errorMessage } from "@/services/service-error";

export function SampleDataSettings() {
  const ids = useSampleIds();
  const { add, remove } = useSampleDataMutations();
  const writable = useOrgWritable();
  const active = ids.data?.active ?? false;
  const busy = add.isPending || remove.isPending || ids.isPending;
  return (
    <SettingsCard
      title="Sample data"
      description="A small sample portfolio to explore the product, marked with a Sample chip. Removing it archives the sample records; nothing is deleted, and it never counts towards your seats."
    >
      <div className="flex flex-wrap items-center gap-3">
        <ReadOnlyTip readOnly={!writable}>
          {active ? (
            <Button
              variant="outline"
              disabled={busy || !writable}
              onClick={() => {
                if (
                  !window.confirm(
                    "Remove the sample data? The sample portfolio, programme and projects are archived and their open risks, issues, decision and benefit are closed.",
                  )
                )
                  return;
                remove.mutate(undefined, {
                  onSuccess: () => toast.success("Sample data removed."),
                  onError: (error) => toast.error(errorMessage(error)),
                });
              }}
            >
              <Archive />
              Remove sample data
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={busy || !writable}
              onClick={() =>
                add.mutate(undefined, {
                  onSuccess: () =>
                    toast.success("Sample data added: see the Sample portfolio in Portfolio."),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              <FlaskConical />
              Add sample data
            </Button>
          )}
        </ReadOnlyTip>
        <p className="text-xs text-muted-foreground">
          {active ? "Sample data is in this organisation." : "No sample data in this organisation."}
        </p>
      </div>
    </SettingsCard>
  );
}
