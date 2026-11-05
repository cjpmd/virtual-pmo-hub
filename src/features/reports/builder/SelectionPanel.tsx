// Selection panel (spec §9.1): rules with on/off and thresholds (pre-filled from the forum's
// tolerances, overrides marked), the inclusions with reason chips, pin / exclude / reorder, and
// the other projects in scope. The saved selection is the database's (Refresh selection); the
// list previews rule edits instantly with the TS mirror of the rule engine.
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pin, PinOff, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { InclusionRow, ScopeMetricsRow } from "@/services/reports";
import {
  selectInclusions,
  thresholdFor,
  type InclusionReason,
  type Override,
  type SelectionRule,
  type SelectionRuleSet,
  type Tolerances,
} from "../engine/evaluateRules";
import { METRICS, OP_LABEL, getMetric, metricValueText, type RuleOp } from "../engine/metrics";
import { useReportFormat } from "../blocks/primitives";

export function ReasonChip({ reason }: { reason: InclusionReason }) {
  const f = useReportFormat();
  const metric = getMetric(reason.metric);
  const value = metricValueText(reason.metric, reason.value, (v) => f.money(v));
  const threshold = metricValueText(reason.metric, reason.threshold, (v) => f.money(v));
  const short =
    metric?.type === "bool" || metric?.type === "enum"
      ? reason.label
      : `${metric?.label ?? reason.label} ${value}`;
  return (
    <span
      className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px]"
      title={`${reason.label}: ${value} ${OP_LABEL[reason.op]} ${threshold}`}
    >
      {short}
      {metric && metric.type !== "bool" && metric.type !== "enum" && (
        <span className="ml-1 text-muted-foreground">
          {OP_LABEL[reason.op]} {threshold}
        </span>
      )}
    </span>
  );
}

