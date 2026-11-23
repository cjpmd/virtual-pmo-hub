// Impact assessments (NHS-3 part 2): the answer form — screening per quality domain, equality per
// protected characteristic, and the full assessment when screening says one is needed. Controlled:
// the panel keeps the draft and saves it. Disabled renders the same layout read-only.
import { Textarea } from "@/components/ui/textarea";
import {
  IMPACTS,
  PATIENT_DATA_HINT,
  type AssessmentAnswers,
  type EqualityAnswer,
  type Impact,
  type ImpactTemplate,
  type QualityAnswer,
  type ScreeningAnswer,
} from "@/data/impact-assessment";

const CONSEQUENCE_LABELS = ["Negligible", "Minor", "Moderate", "Major", "Catastrophic"];
const LIKELIHOOD_LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"];
const IMPACT_LABELS: Record<Impact, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70";

function Choice({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
      {label}
      <select
        id={id}
        className={`${selectClass} mt-1 text-foreground`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Text({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string | undefined;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
      {label}
      <Textarea
        id={id}
        className="mt-1 min-h-16 text-sm text-foreground"
        value={value ?? ""}
        disabled={disabled}
        maxLength={4000}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

const impactOptions = IMPACTS.map((value) => ({ value, label: IMPACT_LABELS[value] }));
const levelOptions = (labels: string[]) =>
  labels.map((label, i) => ({ value: String(i + 1), label: `${i + 1} · ${label}` }));
const toLevel = (value: string) => (value ? Number(value) : undefined);
const toImpact = (value: string) => (value ? (value as Impact) : undefined);

/** Consequence × likelihood with the score, shown for negative impacts only. */
function Scoring({
  id,
  answer,
  disabled,
  onChange,
}: {
  id: string;
  answer: ScreeningAnswer;
  disabled: boolean;
  onChange: (patch: Partial<ScreeningAnswer>) => void;
}) {
  const score =
    answer.consequence && answer.likelihood ? answer.consequence * answer.likelihood : null;
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Choice
        id={`${id}-c`}
        label="Consequence"
        value={answer.consequence ? String(answer.consequence) : ""}
        options={levelOptions(CONSEQUENCE_LABELS)}
        disabled={disabled}
        onChange={(v) => onChange({ consequence: toLevel(v) })}
      />
      <Choice
        id={`${id}-l`}
        label="Likelihood"
        value={answer.likelihood ? String(answer.likelihood) : ""}
        options={levelOptions(LIKELIHOOD_LABELS)}
        disabled={disabled}
        onChange={(v) => onChange({ likelihood: toLevel(v) })}
      />
      <p className="pb-2 text-sm" aria-live="polite">
        Score <span className="font-semibold">{score ?? "—"}</span>
      </p>
    </div>
  );
}

export function ImpactAssessmentForm({
  template,
  answers,
  fullRequired,
  disabled,
  onChange,
}: {
  template: ImpactTemplate;
  answers: AssessmentAnswers;
  fullRequired: boolean;
  disabled: boolean;
  onChange: (next: AssessmentAnswers) => void;
}) {
  const setScreening = (key: string, patch: Partial<ScreeningAnswer>) =>
    onChange({
      ...answers,
      screening: { ...answers.screening, [key]: { ...answers.screening[key], ...patch } },
    });
  const setQuality = (key: string, patch: Partial<QualityAnswer>) =>
    onChange({
      ...answers,
      quality: { ...answers.quality, [key]: { ...answers.quality[key], ...patch } },
    });
  const setEquality = (key: string, patch: Partial<EqualityAnswer>) =>
    onChange({
      ...answers,
      equality: { ...answers.equality, [key]: { ...answers.equality[key], ...patch } },
    });

  return (
    <div className="space-y-6">
      {!disabled && <p className="text-xs text-muted-foreground">{PATIENT_DATA_HINT}</p>}
      <fieldset className="space-y-3">
        <legend className="font-medium">Screening</legend>
        <p className="text-sm text-muted-foreground">
          For each quality domain, the likely impact. Score negative impacts on consequence and
          likelihood; a score of {template.fullAssessmentMinScore} or more needs a full assessment.
        </p>
        {template.domains.map((domain) => {
          const answer = answers.screening[domain.key] ?? {};
          const id = `screen-${domain.key}`;
          return (
            <div key={domain.key} className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">{domain.label}</p>
              {domain.question && (
                <p className="text-xs text-muted-foreground">{domain.question}</p>
              )}
              <div className="max-w-xs">
                <Choice
                  id={`${id}-impact`}
                  label="Impact"
                  value={answer.impact ?? ""}
                  options={impactOptions}
                  disabled={disabled}
                  onChange={(v) => setScreening(domain.key, { impact: toImpact(v) })}
                />
              </div>
              {answer.impact === "negative" && (
                <Scoring
                  id={id}
                  answer={answer}
                  disabled={disabled}
                  onChange={(patch) => setScreening(domain.key, patch)}
                />
              )}
              <Text
                id={`${id}-note`}
                label="Note (optional)"
                value={answer.note}
                disabled={disabled}
                onChange={(v) => setScreening(domain.key, { note: v })}
              />
            </div>
          );
        })}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-medium">Equality</legend>
        <p className="text-sm text-muted-foreground">
          The impact on people with each protected characteristic.
          {template.equalityNegativeRequiresFull &&
            " Any negative impact needs a full assessment with evidence and mitigation."}
        </p>
        {template.equality.map((item) => {
          const answer = answers.equality[item.key] ?? {};
          const id = `eq-${item.key}`;
          const detail = answer.impact === "negative" || answer.evidence || answer.mitigation;
          return (
            <div key={item.key} className="space-y-2 rounded-md border p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_12rem] sm:items-end">
                <p className="text-sm font-medium">{item.label}</p>
                <Choice
                  id={`${id}-impact`}
                  label="Impact"
                  value={answer.impact ?? ""}
                  options={impactOptions}
                  disabled={disabled}
                  onChange={(v) => setEquality(item.key, { impact: toImpact(v) })}
                />
              </div>
              {detail && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Text
                    id={`${id}-evidence`}
                    label="Evidence"
                    value={answer.evidence}
                    disabled={disabled}
                    onChange={(v) => setEquality(item.key, { evidence: v })}
                  />
                  <Text
                    id={`${id}-mitigation`}
                    label="Mitigation"
                    value={answer.mitigation}
                    disabled={disabled}
                    onChange={(v) => setEquality(item.key, { mitigation: v })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </fieldset>

      {fullRequired && (
        <fieldset className="space-y-3">
          <legend className="font-medium">Full assessment</legend>
          <p className="text-sm text-muted-foreground">
            Screening found a significant impact, so each quality domain needs a full assessment.
          </p>
          {template.domains.map((domain) => {
            const answer = answers.quality[domain.key] ?? {};
            const id = `full-${domain.key}`;
            return (
              <div key={domain.key} className="space-y-2 rounded-md border p-3">
                <p className="text-sm font-medium">{domain.label}</p>
                <div className="max-w-xs">
                  <Choice
                    id={`${id}-impact`}
                    label="Impact"
                    value={answer.impact ?? ""}
                    options={impactOptions}
                    disabled={disabled}
                    onChange={(v) => setQuality(domain.key, { impact: toImpact(v) })}
                  />
                </div>
                <Text
                  id={`${id}-description`}
                  label="Description"
                  value={answer.description}
                  disabled={disabled}
                  onChange={(v) => setQuality(domain.key, { description: v })}
                />
                {answer.impact === "negative" && (
                  <>
                    <Scoring
                      id={id}
                      answer={answer}
                      disabled={disabled}
                      onChange={(patch) => setQuality(domain.key, patch)}
                    />
                    <Text
                      id={`${id}-mitigations`}
                      label="Mitigations"
                      value={answer.mitigations}
                      disabled={disabled}
                      onChange={(v) => setQuality(domain.key, { mitigations: v })}
                    />
                  </>
                )}
                <Text
                  id={`${id}-indicators`}
                  label="Indicators to monitor (one per line)"
                  value={answer.indicators?.join("\n")}
                  disabled={disabled}
                  // Blank lines are kept while typing and dropped on save (cleanAnswers).
                  onChange={(v) => setQuality(domain.key, { indicators: v.split("\n") })}
                />
              </div>
            );
          })}
        </fieldset>
      )}
    </div>
  );
}
