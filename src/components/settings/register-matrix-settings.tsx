// Settings › Risk: the risk register's matrix and the re-scoring tool (NHS-1 part 4). Admins
// choose the register matrix (set_register_risk_matrix); existing risks keep the matrix they were
// scored on until a PMO member or admin accepts a re-score here (rescore_risks). Nothing changes
// risks automatically.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { SettingsCard, useCanEditSettings } from "@/components/settings/settings-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrgWritable } from "@/hooks/use-org-access";
import { qk } from "@/services/query-keys";
import {
  listRegisterMatrices,
  listRescoreCandidates,
  registerChoices,
  registerMatrixOf,
  rescoreRisks,
  setRegisterRiskMatrix,
  type RescoreCandidate,
} from "@/services/register-matrix";
import { errorMessage } from "@/services/service-error";

/** The register matrix for the current organisation (null while loading). */
export function useRegisterMatrix() {
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const query = useQuery({
    queryKey: [...qk.registerMatrix(orgId), "matrices"],
    queryFn: () => listRegisterMatrices(orgId),
  });
  const rows = query.data ?? [];
  return { ...registerMatrixOf(rows, orgId), choices: registerChoices(rows, orgId), query };
}

export function RegisterMatrixCard() {
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const queryClient = useQueryClient();
  const writable = useOrgWritable();
  const canEdit = useCanEditSettings("admin");
  const { matrix, own, choices, query } = useRegisterMatrix();
  const [pending, setPending] = useState<string | null>(null);
  const target = choices.find((choice) => choice.key === pending) ?? null;
  const change = useMutation({
    mutationFn: (key: string) => setRegisterRiskMatrix(orgId, key),
    onSuccess: async (result) => {
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: qk.settings(orgId) });
      toast.success(
        result.changed
          ? `Risk register matrix changed. ${result.stamped} existing ${result.stamped === 1 ? "risk keeps" : "risks keep"} its previous scoring until re-scored.`
          : "That matrix is already the register's matrix.",
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <SettingsCard
      title="Risk register matrix"
      description="The likelihood × consequence matrix new project, programme and portfolio risks are scored on. Reports and the register use the same one."
    >
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm">
            Current matrix: <span className="font-semibold">{matrix?.name ?? "Standard 5×5"}</span>
            {own ? "" : " (the standard default)"}
          </p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Choose the register matrix"
          >
            {choices.map((choice) => {
              const current = choice.key === matrix?.key;
              return (
                <ReadOnlyTip key={choice.key} readOnly={!writable}>
                  <Button
                    size="sm"
                    variant={current ? "default" : "outline"}
                    aria-pressed={current}
                    disabled={!writable || !canEdit || current}
                    onClick={() => setPending(choice.key)}
                  >
                    {choice.name}
                  </Button>
                </ReadOnlyTip>
              );
            })}
          </div>
          {own && (
            <p className="text-xs text-muted-foreground">
              The axis labels and score bands below come from this matrix. Edit the matrix to change
              them; the risk appetite threshold stays yours to set.
            </p>
          )}
        </div>
      )}
      <Dialog open={target !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Score new risks on {target?.name}?</DialogTitle>
            <DialogDescription>
              New risks will be scored and banded on {target?.name}. Existing risks keep the matrix,
              score and history they have now; you can review and re-score them below. Heat maps and
              the risk health threshold follow the new matrix's bands.
            </DialogDescription>
          </DialogHeader>
          {target && (
            <ul className="space-y-1 text-sm">
              {target.bands.map((band) => (
                <li key={band.label} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block size-3 rounded-sm"
                    style={{ background: band.colour ?? "var(--muted)" }}
                  />
                  {band.label}: score {band.min}
                  {band.max ? `–${band.max}` : "+"}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              disabled={change.isPending || !target}
              onClick={() => target && change.mutate(target.key)}
            >
              Change matrix
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}

export function RescoreCard() {
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const queryClient = useQueryClient();
  const writable = useOrgWritable();
  const canEdit = useCanEditSettings("pmo");
  const query = useQuery({
    queryKey: [...qk.registerMatrix(orgId), "candidates"],
    queryFn: () => listRescoreCandidates(orgId),
  });
  const candidates = query.data ?? [];
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const accept = useMutation({
    mutationFn: (items: RescoreCandidate[]) => rescoreRisks(orgId, items),
    onSuccess: async (count) => {
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: qk.registerMatrix(orgId) });
      toast.success(`${count} ${count === 1 ? "risk" : "risks"} re-scored.`);
    },
    onError: async (error) => {
      toast.error(errorMessage(error));
      await queryClient.invalidateQueries({ queryKey: qk.registerMatrix(orgId) });
    },
  });
  if (!query.isLoading && candidates.length === 0) return null;
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const chosen = candidates.filter((c) => selected.has(c.riskId));
  const disabled = !writable || !canEdit || accept.isPending;
  return (
    <SettingsCard
      requires="pmo"
      title="Re-score risks"
      description="Open risks still scored on an earlier matrix. Review the proposed score on the register matrix and accept per risk or in bulk; each change is audited. Closed risks keep their score."
      actions={
        <ReadOnlyTip readOnly={!writable}>
          <Button
            size="sm"
            disabled={disabled || chosen.length === 0}
            onClick={() => accept.mutate(chosen)}
          >
            Accept selected ({chosen.length})
          </Button>
        </ReadOnlyTip>
      }
    >
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 py-2">
                  <Checkbox
                    aria-label="Select all risks"
                    checked={chosen.length === candidates.length && candidates.length > 0}
                    onCheckedChange={(value) =>
                      setSelected(value ? new Set(candidates.map((c) => c.riskId)) : new Set())
                    }
                  />
                </th>
                <th className="py-2">Risk</th>
                <th className="py-2">Now</th>
                <th className="py-2">Proposed</th>
                <th className="py-2 text-right">
                  <span className="sr-only">Accept</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.riskId} className="border-t">
                  <td className="py-2">
                    <Checkbox
                      aria-label={`Select ${c.ref}`}
                      checked={selected.has(c.riskId)}
                      onCheckedChange={() => toggle(c.riskId)}
                    />
                  </td>
                  <td className="py-2">
                    <span className="font-semibold">{c.ref}</span> {c.title}
                  </td>
                  <td className="py-2">
                    <ScoreCell
                      matrix={c.fromMatrixName}
                      probability={c.probability}
                      impact={c.impact}
                      score={c.score}
                      band={c.bandLabel}
                      colour={c.bandColour}
                    />
                  </td>
                  <td className="py-2">
                    <ScoreCell
                      matrix={c.toMatrixName}
                      probability={c.proposedProbability}
                      impact={c.proposedImpact}
                      score={c.proposedScore}
                      band={c.proposedBandLabel}
                      colour={c.proposedBandColour}
                    />
                    {c.bandChanges && (
                      <span className="ml-1 text-xs font-semibold text-health-warn-foreground">
                        band changes
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <ReadOnlyTip readOnly={!writable}>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => accept.mutate([c])}
                      >
                        Accept
                      </Button>
                    </ReadOnlyTip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingsCard>
  );
}

function ScoreCell({
  matrix,
  probability,
  impact,
  score,
  band,
  colour,
}: {
  matrix: string;
  probability: number;
  impact: number;
  score: number | null;
  band: string | null;
  colour: string | null;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        aria-hidden
        className="inline-block size-3 rounded-sm"
        style={{ background: colour ?? "var(--muted)" }}
      />
      <span className="font-semibold">{band ?? "—"}</span>
      <span className="text-muted-foreground">
        {probability} × {impact} = {score ?? "—"} ({matrix})
      </span>
    </span>
  );
}
