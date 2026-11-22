// Settings › Modules (NHS-0): switch individual modules on or off, apply a sector pack after a
// preview of exactly what it adds, and assign people to governance roles. Admins switch modules
// and apply packs; PMO members and admins assign governance roles. The database checks both
// again (set_organisation_module, apply_sector_pack, governance_role_holders RLS).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { SettingsCard, useCanEditSettings } from "@/components/settings/settings-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { monthNames } from "@/data/settings-data";
import {
  moduleTermLabels,
  sectorPacks,
  type ModuleTermKey,
  type SectorPack,
} from "@/data/sector-packs";
import { useOrgWritable } from "@/hooks/use-org-access";
import { MODULES, moduleDefinition, moduleName, type ModuleKey } from "@/lib/modules";
import {
  addGovernanceRoleHolder,
  applySectorPack,
  listGovernanceRoleHolders,
  listGovernanceRoles,
  previewSectorPack,
  removeGovernanceRoleHolder,
  setGovernanceRoleDeputy,
  setOrganisationModule,
  type PackPlan,
} from "@/services/modules";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";
import { useSettings } from "@/services/settings";

export function ModulesSettings() {
  return (
    <div className="space-y-6">
      <PackCard />
      <ModulesCard />
      <GovernanceRolesCard />
    </div>
  );
}

function useRefreshSettings() {
  const queryClient = useQueryClient();
  const { organisation } = useOrganisation();
  return () =>
    queryClient.invalidateQueries({ queryKey: qk.settings(organisation.organisationId) });
}

