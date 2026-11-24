// Impact assessments (NHS-3 part 2), in Settings › Modules while the module is on: the delivery
// gate (the lifecycle phase projects can't enter without an approved assessment) and the
// organisation's template (domains, equality list, threshold, review period and sign-off route).
// Admins only; the database checks again (set_impact_assessment_gate / _template). A template
// change applies to assessments started afterwards; existing ones keep the template they began with.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { QueryState } from "@/components/query-state";
import { SettingsCard, useCanEditSettings } from "@/components/settings/settings-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  REVIEW_MONTH_CHOICES,
  templateKey,
  type ImpactTemplate,
  type TemplateItem,
} from "@/data/impact-assessment";
import { useGovernanceRoleInfo } from "@/hooks/use-impact-assessments";
import { useOrgWritable } from "@/hooks/use-org-access";
import { useModule, useModuleTerm } from "@/lib/modules";
import { getImpactTemplate, setImpactGate, setImpactTemplate } from "@/services/impact-assessments";
import { qk } from "@/services/query-keys";
import { errorMessage } from "@/services/service-error";
import { useSettings } from "@/services/settings";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function ImpactAssessmentSettings() {
  const enabled = useModule("impact_assessment");
  if (!enabled) return null;
  return (
    <>
      <GateCard />
      <TemplateCard />
    </>
  );
}

function GateCard() {
  const settings = useSettings();
  const term = useModuleTerm();
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const client = useQueryClient();
  const writable = useOrgWritable();
  const canEdit = useCanEditSettings("admin");
  const current = settings.modules.impactGatePhaseId ?? "";
  const [phase, setPhase] = useState(current);
  useEffect(() => setPhase(current), [current]);
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => setImpactGate(orgId, phase || null),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: qk.settings(orgId) });
      await client.invalidateQueries({ queryKey: qk.impactAssessments.all(orgId) });
      toast.success(phase ? "Delivery gate saved." : "Delivery gate switched off.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <SettingsCard
      title={`${term("impactAssessment.short")} delivery gate`}
      description="Projects can't move into the chosen lifecycle phase, or any later one, until their assessment is approved. It only applies to future moves: projects already past it aren't blocked and are listed on the register for follow-up. Sample projects are exempt."
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="block text-xs font-medium text-muted-foreground">Gate phase</span>
          <select
            className={`${selectClass} mt-1 min-w-64`}
            value={phase}
            disabled={!canEdit || !writable}
            onChange={(event) => setPhase(event.target.value)}
          >
            <option value="">No gate</option>
            {settings.lifecycle.phases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {canEdit && (
          <ReadOnlyTip readOnly={!writable}>
            <Button
              disabled={!writable || phase === current || save.isPending}
              onClick={() => save.mutate()}
            >
              Save gate
            </Button>
          </ReadOnlyTip>
        )}
      </div>
    </SettingsCard>
  );
}

function TemplateCard() {
  const settings = useSettings();
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const template = useQuery({
    queryKey: qk.impactAssessments.template(orgId),
    queryFn: () => getImpactTemplate(orgId, settings.modules.pack),
  });
  return (
    <SettingsCard
      title="Impact assessment template"
      description="The quality domains, equality list, full-assessment threshold, review period and sign-off route for new assessments. Assessments already started keep the template they began with."
    >
      <QueryState query={template}>{(value) => <TemplateEditor stored={value} />}</QueryState>
    </SettingsCard>
  );
}

