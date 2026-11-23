// Settings › Modules › Business case approval routes (NHS-5, module five_case). For each stage
// (single-stage, SOC, OBC, FBC) the ordered steps a submitted version must pass: who or what
// approves (name), the governance role whose holder records the decision, and an optional
// whole-life cost threshold from which the step applies (delegated limits). Admins edit; the
// database validates again (set_business_case_approval_routes). Changes apply to versions
// submitted afterwards; gates already open keep their steps.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { SettingsCard, useCanEditSettings } from "@/components/settings/settings-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrgWritable } from "@/hooks/use-org-access";
import {
  CASE_STAGES,
  fromDraft,
  getApprovalRoutes,
  routeProblems,
  saveApprovalRoutes,
  stageLabel,
  toDraft,
  type CaseStage,
  type RouteDraft as Draft,
  type RouteDraftStep as DraftStep,
} from "@/services/five-case";
import { listGovernanceRoleHolders, listGovernanceRoles } from "@/services/modules";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";

export function FiveCaseRoutesCard() {
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const queryClient = useQueryClient();
  const writable = useOrgWritable();
  const canEdit = useCanEditSettings("admin") && writable;
  const routesKey = ["org", orgId, "settings", "five-case-routes"];
  const routes = useQuery({ queryKey: routesKey, queryFn: () => getApprovalRoutes(orgId) });
  const roles = useQuery({
    queryKey: qk.governanceRoles(orgId),
    queryFn: async () => ({
      roles: await listGovernanceRoles(orgId),
      holders: await listGovernanceRoleHolders(orgId),
    }),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => {
    if (routes.data && draft === null) setDraft(toDraft(routes.data));
  }, [routes.data, draft]);
  const roleOptions = (roles.data?.roles ?? []).filter((role) => role.isActive);
  const parsed = draft ? fromDraft(draft) : {};
  const problems = draft
    ? routeProblems(
        parsed,
        (roles.data?.roles ?? []).map((role) => role.value),
      )
    : [];
  const dirty =
    draft !== null &&
    routes.data !== undefined &&
    JSON.stringify(toDraft(routes.data)) !== JSON.stringify(draft);
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => saveApprovalRoutes(orgId, parsed),
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: routesKey });
      await queryClient.invalidateQueries({ queryKey: qk.settings(orgId) });
      toast.success("Approval routes saved. They apply to versions submitted from now on.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const update = (stage: CaseStage, steps: DraftStep[]) =>
    setDraft((current) => (current ? { ...current, [stage]: steps } : current));

  return (
    <SettingsCard
      title="Business case approval routes"
      description="The steps a submitted business case passes at each stage. Each step is decided by whoever holds its governance role (or their deputy). A threshold applies the step only when the version's whole-life cost reaches it. Changes apply to versions submitted from now on."
    >
      {routes.isLoading || roles.isLoading || !draft ? (
        <p className="text-sm text-muted-foreground">Loading the approval routes…</p>
      ) : routes.isError ? (
        <p className="text-sm text-health-bad-foreground">{errorMessage(routes.error)}</p>
      ) : (
        <div className="space-y-5">
          {CASE_STAGES.map((stage) => (
            <StageRoute
              key={stage}
              stage={stage}
              steps={draft[stage]}
              roleOptions={roleOptions}
              canEdit={canEdit}
              onChange={(steps) => update(stage, steps)}
            />
          ))}
          {problems.length > 0 && (
            <ul role="alert" className="list-disc pl-5 text-xs text-health-bad-foreground">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          {roleOptions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Add governance roles in Settings › Lists before building a route.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={!dirty || save.isPending}
              onClick={() => routes.data && setDraft(toDraft(routes.data))}
            >
              Discard changes
            </Button>
            <ReadOnlyTip readOnly={!writable}>
              <Button
                disabled={!canEdit || !dirty || problems.length > 0 || save.isPending}
                onClick={() => save.mutate()}
              >
                Save routes
              </Button>
            </ReadOnlyTip>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

function StageRoute({
  stage,
  steps,
  roleOptions,
  canEdit,
  onChange,
}: {
  stage: CaseStage;
  steps: DraftStep[];
  roleOptions: { value: string; label: string }[];
  canEdit: boolean;
  onChange: (steps: DraftStep[]) => void;
}) {
  const set = (index: number, patch: Partial<DraftStep>) =>
    onChange(steps.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...steps];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    onChange(next);
  };
  const headingId = `route-${stage}`;
  return (
    <section aria-labelledby={headingId} className="rounded-lg border p-3">
      <h3 id={headingId} className="text-sm font-medium">
        {stageLabel[stage]}
      </h3>
      {steps.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          No steps: a submitted version of this stage opens no approval and can't be approved.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {steps.map((step, index) => {
            const label = `${stageLabel[stage]} step ${index + 1}`;
            return (
              <li
                key={index}
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px_auto] sm:items-center"
              >
                <Input
                  aria-label={`${label}: who approves`}
                  placeholder="e.g. Trust Board"
                  value={step.name}
                  disabled={!canEdit}
                  maxLength={120}
                  onChange={(event) => set(index, { name: event.target.value })}
                />
                <Select
                  value={step.governanceRole}
                  disabled={!canEdit}
                  onValueChange={(value) => set(index, { governanceRole: value })}
                >
                  <SelectTrigger aria-label={`${label}: recorded by`}>
                    <SelectValue placeholder="Recorded by…" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label={`${label}: applies from whole-life cost (optional)`}
                  placeholder="From £ (optional)"
                  inputMode="decimal"
                  value={step.minValue}
                  disabled={!canEdit}
                  onChange={(event) => set(index, { minValue: event.target.value })}
                />
                {canEdit && (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Move ${label} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Move ${label} down`}
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${label}`}
                      onClick={() => onChange(steps.filter((_, i) => i !== index))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {canEdit && steps.length < 10 && (
        <Button
          className="mt-2"
          size="sm"
          variant="outline"
          onClick={() => onChange([...steps, { name: "", governanceRole: "", minValue: "" }])}
        >
          <Plus />
          Add step
        </Button>
      )}
    </section>
  );
}