function PackCard() {
  const settings = useSettings();
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const writable = useOrgWritable();
  const canEdit = useCanEditSettings("admin");
  const refresh = useRefreshSettings();
  const [plan, setPlan] = useState<PackPlan | null>(null);
  const current = settings.modules.pack;
  const preview = useMutation({
    meta: { silent: true },
    mutationFn: (pack: SectorPack) => previewSectorPack(orgId, pack),
    onSuccess: setPlan,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const apply = useMutation({
    meta: { silent: true },
    mutationFn: (pack: SectorPack) => applySectorPack(orgId, pack),
    onSuccess: async (result) => {
      setPlan(null);
      await refresh();
      toast.success(
        result.modulesOn.length
          ? `Pack applied: ${result.modulesOn.length} module${result.modulesOn.length === 1 ? "" : "s"} switched on.`
          : "Pack applied.",
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <SettingsCard
      title="Sector pack"
      description="A pack switches on a recommended set of modules with matching wording and starting lists. It only adds: nothing you have already set up is renamed, replaced or deleted, and existing records keep their scores and history."
    >
      <div className="space-y-3">
        {sectorPacks.map((pack) => (
          <div
            key={pack.value}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {pack.label}
                {current === pack.value && (
                  <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                    Current
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{pack.description}</p>
            </div>
            <ReadOnlyTip readOnly={!writable}>
              <Button
                variant="outline"
                size="sm"
                disabled={!canEdit || !writable || preview.isPending}
                onClick={() => preview.mutate(pack.value)}
              >
                {current === pack.value ? "Apply again" : `Apply ${pack.label} pack`}
              </Button>
            </ReadOnlyTip>
          </div>
        ))}
      </div>
      <Dialog open={plan !== null} onOpenChange={(open) => !open && setPlan(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Apply the {sectorPacks.find((item) => item.value === plan?.pack)?.label} pack?
            </DialogTitle>
            <DialogDescription>
              This is everything the pack will change. Nothing else in your organisation changes.
            </DialogDescription>
          </DialogHeader>
          {plan && <PackPlanSummary plan={plan} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlan(null)}>
              Cancel
            </Button>
            <Button
              disabled={!plan || apply.isPending}
              onClick={() => plan && apply.mutate(plan.pack)}
            >
              Apply pack
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsCard>
  );
}

/** What a pack will do, from preview_sector_pack. */
export function PackPlanSummary({ plan }: { plan: PackPlan }) {
  const settings = useSettings();
  const terms = Object.entries(plan.termsAdded);
  const fyChange =
    plan.suggestedFinancialYearStartMonth !== null &&
    plan.suggestedFinancialYearStartMonth !== plan.financialYearStartMonth;
  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="font-medium">Modules switched on</h3>
        {plan.modulesOn.length ? (
          <ul className="mt-1 list-disc pl-5">
            {plan.modulesOn.map((key) => (
              <li key={key}>{moduleDefinition(key).nhsName}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">None: they are already on.</p>
        )}
        {plan.modulesAlreadyOn.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Already on: {plan.modulesAlreadyOn.map((key) => moduleName(key, settings)).join(", ")}.
          </p>
        )}
      </section>
      <section>
        <h3 className="font-medium">Wording added</h3>
        {terms.length ? (
          <ul className="mt-1 list-disc pl-5">
            {terms.map(([key, value]) => (
              <li key={key}>
                {moduleTermLabels[key as ModuleTermKey] ?? key}: “{value}”
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">None.</p>
        )}
        {plan.termsKept.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Kept as you set them:{" "}
            {plan.termsKept.map((key) => moduleTermLabels[key as ModuleTermKey] ?? key).join(", ")}.
          </p>
        )}
      </section>
      <section>
        <h3 className="font-medium">Added to your lists</h3>
        {plan.seeded.length ? (
          <ul className="mt-1 list-disc pl-5">
            {plan.seeded.map((item) => (
              <li key={`${item.list}:${item.value}`}>Governance role: {item.label}</li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Nothing new.</p>
        )}
      </section>
      {fyChange && (
        <p
          role="note"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs"
        >
          Your financial year starts in {monthNames[plan.financialYearStartMonth - 1]}. NHS
          organisations usually use {monthNames[(plan.suggestedFinancialYearStartMonth ?? 4) - 1]}.
          The pack doesn't change it: changing it regroups existing monthly financials and benefit
          periods into different years, so do it deliberately in Settings › Regional & currency.
        </p>
      )}
    </div>
  );
}

function ModulesCard() {
  const settings = useSettings();
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const writable = useOrgWritable();
  const canEdit = useCanEditSettings("admin");
  const refresh = useRefreshSettings();
  const toggle = useMutation({
    meta: { silent: true },
    mutationFn: ({ key, enabled }: { key: ModuleKey; enabled: boolean }) =>
      setOrganisationModule(orgId, key, enabled),
    onSuccess: async (_result, { key, enabled }) => {
      await refresh();
      toast.success(
        `${moduleName(key, settings)} switched ${enabled ? "on" : "off"}.${enabled ? "" : " Its data is kept."}`,
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <SettingsCard
      title="Modules"
      description="Switch on only what your organisation uses. Switching a module off hides it and keeps its data; switching it back on brings it back. Changes are recorded in the audit log."
    >
      <ul className="divide-y">
        {MODULES.map((module) => {
          const enabled = settings.modules.enabled[module.key] === true;
          const id = `module-${module.key}`;
          const recommends = module.recommends.filter(
            (key) => settings.modules.enabled[key] !== true,
          );
          return (
            <li key={module.key} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <label htmlFor={id} className="font-medium">
                  {moduleName(module.key, settings)}
                </label>
                <p className="text-sm text-muted-foreground">{module.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Adds: {module.adds.join("; ")}.
                  {module.healthOnly &&
                    settings.modules.pack !== "nhs" &&
                    " Designed for health and care organisations."}
                </p>
                {enabled && recommends.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Works best with {recommends.map((key) => moduleName(key, settings)).join(", ")}.
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Screens for this module arrive in a later release ({module.builtIn}); switching it
                  on now records your choice and sets up its defaults.
                </p>
              </div>
              <ReadOnlyTip readOnly={!writable}>
                <Switch
                  id={id}
                  checked={enabled}
                  disabled={!canEdit || !writable || toggle.isPending}
                  onCheckedChange={(checked) =>
                    toggle.mutate({ key: module.key, enabled: checked })
                  }
                />
              </ReadOnlyTip>
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
}

function GovernanceRolesCard() {
  const settings = useSettings();
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const queryClient = useQueryClient();
  const writable = useOrgWritable();
  const canEdit = useCanEditSettings("pmo");
  const key = qk.governanceRoles(orgId);
  const data = useQuery({
    queryKey: key,
    queryFn: async () => ({
      roles: await listGovernanceRoles(orgId),
      holders: await listGovernanceRoleHolders(orgId),
    }),
  });
  const [roleKey, setRoleKey] = useState("");
  const [profileId, setProfileId] = useState("");
  const [deputy, setDeputy] = useState(false);
  const done = () => queryClient.invalidateQueries({ queryKey: key });
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const add = useMutation({
    meta: { silent: true },
    mutationFn: () => addGovernanceRoleHolder(orgId, { roleKey, profileId, isDeputy: deputy }),
    onSuccess: async () => {
      setProfileId("");
      setDeputy(false);
      await done();
    },
    onError,
  });
  const remove = useMutation({
    meta: { silent: true },
    mutationFn: removeGovernanceRoleHolder,
    onSuccess: done,
    onError,
  });
  const flip = useMutation({
    meta: { silent: true },
    mutationFn: (input: {
      holder: Parameters<typeof setGovernanceRoleDeputy>[0];
      isDeputy: boolean;
    }) => setGovernanceRoleDeputy(input.holder, input.isDeputy),
    onSuccess: done,
    onError,
  });
  const roles = (data.data?.roles ?? []).filter((role) => role.isActive);
  const holders = data.data?.holders ?? [];
  const people = settings.users.filter((user) => user.active);
  const personName = (id: string) => people.find((user) => user.id === id)?.name ?? "Former member";
  const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm";
  return (
    <SettingsCard
      requires="pmo"
      title="Governance roles"
      description="Name who holds each governance role. Approval steps that ask for a role (for example Medical Director sign-off) can only be decided by its holders or their deputies. Edit the roles themselves in Settings › Lists & categories."
    >
      {data.isPending ? (
        <p className="text-sm text-muted-foreground">Loading governance roles…</p>
      ) : data.isError ? (
        <p className="text-sm text-destructive">{errorMessage(data.error)}</p>
      ) : roles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No governance roles yet. Switch on a module or apply a pack to add the starting list, or
          add roles in Settings › Lists & categories.
        </p>
      ) : (
        <div className="space-y-4">
          <ul className="divide-y rounded-lg border">
            {roles.map((role) => {
              const list = holders.filter((holder) => holder.roleKey === role.value);
              return (
                <li key={role.value} className="p-3">
                  <p className="font-medium">{role.label}</p>
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nobody assigned.</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {list.map((holder) => (
                        <li key={holder.id} className="flex flex-wrap items-center gap-3 text-sm">
                          <span>{personName(holder.profileId)}</span>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <input
                              type="checkbox"
                              checked={holder.isDeputy}
                              disabled={!canEdit || !writable || flip.isPending}
                              onChange={(event) =>
                                flip.mutate({ holder, isDeputy: event.target.checked })
                              }
                            />
                            Deputy
                          </label>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove ${personName(holder.profileId)} as ${role.label}`}
                            disabled={!canEdit || !writable || remove.isPending}
                            onClick={() => remove.mutate(holder.id)}
                          >
                            <Trash2 />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
            <label className="text-sm">
              Role
              <select
                className={`${sel} mt-1`}
                value={roleKey}
                disabled={!canEdit || !writable}
                onChange={(event) => setRoleKey(event.target.value)}
              >
                <option value="">Choose a role</option>
                {roles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Person
              <select
                className={`${sel} mt-1`}
                value={profileId}
                disabled={!canEdit || !writable}
                onChange={(event) => setProfileId(event.target.value)}
              >
                <option value="">Choose a member</option>
                {people.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={deputy}
                disabled={!canEdit || !writable}
                onChange={(event) => setDeputy(event.target.checked)}
              />
              Deputy
            </label>
            <ReadOnlyTip readOnly={!writable}>
              <Button
                disabled={!canEdit || !writable || !roleKey || !profileId || add.isPending}
                onClick={() => add.mutate()}
              >
                <UserPlus />
                Assign
              </Button>
            </ReadOnlyTip>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