function TemplateEditor({ stored }: { stored: ImpactTemplate }) {
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const client = useQueryClient();
  const writable = useOrgWritable();
  const canEdit = useCanEditSettings("admin") && writable;
  const roles = useGovernanceRoleInfo();
  const [draft, setDraft] = useState(stored);
  useEffect(() => setDraft(stored), [stored]);
  const done = async (message: string) => {
    await client.invalidateQueries({ queryKey: qk.impactAssessments.template(orgId) });
    toast.success(message);
  };
  const onError = (error: unknown) => toast.error(errorMessage(error));
  const save = useMutation({
    meta: { silent: true },
    mutationFn: () => {
      const { version: _version, ...rest } = draft;
      return setImpactTemplate(orgId, rest);
    },
    onSuccess: () => done("Template saved. New assessments use it."),
    onError,
  });
  const reset = useMutation({
    meta: { silent: true },
    mutationFn: () => setImpactTemplate(orgId, null),
    onSuccess: () => done("Template restored to the default."),
    onError,
  });
  const changed = JSON.stringify(draft) !== JSON.stringify(stored);
  const roleOptions = (roles.data?.roles ?? []).filter((role) => role.isActive);
  const roleLabel = (key: string) => roles.data?.labels.get(key) ?? key;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">Template version {stored.version}.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-sm">
          <span className="block text-xs font-medium text-muted-foreground">
            Full assessment from screening score
          </span>
          <Input
            type="number"
            min={1}
            max={25}
            className="mt-1"
            value={draft.fullAssessmentMinScore}
            disabled={!canEdit}
            onChange={(event) =>
              setDraft({ ...draft, fullAssessmentMinScore: Number(event.target.value) || 1 })
            }
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium text-muted-foreground">
            Review after (months)
          </span>
          <select
            className={`${selectClass} mt-1 w-full`}
            value={draft.reviewMonths}
            disabled={!canEdit}
            onChange={(event) => setDraft({ ...draft, reviewMonths: Number(event.target.value) })}
          >
            {REVIEW_MONTH_CHOICES.map((months) => (
              <option key={months} value={months}>
                {months}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Switch
            checked={draft.equalityNegativeRequiresFull}
            disabled={!canEdit}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, equalityNegativeRequiresFull: checked })
            }
          />
          Any negative equality impact needs a full assessment
        </label>
      </div>

      <RoleRoute
        title="Sign-off route"
        hint="Every assessment, in this order. At least one role."
        roles={draft.signoff}
        options={roleOptions}
        roleLabel={roleLabel}
        disabled={!canEdit}
        onChange={(signoff) => setDraft({ ...draft, signoff })}
      />
      <RoleRoute
        title="Extra sign-off for a full assessment"
        hint="Added after the route above, for example a QIA panel."
        roles={draft.fullSignoff}
        options={roleOptions}
        roleLabel={roleLabel}
        disabled={!canEdit}
        onChange={(fullSignoff) => setDraft({ ...draft, fullSignoff })}
      />
      <ItemList
        title="Quality domains"
        items={draft.domains}
        withQuestion
        minimum={1}
        disabled={!canEdit}
        onChange={(domains) => setDraft({ ...draft, domains })}
      />
      <ItemList
        title="Equality: protected characteristics and other groups"
        items={draft.equality}
        withQuestion={false}
        minimum={0}
        disabled={!canEdit}
        onChange={(equality) => setDraft({ ...draft, equality })}
      />

      {canEdit && (
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button
            disabled={!changed || draft.signoff.length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            Save template
          </Button>
          <Button variant="outline" disabled={!changed} onClick={() => setDraft(stored)}>
            Discard changes
          </Button>
          <Button variant="ghost" disabled={reset.isPending} onClick={() => reset.mutate()}>
            Restore default
          </Button>
        </div>
      )}
    </div>
  );
}

function RoleRoute({
  title,
  hint,
  roles,
  options,
  roleLabel,
  disabled,
  onChange,
}: {
  title: string;
  hint: string;
  roles: string[];
  options: Array<{ value: string; label: string }>;
  roleLabel: (key: string) => string;
  disabled: boolean;
  onChange: (roles: string[]) => void;
}) {
  const [adding, setAdding] = useState("");
  const available = options.filter((option) => !roles.includes(option.value));
  const move = (from: number, to: number) => {
    const next = [...roles];
    const [item] = next.splice(from, 1);
    if (item !== undefined) next.splice(to, 0, item);
    onChange(next);
  };
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-xs text-muted-foreground">{hint}</p>
      <ol className="mt-2 space-y-1">
        {roles.map((role, i) => (
          <li key={role} className="flex items-center gap-2 text-sm">
            <span className="w-5 text-muted-foreground">{i + 1}.</span>
            <span className="flex-1">{roleLabel(role)}</span>
            {!disabled && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Move ${roleLabel(role)} up`}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Move ${roleLabel(role)} down`}
                  disabled={i === roles.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${roleLabel(role)}`}
                  onClick={() => onChange(roles.filter((r) => r !== role))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </li>
        ))}
        {roles.length === 0 && <li className="text-sm text-muted-foreground">None.</li>}
      </ol>
      {!disabled && available.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            aria-label={`Add a role to ${title.toLowerCase()}`}
            className={selectClass}
            value={adding}
            onChange={(event) => setAdding(event.target.value)}
          >
            <option value="">Choose a governance role…</option>
            {available.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!adding}
            onClick={() => {
              onChange([...roles, adding]);
              setAdding("");
            }}
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}

function ItemList({
  title,
  items,
  withQuestion,
  minimum,
  disabled,
  onChange,
}: {
  title: string;
  items: TemplateItem[];
  withQuestion: boolean;
  minimum: number;
  disabled: boolean;
  onChange: (items: TemplateItem[]) => void;
}) {
  const [label, setLabel] = useState("");
  const update = (index: number, patch: Partial<TemplateItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="mt-2 space-y-2">
        {items.map((item, i) => (
          <li key={item.key} className="flex flex-wrap items-start gap-2">
            <Input
              aria-label={`${title}: label ${i + 1}`}
              className="min-w-48 flex-1"
              value={item.label}
              maxLength={120}
              disabled={disabled}
              onChange={(event) => update(i, { label: event.target.value })}
            />
            {withQuestion && (
              <Input
                aria-label={`${title}: screening question ${i + 1}`}
                className="min-w-64 flex-[2]"
                placeholder="Screening question (optional)"
                value={item.question ?? ""}
                maxLength={400}
                disabled={disabled}
                onChange={(event) => update(i, { question: event.target.value || undefined })}
              />
            )}
            {!disabled && (
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${item.label}`}
                disabled={items.length <= minimum}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            aria-label={`New item for ${title.toLowerCase()}`}
            className="max-w-xs"
            placeholder="Add…"
            value={label}
            maxLength={120}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!label.trim()}
            onClick={() => {
              onChange([
                ...items,
                {
                  key: templateKey(
                    label,
                    items.map((item) => item.key),
                  ),
                  label: label.trim(),
                },
              ]);
              setLabel("");
            }}
          >
            <Plus className="size-4" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
