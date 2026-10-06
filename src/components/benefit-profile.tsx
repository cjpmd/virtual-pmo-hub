import { formatCurrency, formatDate, displayUnit } from "@/lib/format";
import { useState } from "react";
import { Check, ChevronRight, FileCheck2, TriangleAlert, X } from "lucide-react";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BenefitsData, BenefitView } from "@/services/benefits";
import { periodFor } from "@/services/benefits";
import { getMeasureActualSeries, lifecycleMessages } from "@/services/benefits-value";
import { useBenefitMutations } from "@/hooks/use-benefits";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { useCan } from "@/hooks/use-permissions";
import { todayIso } from "@/lib/today";
import { Button } from "@/components/ui/button";
import { HealthPill } from "@/components/health-pill";
import { Fact, KpiCard } from "@/components/pmo-ui";
const lifecycle = ["Identified", "Validated", "Planned", "In realisation", "Realised", "Closed"];
const money = (value: number) => formatCurrency(Math.abs(value));
export function BenefitProfile({ benefit, data }: { benefit: BenefitView; data: BenefitsData }) {
  const records = Object.fromEntries(
      benefit.measures.map((measure) => [measure.id, measure.records]),
    ),
    [open, setOpen] = useState(false),
    [measureId, setMeasureId] = useState(benefit.measures[0]?.id ?? ""),
    [periodId, setPeriodId] = useState(
      () => periodFor(data.periods, todayIso())?.id ?? data.periods[0]?.id ?? "",
    ),
    [actual, setActual] = useState(""),
    [evidence, setEvidence] = useState(""),
    [notes, setNotes] = useState(""),
    [notice, setNotice] = useState("");
  const canRecord = useCan("contributor", benefit.workspaceId),
    submitterId = useMyResourceId(),
    { submitMeasurement } = useBenefitMutations();
  const validation = lifecycleMessages(benefit),
    current = lifecycle.indexOf(
      benefit.status === "Partially realised" || benefit.status === "Not realised"
        ? "Realised"
        : benefit.status,
    );
  const projectName = (id: string) =>
    data.projects.find((project) => project.id === id)?.name ?? "Unknown project";
  const record = () => {
    if (actual.trim() === "" || !Number.isFinite(Number(actual))) {
      setNotice("Enter the actual value as a number before submitting.");
      return;
    }
    if (!measureId || !periodId) {
      setNotice("Choose a measure and a period.");
      return;
    }
    submitMeasurement.mutate(
      {
        measureId,
        periodId,
        actualValue: Number(actual),
        notes,
        evidence,
        submittedById: submitterId,
        submittedDate: todayIso(),
      },
      {
        onSuccess: () => {
          setOpen(false);
          setActual("");
          setNotes("");
          setEvidence("");
          setNotice("Measurement recorded and sent to the PMO for validation.");
        },
      },
    );
  };
  const activity = [
    ...benefit.measures.flatMap((measure) =>
      measure.records.flatMap((item) => [
        ...(item.submittedDate
          ? [
              {
                date: item.submittedDate,
                text: `${item.submittedBy} submitted ${measure.name} for ${item.period}`,
              },
            ]
          : []),
        ...(item.validatedDate
          ? [
              {
                date: item.validatedDate,
                text: `${item.validatedBy ?? "PMO"} validated ${measure.name} for ${item.period}`,
              },
            ]
          : []),
      ]),
    ),
    ...benefit.reviews.map((review) => ({
      date: review.date,
      text: `${review.reviewer || "Reviewer"} held a ${review.type.toLowerCase()}`,
    })),
    ...(benefit.eligibilityConfirmedDate
      ? [
          {
            date: benefit.eligibilityConfirmedDate,
            text: `${benefit.eligibilityConfirmedBy ?? "PMO"} confirmed eligibility`,
          },
        ]
      : []),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);
  return (
    <div className="space-y-6">
      <header className="border-b pb-6">
        <p className="text-xs font-semibold uppercase text-primary">
          {benefit.reference} · {benefit.type}
        </p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold">{benefit.title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{benefit.description}</p>
          </div>
          <div className="flex gap-2">
            <HealthPill health={benefit.realisation.health} />
            <span className="rounded bg-muted px-2 py-1 text-xs font-semibold">
              {benefit.confidence} confidence
            </span>
          </div>
        </div>
        <div className="mt-6 flex overflow-x-auto">
          {lifecycle.map((step, index) => (
            <div key={step} className="flex min-w-[140px] flex-1 items-center">
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full border text-xs ${index <= current ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}
              >
                {index < current ? <Check className="size-4" /> : index + 1}
              </span>
              <span
                className={`ml-2 text-xs ${index === current ? "font-semibold text-primary" : "text-muted-foreground"}`}
              >
                {step}
              </span>
              {index < lifecycle.length - 1 && (
                <ChevronRight className="ml-auto size-4 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      </header>
      {!validation.valid && (
        <div className="flex gap-3 rounded-md border border-health-warn/40 bg-health-warn/10 p-4">
          <TriangleAlert className="size-5 text-health-warn-foreground" />
          <div>
            {validation.messages.map((message) => (
              <p key={message} className="text-sm">
                {message}
              </p>
            ))}
          </div>
        </div>
      )}
      {notice && (
        <div className="rounded-md border border-primary/20 bg-accent p-3 text-sm">{notice}</div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Planned value"
          value={money(benefit.plannedTotalValue)}
          detail={benefit.classification}
          icon="budget"
        />
        <KpiCard
          label="Realised to date"
          value={money(benefit.realisation.realised)}
          detail={`${benefit.realisation.percent}% of profile`}
          icon="forecast"
        />
        <KpiCard
          label="Measures"
          value={String(benefit.measures.length)}
          detail={`${benefit.measures.flatMap((measure) => records[measure.id] ?? []).length} evidence records`}
          icon="health"
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Description and classification">
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Fact label="Classification" value={benefit.classification} />
            <Fact label="Category" value={benefit.category} />
            <Fact label="Beneficiaries" value={benefit.beneficiaries.join(", ")} />
            <Fact label="SRO" value={benefit.sro} />
            <Fact label="Benefit owner" value={benefit.owner || "Not assigned"} />
            <Fact
              label="Eligibility"
              value={
                benefit.eligibilityConfirmed
                  ? `Confirmed by ${benefit.eligibilityConfirmedBy}`
                  : "Not confirmed"
              }
            />
          </div>
        </Section>
        <Section title="Strategic contribution">
          <div className="mt-4 space-y-3">
            {benefit.strategicObjectiveIds.map((id) => {
              const objective = data.objectives.find((item) => item.id === id);
              return objective ? (
                <div key={id} className="rounded-md bg-accent/40 p-3">
                  <p className="text-sm font-semibold">{objective.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{objective.description}</p>
                </div>
              ) : null;
            })}
          </div>
        </Section>
      </div>
      <Section title="Enabling projects and attribution">
        <div className="mt-4 divide-y rounded-md border">
          {benefit.enablingProjects.map((link) => (
            <div key={link.projectId} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">{projectName(link.projectId)}</p>
                <p className="text-xs text-muted-foreground">Enabling delivery contribution</p>
              </div>
              <strong>{link.attribution}%</strong>
            </div>
          ))}
        </div>
      </Section>
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Measures</h2>
            <p className="text-sm text-muted-foreground">
              Baseline, target profile and validated actuals.
            </p>
          </div>
          {canRecord && benefit.measures.length > 0 && (
            <Button onClick={() => setOpen(true)}>
              <FileCheck2 />
              Record measurement
            </Button>
          )}
        </div>
        {benefit.measures.map((measure) => {
          const display = measure,
            series = getMeasureActualSeries(display);
          return (
            <Section key={measure.id} title={measure.name}>
              <div className="mt-4 grid gap-5 xl:grid-cols-[1fr_1.3fr]">
                <div className="grid grid-cols-2 gap-4">
                  <Fact
                    label="Baseline"
                    value={`${measure.baselineValue.toLocaleString("en-GB")} ${displayUnit(measure.unit)}`}
                  />
                  <Fact
                    label="Baseline date"
                    value={measure.baselineDate ? formatDate(measure.baselineDate) : "Not set"}
                  />
                  <Fact label="Frequency" value={measure.frequency} />
                  <Fact label="Data source" value={measure.dataSource} />
                  <Fact label="Method" value={measure.measurementMethod} />
                  <Fact label="Provider" value={measure.dataProvider} />
                </div>
                <div className="h-56">
                  <ResponsiveContainer>
                    <LineChart data={series}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip />
                      <Line dataKey="target" stroke="var(--viz-cat-2)" strokeWidth={2} />
                      <Line dataKey="actual" stroke="var(--primary)" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="p-2">Period</th>
                      {measure.targetProfile.map((target) => (
                        <th key={target.period} className="p-2">
                          {target.period}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <th className="p-2">Target</th>
                      {measure.targetProfile.map((target) => (
                        <td key={target.period} className="p-2">
                          {target.value.toLocaleString("en-GB")}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th className="p-2">Actual</th>
                      {measure.targetProfile.map((target) => (
                        <td key={target.period} className="p-2">
                          {[...display.records]
                            .reverse()
                            .find(
                              (item) => item.period === target.period && item.status !== "Queried",
                            )
                            ?.actualValue.toLocaleString("en-GB") ?? "—"}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </Section>
          );
        })}
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Measurement history">
          <div className="mt-4 divide-y">
            {benefit.measures.flatMap((measure) =>
              (records[measure.id] ?? []).map((item) => (
                <div key={item.id} className="py-3">
                  <div className="flex justify-between">
                    <p className="text-sm font-medium">
                      {measure.name} · {item.period}
                    </p>
                    <span className="text-xs font-semibold">{item.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.actualValue.toLocaleString("en-GB")} {displayUnit(measure.unit)}
                    {item.evidence ? ` · ${item.evidence}` : ""}
                    {item.submittedDate ? ` · submitted ${formatDate(item.submittedDate)}` : ""}
                  </p>
                  {item.queryNote && (
                    <p className="mt-1 text-xs font-medium text-health-warn-foreground">
                      Query: {item.queryNote}
                    </p>
                  )}
                </div>
              )),
            )}
          </div>
        </Section>
        <Section title="Dependencies">
          <ul className="mt-4 space-y-2">
            {benefit.dependencies.map((item) => (
              <li key={item} className="rounded-md bg-muted/50 p-3 text-sm">
                {item}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Reviews">
          <div className="mt-4 divide-y">
            {benefit.reviews.map((review) => (
              <div key={review.id} className="py-3">
                <p className="text-sm font-semibold">
                  {review.type} · {formatDate(review.date)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{review.findings}</p>
                <p className="mt-2 text-xs">Lesson: {review.lessonsLearned}</p>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Activity log">
          <div className="mt-4 space-y-3 text-sm">
            {activity.map((entry) => (
              <p key={`${entry.date}-${entry.text}`}>
                {entry.text} · {formatDate(entry.date)}
              </p>
            ))}
            {!activity.length && (
              <p className="text-muted-foreground">
                No measurements, reviews or confirmations recorded yet.
              </p>
            )}
          </div>
        </Section>
      </div>
      {open && (
        <>
          <button
            aria-label="Close measurement panel"
            className="fixed inset-0 z-40 bg-overlay"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-label="Record measurement"
            className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l bg-background p-6 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">Evidence capture</p>
                <h2 className="mt-2 text-2xl font-semibold">Record measurement</h2>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
                <X />
              </Button>
            </div>
            <div className="mt-7 space-y-5">
              <label className="block text-sm font-medium">
                Measure
                <select
                  value={measureId}
                  onChange={(event) => setMeasureId(event.target.value)}
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3"
                >
                  {benefit.measures.map((measure) => (
                    <option key={measure.id} value={measure.id}>
                      {measure.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Period
                <select
                  value={periodId}
                  onChange={(event) => setPeriodId(event.target.value)}
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3"
                >
                  {data.periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {period.period}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Actual value
                <input
                  type="number"
                  value={actual}
                  onChange={(event) => setActual(event.target.value)}
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3"
                />
              </label>
              <label className="block text-sm font-medium">
                Evidence
                <input
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  placeholder="Document name or link, e.g. Q2 provisioning report"
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3"
                />
              </label>
              <label className="block text-sm font-medium">
                Notes
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="mt-2 min-h-28 w-full rounded-md border bg-background p-3"
                />
              </label>
              <Button className="w-full" disabled={submitMeasurement.isPending} onClick={record}>
                Submit for validation
              </Button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