function RuleRow({
  rule,
  tolerances,
  onChange,
  onRemove,
  disabled,
}: {
  rule: SelectionRule;
  tolerances: Tolerances;
  onChange: (rule: SelectionRule) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const metric = getMetric(rule.metric);
  const hasTolerance = Object.prototype.hasOwnProperty.call(tolerances, rule.metric);
  const fromForum = !!rule.useForumTolerance && hasTolerance;
  const threshold = thresholdFor(rule, tolerances);
  const numeric = metric && ["int", "money", "pct", "days"].includes(metric.type);
  return (
    <li className="space-y-1 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Switch
          checked={rule.enabled}
          disabled={disabled}
          aria-label={`${rule.label} ${rule.enabled ? "on" : "off"}`}
          onCheckedChange={(enabled) => onChange({ ...rule, enabled })}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={metric?.description}>
          {rule.label}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          aria-label={`Remove rule ${rule.label}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-11 text-xs text-muted-foreground">
        <span>{metric?.label ?? rule.metric}</span>
        <span>{OP_LABEL[rule.op]}</span>
        {numeric ? (
          <Input
            type="number"
            className="h-7 w-20 text-xs"
            aria-label={`${rule.label} threshold`}
            disabled={disabled}
            value={
              typeof threshold === "number" || typeof threshold === "string"
                ? String(threshold)
                : ""
            }
            onChange={(event) =>
              onChange({ ...rule, value: Number(event.target.value), useForumTolerance: false })
            }
          />
        ) : (
          <span className="font-medium text-foreground">
            {Array.isArray(threshold) ? threshold.join(", ") : String(threshold ?? "—")}
          </span>
        )}
        {metric?.unit && <span>{metric.unit}</span>}
        {fromForum ? (
          <span className="rounded bg-muted px-1">forum tolerance</span>
        ) : hasTolerance && rule.useForumTolerance === false && numeric ? (
          <button
            type="button"
            className="rounded bg-amber-100 px-1 text-amber-900 underline-offset-2 hover:underline dark:bg-amber-900/40 dark:text-amber-100"
            disabled={disabled}
            onClick={() => onChange({ ...rule, useForumTolerance: true })}
            title="Use the forum's tolerance again"
          >
            override · reset
          </button>
        ) : null}
      </div>
    </li>
  );
}

function AddRule({ onAdd }: { onAdd: (rule: SelectionRule) => void }) {
  const [metricKey, setMetricKey] = useState(METRICS[0]!.key);
  const metric = getMetric(metricKey)!;
  const [op, setOp] = useState<RuleOp>(metric.ops[0]!);
  const [value, setValue] = useState("");
  return (
    <div className="space-y-1 rounded-md border border-dashed p-2">
      <div className="flex flex-wrap gap-1">
        <select
          aria-label="Metric"
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-1 text-xs"
          value={metricKey}
          onChange={(event) => {
            setMetricKey(event.target.value);
            setOp(getMetric(event.target.value)!.ops[0]!);
          }}
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
              {m.unit ? ` (${m.unit})` : ""}
            </option>
          ))}
        </select>
        <select
          aria-label="Operator"
          className="h-8 rounded-md border bg-background px-1 text-xs"
          value={op}
          onChange={(e) => setOp(e.target.value as RuleOp)}
        >
          {metric.ops.map((o) => (
            <option key={o} value={o}>
              {OP_LABEL[o]}
            </option>
          ))}
        </select>
        <Input
          aria-label="Value"
          className="h-8 w-20 text-xs"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={metric.type === "enum" ? "red" : "0"}
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => {
          const parsed: SelectionRule["value"] =
            metric.type === "bool"
              ? value.trim().toLowerCase() !== "false"
              : op === "in"
                ? value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean)
                : metric.type === "enum"
                  ? value.trim().toLowerCase()
                  : Number(value || 0);
          onAdd({
            id: `${metricKey}-${Date.now().toString(36)}`,
            label: `${metric.label} ${OP_LABEL[op]} ${value || 0}`,
            metric: metricKey,
            op,
            value: parsed,
            severity: 2,
            enabled: true,
          });
          setValue("");
        }}
      >
        <Plus className="mr-1 size-3" /> Add rule
      </Button>
    </div>
  );
}

export function SelectionPanel({
  ruleSet,
  onRulesChange,
  tolerances,
  metrics,
  inclusions,
  editable,
  saved,
  onRefresh,
  refreshing,
  onSetMode,
  onReorder,
}: {
  ruleSet: SelectionRuleSet;
  onRulesChange: (next: SelectionRuleSet) => void;
  tolerances: Tolerances;
  metrics: ScopeMetricsRow[];
  /** The saved selection (null in template mode: preview only). */
  inclusions: InclusionRow[] | null;
  editable: boolean;
  /** Rules saved (autosave caught up), so Refresh selection applies these rules. */
  saved: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  onSetMode?: (projectId: string, mode: "pinned" | "excluded" | null) => void;
  onReorder?: (ids: string[]) => void;
}) {
  const projects = useMemo(
    () =>
      metrics.map((row) => ({
        projectId: row.project_id,
        name: row.name,
        programme: row.programme,
        metrics: row.metrics,
      })),
    [metrics],
  );
  const byId = useMemo(() => new Map(metrics.map((row) => [row.project_id, row])), [metrics]);
  const overrides: Override[] = (inclusions ?? [])
    .filter((row) => row.mode !== "rule")
    .map((row) => ({ projectId: row.entityId, mode: row.mode as Override["mode"] }));
  const preview = selectInclusions(ruleSet, projects, tolerances, overrides);
  const saved_ = inclusions
    ? inclusions.map((row) => ({
        projectId: row.entityId,
        name: byId.get(row.entityId)?.name ?? "",
        mode: row.mode,
        reasons: row.reasons,
        severity: row.severity ?? 0,
      }))
    : null;
  const list = saved_ ?? preview;
  const included = list.filter((row) => row.mode !== "excluded");
  const excluded = list.filter((row) => row.mode === "excluded");
  const listed = new Set(list.map((row) => row.projectId));
  const others = metrics.filter((row) => !listed.has(row.project_id));
  const stale =
    saved_ !== null &&
    JSON.stringify(
      preview
        .filter((r) => r.mode === "rule")
        .map((r) => r.projectId)
        .sort(),
    ) !==
      JSON.stringify(
        saved_
          .filter((r) => r.mode === "rule")
          .map((r) => r.projectId)
          .sort(),
      );
  const setRule = (index: number, rule: SelectionRule) =>
    onRulesChange({ ...ruleSet, rules: ruleSet.rules.map((r, i) => (i === index ? rule : r)) });
  const label = (id: string) => {
    const row = byId.get(id);
    return row ? `${row.code} ${row.name}` : id;
  };
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Rules</h3>
          <select
            aria-label="Match"
            className="h-7 rounded-md border bg-background px-1 text-xs"
            value={ruleSet.mode}
            disabled={!editable}
            onChange={(event) =>
              onRulesChange({ ...ruleSet, mode: event.target.value as "any" | "all" })
            }
          >
            <option value="any">Include if any rule matches</option>
            <option value="all">Include if all rules match</option>
          </select>
        </div>
        <ul className="space-y-1.5">
          {ruleSet.rules.map((rule, index) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              tolerances={tolerances}
              disabled={!editable}
              onChange={(next) => setRule(index, next)}
              onRemove={() =>
                onRulesChange({ ...ruleSet, rules: ruleSet.rules.filter((_, i) => i !== index) })
              }
            />
          ))}
        </ul>
        {!ruleSet.rules.length && (
          <p className="text-xs text-muted-foreground">No rules: deep-dives are pinned by hand.</p>
        )}
        {editable && (
          <AddRule
            onAdd={(rule) => onRulesChange({ ...ruleSet, rules: [...ruleSet.rules, rule] })}
          />
        )}
        <label className="flex items-center gap-2 text-xs">
          Cap automatic deep-dives at
          <Input
            type="number"
            min={0}
            className="h-7 w-16 text-xs"
            aria-label="Maximum automatic deep-dives"
            disabled={!editable}
            value={ruleSet.maxAutoIncluded ?? ""}
            onChange={(event) => {
              const { maxAutoIncluded: _old, ...rest } = ruleSet;
              onRulesChange(
                event.target.value === ""
                  ? rest
                  : { ...rest, maxAutoIncluded: Number(event.target.value) },
              );
            }}
          />
        </label>
      </div>

      {onRefresh && (
        <div className="space-y-1">
          <Button
            size="sm"
            variant={stale ? "default" : "outline"}
            onClick={onRefresh}
            disabled={!editable || refreshing || !saved}
          >
            <RefreshCw className="mr-1 size-3.5" /> Refresh selection
          </Button>
          {stale && (
            <p className="text-xs text-health-warn-foreground">
              Rules changed: refresh to apply them (
              {preview.filter((r) => r.mode === "rule").length} would match).
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">
          Deep-dives <span className="font-normal text-muted-foreground">({included.length})</span>
        </h3>
        <ol className="space-y-1.5">
          {included.map((row, index) => (
            <li
              key={row.projectId}
              className="rounded-md border p-2"
              data-inclusion={row.projectId}
            >
              <div className="flex items-start gap-1">
                <span className="min-w-0 flex-1 text-sm font-medium">{label(row.projectId)}</span>
                {onReorder && editable && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => {
                        const ids = included.map((r) => r.projectId);
                        [ids[index - 1], ids[index]] = [ids[index]!, ids[index - 1]!];
                        onReorder(ids);
                      }}
                    >
                      <ArrowUp className="size-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      aria-label="Move down"
                      disabled={index === included.length - 1}
                      onClick={() => {
                        const ids = included.map((r) => r.projectId);
                        [ids[index + 1], ids[index]] = [ids[index]!, ids[index + 1]!];
                        onReorder(ids);
                      }}
                    >
                      <ArrowDown className="size-3" />
                    </Button>
                  </>
                )}
                {onSetMode &&
                  editable &&
                  (row.mode === "pinned" ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      aria-label={`Unpin ${label(row.projectId)}`}
                      onClick={() => onSetMode(row.projectId, null)}
                    >
                      <PinOff className="size-3" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-6"
                      aria-label={`Exclude ${label(row.projectId)}`}
                      onClick={() => onSetMode(row.projectId, "excluded")}
                    >
                      <X className="size-3" />
                    </Button>
                  ))}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {row.mode === "pinned" && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                    Pinned
                  </span>
                )}
                {row.reasons.map((reason) => (
                  <ReasonChip key={reason.ruleId + reason.metric} reason={reason} />
                ))}
              </div>
            </li>
          ))}
        </ol>
        {!included.length && <p className="text-xs text-muted-foreground">No projects selected.</p>}
      </div>

      {excluded.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Excluded</h3>
          <ul className="space-y-1">
            {excluded.map((row) => (
              <li key={row.projectId} className="flex items-start gap-1 text-sm">
                <span className="min-w-0 flex-1">
                  {label(row.projectId)}
                  <span className="block text-xs text-muted-foreground">
                    {row.reasons.length
                      ? `Would have matched: ${row.reasons.map((r) => r.label).join(", ")}`
                      : "No rule matches"}
                  </span>
                </span>
                {onSetMode && editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs"
                    onClick={() => onSetMode(row.projectId, null)}
                  >
                    Undo
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1">
        <h3 className="text-sm font-semibold">Other projects in scope</h3>
        <ul className="space-y-1">
          {others.map((row) => (
            <li key={row.project_id} className="flex items-center gap-1 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {row.code} {row.name}
              </span>
              {onSetMode && editable && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => onSetMode(row.project_id, "pinned")}
                >
                  <Pin className="mr-1 size-3" /> Pin
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!others.length && <p className="text-xs text-muted-foreground">None.</p>}
      </div>
    </div>
  );
}
