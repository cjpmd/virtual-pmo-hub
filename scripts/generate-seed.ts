/**
 * Generates supabase/seed.sql: the current mock data recreated inside one demo organisation.
 *
 *   npx tsx scripts/generate-seed.ts > supabase/seed.sql
 *
 * - Deterministic ids: name-based (SHA-1) uuids from the old string ids, so reruns match.
 * - Dates are relative to the run: mock "today" (Monday 21/09/2026) maps to the Monday of the
 *   week the seed runs, so weekdays (and working-day rules) are preserved.
 * - Every person name becomes a resources row. Names found in neither the people directory nor
 *   the settings user list are created as unlinked, non-bookable resources and listed with
 *   `raise notice` when the seed runs.
 */
import { createHash } from "node:crypto";
import { benefitMaps, capabilities, outcomes } from "../src/data/benefits-map-data";
import { assumptions, decisions } from "../src/data/decisions-data";
import { dependencies } from "../src/data/dependencies-data";
import { improvementActions, lessons, phaseLessonsReviews } from "../src/data/lessons-data";
import {
  benefits,
  collections,
  genericResources,
  issuedTasks,
  people,
  portfolio,
  programmes,
  projectRequests,
  projects,
  resourceAssignments,
  roadmaps,
  strategicObjectives,
} from "../src/data/mock-data";
import { defaultSettings, demoUsers } from "../src/data/settings-data";
import type { DependencyEnd, Health, RoadmapHealth } from "../src/data/types";

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------
class Raw {
  constructor(readonly sql: string) {}
  toString() {
    return this.sql;
  }
}
const raw = (sql: string) => new Raw(sql);

/** Name-based (SHA-1) uuid, as a literal. Used for the organisation and workspace. */
const uuidLiteral = (kind: string, id: string) => {
  const h = createHash("sha1").update(`virtual-pmo-demo:${kind}:${id}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};
/** Deterministic id for any other row: a short hash key, expanded to a uuid by u() in SQL. */
const uid = (kind: string, id: string) =>
  raw(`u('${createHash("sha1").update(`${kind}:${id}`).digest("hex").slice(0, 12)}')`);

const lit = (v: unknown): string => {
  if (v instanceof Raw) return v.sql;
  if (v === undefined || v === null) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.length ? `array[${v.map(lit).join(", ")}]` : "'{}'";
  if (typeof v === "object") return `${lit(JSON.stringify(v))}::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const out: string[] = [];
const emit = (sql: string) => out.push(sql);
function insert(table: string, rows: Array<Record<string, unknown>>, suffix = "") {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]!);
  emit(
    `insert into public.${table} (${cols.join(", ")}) values\n  ${rows.map((r) => `(${cols.map((c) => lit(r[c])).join(", ")})`).join(",\n  ")}${suffix};\n`,
  );
}

const MOCK_TODAY = Date.UTC(2026, 8, 21);
const offset = (value: string) => {
  const [d = 1, m = 1, y = 1970] = value.split("/").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - MOCK_TODAY) / 86400000);
};
/** A mock DD/MM/YYYY date as a seed-relative SQL date. */
const d = (value: string | undefined | null) => (value ? raw(`d(${offset(value)})`) : null);
/** A mock DD/MM/YYYY date as a seed-relative timestamptz (09:00 local). */
const ts = (value: string | undefined | null) => (value ? raw(`ts(${offset(value)})`) : null);

const ORG = uuidLiteral("organisation", "demo");
const WS = uuidLiteral("workspace", "dts");
const lk = (key: string, value: string) => raw(`lk('${key}', ${lit(value)})`);
const phaseByName = (name: string) => raw(`phn(${lit(name)})`);
const phaseById = (phaseId: string) => raw(`ph(${Number(phaseId.replace("phase-", ""))})`);
const snake = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const healthMap: Record<Health, string> = {
  "On Track": "green",
  "At Risk": "amber",
  "Off Track": "red",
  "Not Set": "not_set",
};
const roadmapHealthMap: Record<RoadmapHealth, string> = {
  "On track": "green",
  "At risk": "amber",
  "High risk": "red",
  "Not set": "not_set",
  Done: "green",
};
const taskSourceMap = {
  Native: "native",
  "Planner (Basic)": "planner_basic",
  "Planner (Premium)": "planner_premium",
} as const;

// ---------------------------------------------------------------------------
// People → resources. Registered as they are referenced; emitted before everything else.
// ---------------------------------------------------------------------------
interface ResourceRow {
  id: Raw;
  name: string;
  email?: string;
  job_title?: string;
  team?: string;
  line_manager?: string;
  contracted_hours_per_week?: number;
  fte?: number;
  bau_percentage?: number;
  is_bookable: boolean;
  is_placeholder: boolean;
  placeholder_role?: string;
  needs_staffing: boolean;
  source: "people" | "user" | "placeholder" | "unmatched";
}
const resources = new Map<string, ResourceRow>();
const users = demoUsers;
const personIdToName = new Map(people.map((p) => [p.id, p.name]));
for (const p of people) {
  const user = users.find((u) => u.name === p.name);
  resources.set(p.name, {
    id: uid("resource", p.name),
    name: p.name,
    ...(user ? { email: user.email } : {}),
    job_title: p.jobTitle,
    team: p.team,
    line_manager: p.lineManager,
    contracted_hours_per_week: p.contractedHoursPerWeek,
    fte: p.fte,
    bau_percentage: p.bauPercentage,
    is_bookable: true,
    is_placeholder: false,
    needs_staffing: false,
    source: "people",
  });
}
for (const u of users)
  if (!resources.has(u.name))
    resources.set(u.name, {
      id: uid("resource", u.name),
      name: u.name,
      email: u.email,
      is_bookable: false,
      is_placeholder: false,
      needs_staffing: false,
      source: "user",
    });
for (const g of genericResources)
  resources.set(`generic:${g.id}`, {
    id: uid("resource", `generic:${g.id}`),
    name: g.name,
    team: g.team,
    is_bookable: true,
    is_placeholder: true,
    placeholder_role: g.role,
    needs_staffing: g.needsStaffing,
    source: "placeholder",
  });
const unmatched = new Set<string>();
const person = (name: string | undefined | null) => {
  const clean = name?.trim();
  // The prototype marks system-inferred dependencies as raised by "Virtual PMO (inferred)":
  // that is not a person, so it becomes null (validation = 'inferred' already records it).
  if (!clean || clean === "Virtual PMO (inferred)") return null;
  if (!resources.has(clean)) {
    resources.set(clean, {
      id: uid("resource", clean),
      name: clean,
      is_bookable: false,
      is_placeholder: false,
      needs_staffing: false,
      source: "unmatched",
    });
    unmatched.add(clean);
  }
  return resources.get(clean)!.id;
};
const personById = (id: string) => person(personIdToName.get(id) ?? id);

// ---------------------------------------------------------------------------
// Project codes: existing lesson prefixes first, initials for the rest (as the DB does).
// ---------------------------------------------------------------------------
const prefixes: Record<string, string> = {
  "ebbot-chatbot": "EBB",
  "reduce-our-cyber-risk": "CYB",
  "windows-11-rollout": "W11",
  "future-students-crm": "FSC",
  "unified-comms-phase-2": "UC2",
  safezone: "SFZ",
};
const codes = new Map<string, string>(Object.entries(prefixes));
const used = new Set(codes.values());
for (const p of projects) {
  if (codes.has(p.id)) continue;
  const words = p.name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let base = words.map((w) => w[0]).join("");
  if (base.length < 3) base = (p.name.toUpperCase().replace(/[^A-Z0-9]/g, "") + "PRJ").slice(0, 3);
  base = base.slice(0, 6);
  let candidate = base,
    n = 1;
  while (used.has(candidate)) {
    n += 1;
    candidate = base.slice(0, 10 - String(n).length) + n;
  }
  used.add(candidate);
  codes.set(p.id, candidate);
}

// ---------------------------------------------------------------------------
// Build every section (resources are emitted first, once all names are known).
// ---------------------------------------------------------------------------
const P = (id: string) => uid("project", id);
const PR = (id: string) => uid("programme", id);
const PF = uid("portfolio", portfolio.id);
const MS = (id: string) => uid("milestone", id);
const projectById = new Map(projects.map((p) => [p.id, p]));

emit(`-- ---- Portfolio, objectives, programmes, projects, collections ----`);
insert("portfolios", [
  {
    id: PF,
    workspace_id: WS,
    name: portfolio.name,
    description: portfolio.description,
    owner_id: person(portfolio.owner),
    budget: portfolio.budget,
  },
]);
insert(
  "strategic_objectives",
  strategicObjectives.map((o) => ({
    id: uid("objective", o.id),
    portfolio_id: PF,
    title: o.title,
    description: o.description,
    owner_id: person(o.owner),
  })),
);
insert(
  "programmes",
  programmes.map((p) => ({
    id: PR(p.id),
    portfolio_id: PF,
    name: p.name,
    description: p.description,
    manager_id: person(p.manager),
    project_manager_id: person(p.projectManager),
    project_officer_id: person(p.projectOfficer),
    sponsor_id: person(p.sponsor),
    start_date: d(p.start),
    finish_date: d(p.end),
    budget: p.budget,
    value_statement: p.valueStatement,
  })),
);
const stateMap = {
  Proposed: "proposed",
  Active: "active",
  "On Hold": "on_hold",
  Closed: "closed",
} as const;
insert(
  "projects",
  projects.map((p) => ({
    id: P(p.id),
    programme_id: PR(p.programmeId),
    name: p.name,
    code: codes.get(p.id),
    manager_id: person(p.manager),
    project_officer_id: person(p.projectOfficer),
    sponsor_id: person(p.sponsor),
    tier: p.tier.toLowerCase(),
    phase_id: phaseByName(p.stage),
    state: stateMap[p.state],
    priority: p.priority.toLowerCase(),
    start_date: d(p.start),
    finish_date: d(p.finish),
    baseline_finish_date: d(p.baselineFinish),
    budget: p.budget,
    actual: p.actual,
    forecast: p.forecast,
    business_case: p.businessCase,
    benefits_summary: p.benefits,
    task_source: taskSourceMap[p.taskSource],
  })),
);
insert(
  "collections",
  collections.map((c) => ({
    id: uid("collection", c.id),
    workspace_id: WS,
    name: c.name,
    type_id: lk("collection_type", c.type),
    pot_amount: c.potAmount ?? null,
  })),
);
insert(
  "collection_projects",
  collections.flatMap((c) =>
    c.projectIds.map((pid) => ({
      collection_id: uid("collection", c.id),
      project_id: P(pid),
      award_amount: c.awards?.[pid] ?? null,
    })),
  ),
);

emit(`-- ---- Requests ----`);
const requestStatus = {
  New: "new",
  "In Review": "in_review",
  "On Hold": "on_hold",
  Approved: "approved",
  Rejected: "rejected",
} as const;
const classificationMap = {
  "Cash-releasing": "cash_releasing",
  "Non-cash-releasing": "non_cash_releasing",
  Qualitative: "qualitative",
  Societal: "societal",
} as const;
insert(
  "project_requests",
  projectRequests.map((r) => ({
    id: uid("request", r.id),
    portfolio_id: PF,
    title: r.title,
    status: requestStatus[r.status],
    requester_id: person(r.requester),
    sponsor_id: person(r.sponsor),
    estimated_cost: r.estimatedCost,
    estimated_benefit: r.estimatedBenefit,
    priority: r.priority.toLowerCase(),
    alignment: r.alignment,
    themes: r.themes,
    whole_life_cost: r.wholeLifeCost ?? null,
    appraisal_years: r.appraisalYears ?? null,
  })),
);
insert(
  "request_benefit_drafts",
  projectRequests.flatMap((r) =>
    (r.draftBenefits ?? []).map((b, i) => ({
      id: uid("request_draft", b.id),
      request_id: uid("request", r.id),
      title: b.title,
      classification: classificationMap[b.classification],
      category_id: lk("benefit_category", b.category),
      owner_id: person(b.owner),
      measure: b.measure,
      baseline: b.baseline,
      target: b.target,
      annual_value: b.annualValue,
      years_counted: b.yearsCounted,
      strategic_objective_id: uid("objective", b.strategicObjectiveId),
      sort_order: i + 1,
    })),
  ),
);

emit(`-- ---- Milestones and forecast history ----`);
const milestoneType = {
  Delivery: "delivery",
  Gate: "gate",
  "Key date": "key_date",
  "External dependency": "external_dependency",
} as const;
insert(
  "milestones",
  projects.flatMap((p) =>
    p.milestones.map((m) => ({
      id: MS(m.id),
      project_id: P(p.id),
      title: m.title,
      type: milestoneType[m.type],
      owner_id: person(m.owner),
      baseline_date: d(m.baselineDate),
      forecast_date: d(m.forecastDate),
      actual_date: d(m.actualDate),
      report_to_committee: m.reportToCommittee,
    })),
  ),
);
{
  // Most prototype histories follow one formula (baseline + slip x point/4 at five fortnightly
  // reporting dates); those are generated in SQL. Only histories that differ are listed.
  const reporting = ["24/07/2026", "07/08/2026", "21/08/2026", "04/09/2026", "18/09/2026"];
  const formula = (m: (typeof projects)[number]["milestones"][number]) => {
    const slip = offset(m.forecastDate) - offset(m.baselineDate);
    return reporting.map((r, i) => ({
      reportingDate: r,
      forecastDate: m.baselineDate,
      shift: Math.round(slip * (i / 4)),
    }));
  };
  const all = projects.flatMap((p) => p.milestones);
  const isFormula = (m: (typeof all)[number]) =>
    m.forecastHistory.length === 5 &&
    formula(m).every(
      (f, i) =>
        m.forecastHistory[i]!.reportingDate === f.reportingDate &&
        offset(m.forecastHistory[i]!.forecastDate) === offset(m.baselineDate) + f.shift,
    );
  const formulaKeys = all.filter(isFormula).map((m) => uid("milestone", m.id));
  emit(`insert into public.milestone_forecast_history (milestone_id, reporting_date, forecast_date)
select m.id, d(r.o), m.baseline_date + floor((m.forecast_date - m.baseline_date) * r.i / 4.0 + 0.5)::integer
from public.milestones m
cross join (values (0, ${reporting
    .map(offset)
    .map((o, i) => `${i === 0 ? "" : `(${i}, `}${o})`)
    .join(", ")}) r(i, o)
where m.id in (${formulaKeys.join(", ")})
on conflict (milestone_id, reporting_date) do nothing;
`);
  insert(
    "milestone_forecast_history",
    all
      .filter((m) => !isFormula(m))
      .flatMap((m) =>
        m.forecastHistory
          .filter((h) => offset(h.reportingDate) < 0)
          .map((h) => ({
            milestone_id: MS(m.id),
            reporting_date: d(h.reportingDate),
            forecast_date: d(h.forecastDate),
          })),
      ),
    "\non conflict (milestone_id, reporting_date) do nothing",
  );
}

emit(`-- ---- Work items (tasks), buckets, assignees, checklists, links ----`);
const bucketRows = new Map<string, Record<string, unknown>>();
const workItems: Array<Record<string, unknown>> = [],
  assignees: Array<Record<string, unknown>> = [],
  checklist: Array<Record<string, unknown>> = [],
  links: Array<Record<string, unknown>> = [];
for (const p of projects) {
  (p.tasks ?? []).forEach((t, index) => {
    const bucketKey = `${p.id}:${t.bucket}`;
    if (!bucketRows.has(bucketKey))
      bucketRows.set(bucketKey, {
        id: uid("bucket", bucketKey),
        project_id: P(p.id),
        name: t.bucket,
        sort_order: [...bucketRows.keys()].filter((k) => k.startsWith(`${p.id}:`)).length + 1,
      });
    const status =
      t.percentComplete >= 100 ? "done" : t.percentComplete > 0 ? "in_progress" : "not_started";
    workItems.push({
      id: uid("work_item", t.id),
      project_id: P(p.id),
      title: t.title,
      description: t.notes ?? null,
      item_type: t.isMilestone ? "milestone_task" : "task",
      status,
      bucket_id: uid("bucket", bucketKey),
      parent_id: null,
      priority: t.priority.toLowerCase(),
      start_date: d(t.start),
      finish_date: d(t.finish),
      baseline_finish_date: d(t.baselineFinish),
      percent_complete: t.percentComplete,
      estimated_effort_hours: t.estimatedEffortHours ?? null,
      effort_completed_hours: t.effortCompletedHours ?? null,
      labels: t.labels ?? [],
      backlog_rank: index + 1,
      done_at: status === "done" ? ts(t.finish) : null,
      external_source: p.taskSource === "Native" ? null : taskSourceMap[p.taskSource],
      external_id: p.taskSource === "Native" ? null : `demo-${t.id}`,
    });
    for (const name of t.assignees)
      assignees.push({ work_item_id: uid("work_item", t.id), resource_id: person(name) });
    const items =
      t.checklistItems ??
      (t.checklist ?? []).map((label, i) => ({ id: `${t.id}-c${i}`, label, done: false }));
    items.forEach((c, i) =>
      checklist.push({
        id: uid("checklist", `${t.id}:${c.id}`),
        work_item_id: uid("work_item", t.id),
        label: c.label,
        is_done: c.done,
        sort_order: i + 1,
      }),
    );
    for (const dep of t.dependencies)
      links.push({ predecessor_id: uid("work_item", dep), successor_id: uid("work_item", t.id) });
  });
}
insert("project_buckets", [...bucketRows.values()]);
insert("work_items", workItems);
const parents = projects.flatMap((p) =>
  (p.tasks ?? [])
    .filter((t) => t.parentId)
    .map(
      (t) =>
        `update public.work_items set parent_id = ${uid("work_item", t.parentId!)} where id = ${uid("work_item", t.id)};`,
    ),
);
emit(parents.join("\n") + "\n");
insert("work_item_assignees", assignees, "\non conflict do nothing");
insert("work_item_checklist_items", checklist);
insert("work_item_links", links);

emit(`-- ---- Issued tasks: work items + append-only offers ----`);
const issuedStatus = {
  Issued: "issued",
  Accepted: "not_started",
  Declined: "issued",
  "Proposed new date": "issued",
  "In progress": "in_progress",
  Done: "done",
} as const;
const issuedResponse = {
  Issued: null,
  Accepted: "accepted",
  Declined: "declined",
  "Proposed new date": "proposed_date",
  "In progress": "accepted",
  Done: "accepted",
} as const;
insert(
  "work_items",
  issuedTasks.map((t, i) => {
    const project = projectById.get(t.projectId)!;
    const external = t.plannerSync === "Created in Planner" && project.taskSource !== "Native";
    return {
      id: uid("work_item", t.id),
      project_id: P(t.projectId),
      title: t.title,
      description: t.description,
      item_type: "task",
      status: issuedStatus[t.status],
      priority: t.priority.toLowerCase(),
      finish_date: d(t.dueDate),
      estimated_effort_hours: t.estimatedEffortHours,
      backlog_rank: 1000 + i,
      external_source: external ? taskSourceMap[project.taskSource] : null,
      external_id: external ? `demo-${t.id}` : null,
    };
  }),
);
insert(
  "work_item_checklist_items",
  issuedTasks.flatMap((t) =>
    t.checklist.map((label, i) => ({
      id: uid("checklist", `${t.id}:${i}`),
      work_item_id: uid("work_item", t.id),
      label,
      is_done: t.status === "Done",
      sort_order: i + 1,
    })),
  ),
);
insert(
  "work_item_attachments",
  issuedTasks.flatMap((t) =>
    t.attachments.map((file) => ({
      id: uid("attachment", `${t.id}:${file}`),
      work_item_id: uid("work_item", t.id),
      file_name: file,
      storage_path: raw(`'${ORG}/${WS}/' || ${uid("work_item", t.id)} || ${lit(`/${file}`)}`),
    })),
  ),
);
insert(
  "work_item_offers",
  issuedTasks.map((t) => {
    const response = issuedResponse[t.status];
    return {
      id: uid("offer", t.id),
      work_item_id: uid("work_item", t.id),
      issued_by: person(t.issuer),
      issued_to: person(t.assignee),
      issued_at: ts(t.issuedDate),
      acknowledgement_due_date: d(t.acknowledgementDue),
      reminder_sent_at: ts(t.reminderSent),
      response,
      proposed_date: response === "proposed_date" ? d(t.proposedDate) : null,
      comment: t.responseReason ?? null,
      responded_at: response ? ts(t.issuedDate) : null,
    };
  }),
);

emit(`-- ---- Team, resource bookings ----`);
const roleMap = {
  "Project Manager": "project_manager",
  "Project Officer": "project_officer",
  "Programme Manager": "programme_manager",
  "Team Member": "team_member",
  Sponsor: "sponsor",
} as const;
insert(
  "project_team_members",
  projects.flatMap((p) =>
    (p.team ?? []).map((m, i) => ({
      id: uid("team", `${p.id}:${i}`),
      project_id: P(p.id),
      resource_id: personById(m.personId),
      role: roleMap[m.role],
      start_date: d(m.start),
      finish_date: d(m.finish),
      allocated_effort_hours: m.allocatedEffortHours,
    })),
  ),
);
insert(
  "resource_assignments",
  resourceAssignments.map((a) => ({
    id: uid("assignment", a.id),
    project_id: P(a.projectId),
    resource_id:
      a.resourceType === "Generic"
        ? resources.get(`generic:${a.resourceId}`)!.id
        : personById(a.resourceId),
    work_item_id: a.taskId ? uid("work_item", a.taskId) : null,
    role: a.role,
    start_date: d(a.start),
    finish_date: d(a.end),
    hours_per_week: a.hoursPerWeek,
    booking_type: a.bookingType.toLowerCase(),
  })),
);

emit(`-- ---- RAID and change ----`);
const riskIds = new Set<string>(),
  issueIds = new Set<string>();
insert(
  "risks",
  projects.flatMap((p) =>
    p.risks.map((r) => {
      riskIds.add(r.id);
      return {
        id: uid("risk", r.id),
        project_id: P(p.id),
        title: r.title,
        description: r.description,
        owner_id: person(r.owner),
        probability: r.probability,
        impact: r.impact,
        response: r.response.toLowerCase(),
        status: r.status.toLowerCase(),
        review_date: d(r.reviewDate),
      };
    }),
  ),
);
insert(
  "issues",
  projects.flatMap((p) =>
    p.issues.map((i) => {
      issueIds.add(i.id);
      return {
        id: uid("issue", i.id),
        project_id: P(p.id),
        title: i.title,
        owner_id: person(i.owner),
        severity: i.severity.toLowerCase(),
        status: i.status.toLowerCase(),
        due_date: d(i.dueDate),
      };
    }),
  ),
);
const changeKeys = new Set<string>();
insert(
  "change_requests",
  projects.flatMap((p) =>
    (p.changes ?? []).map((c) => {
      changeKeys.add(`${p.id}:${c.id}`);
      return {
        id: uid("change", `${p.id}:${c.id}`),
        project_id: P(p.id),
        title: c.title,
        type_id: lk("change_type", c.type),
        cost_impact: c.costImpact,
        schedule_impact_days: c.scheduleImpactDays,
        status: c.status.toLowerCase(),
        requested_by_id: person(c.requestedBy),
      };
    }),
  ),
);
const assumptionStatus = {
  Open: "open",
  Validated: "validated",
  Invalidated: "invalidated",
} as const;
insert(
  "assumptions",
  assumptions.map((a) => ({
    id: uid("assumption", a.id),
    project_id: a.projectId ? P(a.projectId) : null,
    programme_id: a.projectId ? null : a.programmeId ? PR(a.programmeId) : null,
    assumption: a.assumption,
    owner_id: person(a.owner),
    rationale: a.rationale,
    validation_date: d(a.validationDate),
    status: assumptionStatus[a.status],
    raised_issue_id:
      a.raisedIssueId && issueIds.has(a.raisedIssueId) ? uid("issue", a.raisedIssueId) : null,
    notes: a.notes ?? null,
  })),
);

emit(`-- ---- Dependencies ----`);
const dropped: string[] = [];
const endCols = (side: "giver" | "receiver", e: DependencyEnd) => ({
  [`${side}_programme_id`]: e.kind === "Programme" && e.programmeId ? PR(e.programmeId) : null,
  [`${side}_project_id`]: e.kind === "Project" && e.projectId ? P(e.projectId) : null,
  [`${side}_milestone_id`]: e.kind === "Milestone" && e.milestoneId ? MS(e.milestoneId) : null,
  [`${side}_external_name`]: e.kind === "External" ? (e.externalName ?? "External party") : null,
  [`${side}_owner_id`]: person(e.owner),
});
insert(
  "dependencies",
  dependencies.map((x) => ({
    id: uid("dependency", x.id),
    workspace_id: WS,
    ...endCols("giver", x.giver),
    ...endCols("receiver", x.receiver),
    type: x.type.toLowerCase(),
    description: x.description,
    required_by_date: d(x.requiredBy),
    criticality: x.criticality.toLowerCase(),
    validation: x.validation.toLowerCase(),
    giver_accepted: x.giverAccepted,
    receiver_accepted: x.receiverAccepted,
    health_override: x.healthOverride ? healthMap[x.healthOverride] : null,
    health_override_reason: x.healthOverride ? "Set in the prototype" : null,
    raised_date: d(x.raisedDate),
    raised_by_id: person(x.raisedBy),
  })),
);
const keepRisk = (id: string, where: string) =>
  riskIds.has(id) ? true : (dropped.push(`${where}: risk ${id}`), false);
const keepIssue = (id: string, where: string) =>
  issueIds.has(id) ? true : (dropped.push(`${where}: issue ${id}`), false);
insert(
  "dependency_risks",
  dependencies.flatMap((x) =>
    x.riskIds
      .filter((r) => keepRisk(r, x.reference))
      .map((r) => ({ dependency_id: uid("dependency", x.id), risk_id: uid("risk", r) })),
  ),
);
insert(
  "dependency_issues",
  dependencies.flatMap((x) =>
    x.issueIds
      .filter((i) => keepIssue(i, x.reference))
      .map((i) => ({ dependency_id: uid("dependency", x.id), issue_id: uid("issue", i) })),
  ),
);

emit(`-- ---- Decisions ----`);
const actionStatus = { Open: "open", "In progress": "in_progress", Done: "done" } as const;
insert(
  "decisions",
  decisions.map((x) => ({
    id: uid("decision", x.id),
    project_id: x.projectId ? P(x.projectId) : null,
    programme_id: x.projectId ? null : x.programmeId ? PR(x.programmeId) : null,
    portfolio_id: !x.projectId && !x.programmeId ? PF : null,
    title: x.title,
    context: x.context,
    rationale: x.rationale ?? null,
    decision_maker_id: person(x.decisionMaker),
    forum_id: lk("decision_forum", x.forum),
    needed_by_date: d(x.neededBy),
    decision_date: d(x.decisionDate),
    status: x.status.toLowerCase(),
    impact_scope: x.impact.scope.impacted,
    impact_scope_note: x.impact.scope.note || null,
    impact_cost: x.impact.cost.impacted,
    impact_cost_note: x.impact.cost.note || null,
    impact_time: x.impact.time.impacted,
    impact_time_note: x.impact.time.note || null,
    impact_benefits: x.impact.benefits.impacted,
    impact_benefits_note: x.impact.benefits.note || null,
    evidence_link: x.evidenceLink ?? null,
  })),
);
insert(
  "decision_options",
  decisions.flatMap((x) =>
    x.options.map((o, i) => ({
      id: uid("decision_option", `${x.id}:${o.id}`),
      decision_id: uid("decision", x.id),
      title: o.title,
      pros: o.pros,
      cons: o.cons,
      sort_order: i + 1,
    })),
  ),
);
emit(
  decisions
    .filter((x) => x.chosenOptionId || x.supersedesId)
    .map(
      (x) =>
        `update public.decisions set ${[x.chosenOptionId ? `chosen_option_id = ${uid("decision_option", `${x.id}:${x.chosenOptionId}`)}` : "", x.supersedesId ? `supersedes_id = ${uid("decision", x.supersedesId)}` : ""].filter(Boolean).join(", ")} where id = ${uid("decision", x.id)};`,
    )
    .join("\n") + "\n",
);
insert(
  "decision_actions",
  decisions.flatMap((x) =>
    x.actions.map((a) => ({
      id: uid("decision_action", `${x.id}:${a.id}`),
      decision_id: uid("decision", x.id),
      description: a.description,
      owner_id: person(a.owner),
      due_date: d(a.dueDate),
      status: actionStatus[a.status],
    })),
  ),
);
insert(
  "decision_risks",
  decisions.flatMap((x) =>
    x.riskIds
      .filter((r) => keepRisk(r, x.reference))
      .map((r) => ({ decision_id: uid("decision", x.id), risk_id: uid("risk", r) })),
  ),
);
insert(
  "decision_issues",
  decisions.flatMap((x) =>
    x.issueIds
      .filter((i) => keepIssue(i, x.reference))
      .map((i) => ({ decision_id: uid("decision", x.id), issue_id: uid("issue", i) })),
  ),
);
insert(
  "decision_change_requests",
  decisions.flatMap((x) =>
    x.changeIds
      .filter(
        (c) =>
          (x.projectId && changeKeys.has(`${x.projectId}:${c}`)) ||
          (dropped.push(`${x.reference}: change ${c} (ambiguous outside its project)`), false),
      )
      .map((c) => ({
        decision_id: uid("decision", x.id),
        change_request_id: uid("change", `${x.projectId}:${c}`),
      })),
  ),
);
insert(
  "decision_dependencies",
  decisions.flatMap((x) =>
    x.dependencyIds.map((dep) => ({
      decision_id: uid("decision", x.id),
      dependency_id: uid("dependency", dep),
    })),
  ),
);

emit(`-- ---- Benefits ----`);
const benefitStatus = (s: string) => snake(s);
const reviewType = {
  "Scheduled review": "scheduled",
  "Post-implementation review": "post_implementation",
} as const;
const benefitIds = new Set(benefits.map((b) => b.id));
insert(
  "benefits",
  benefits.map((b) => {
    const first = b.enablingProjects[0] && projectById.get(b.enablingProjects[0].projectId);
    return {
      id: uid("benefit", b.id),
      portfolio_id: PF,
      programme_id: first ? PR(first.programmeId) : null,
      title: b.title,
      description: b.description,
      type: b.type.toLowerCase(),
      classification: classificationMap[b.classification],
      category_id: lk("benefit_category", b.category),
      beneficiaries: b.beneficiaries,
      owner_id: person(b.owner),
      sro_id: person(b.sro),
      status: benefitStatus(b.status),
      confidence: b.confidence.toLowerCase(),
      eligibility_confirmed: b.eligibilityConfirmed,
      eligibility_confirmed_by_id: person(b.eligibilityConfirmedBy),
      eligibility_confirmed_date: d(b.eligibilityConfirmedDate),
      planned_total_value: b.plannedTotalValue,
      dependency_notes: b.dependencies,
    };
  }),
);
insert(
  "benefit_objectives",
  benefits.flatMap((b) =>
    [...new Set(b.strategicObjectiveIds)].map((o) => ({
      benefit_id: uid("benefit", b.id),
      strategic_objective_id: uid("objective", o),
    })),
  ),
);
insert(
  "benefit_projects",
  benefits.flatMap((b) =>
    b.enablingProjects.map((l) => ({
      benefit_id: uid("benefit", b.id),
      project_id: P(l.projectId),
      attribution_percent: l.attribution,
    })),
  ),
);
const period = (label: string) => uid("period", label);
insert(
  "benefit_measures",
  benefits.flatMap((b) =>
    b.measures.map((m, i) => ({
      id: uid("measure", m.id),
      benefit_id: uid("benefit", b.id),
      name: m.name,
      unit: m.unit,
      measurement_method: m.measurementMethod,
      data_source: m.dataSource,
      frequency: m.frequency.toLowerCase(),
      data_provider: m.dataProvider,
      baseline_value: m.baselineValue,
      baseline_date: d(m.baselineDate),
      next_due_date: d(m.nextDue),
      sort_order: i + 1,
    })),
  ),
);
insert(
  "benefit_measure_targets",
  benefits.flatMap((b) =>
    b.measures.flatMap((m) =>
      m.targetProfile.map((t) => ({
        measure_id: uid("measure", m.id),
        period_id: period(t.period),
        value: t.value,
      })),
    ),
  ),
);
insert(
  "benefit_measurements",
  benefits.flatMap((b) =>
    b.measures.flatMap((m) =>
      m.records.map((r) => ({
        id: uid("measurement", `${m.id}:${r.id}`),
        measure_id: uid("measure", m.id),
        period_id: period(r.period),
        actual_value: r.actualValue,
        evidence: r.evidence,
        notes: r.notes,
        submitted_by_id: person(r.submittedBy),
        submitted_date: d(r.submittedDate),
        validated_by_id: person(r.validatedBy),
        validated_date: d(r.validatedDate),
        query_note: r.queryNote ?? null,
        status: r.status.toLowerCase(),
      })),
    ),
  ),
);
insert(
  "benefit_reviews",
  benefits.flatMap((b) =>
    b.reviews.map((r) => ({
      id: uid("benefit_review", `${b.id}:${r.id}`),
      benefit_id: uid("benefit", b.id),
      review_date: d(r.date),
      type: reviewType[r.type],
      findings: r.findings,
      lessons_learned: r.lessonsLearned,
      reviewer_id: person(r.reviewer),
    })),
  ),
);
insert(
  "benefit_handovers",
  benefits
    .filter((b) => b.handover)
    .map((b) => ({
      benefit_id: uid("benefit", b.id),
      bau_owner_id: person(b.handover!.bauOwner),
      bau_service: b.handover!.bauService,
      frequency: b.handover!.frequency.toLowerCase(),
      next_review_date: d(b.handover!.nextReviewDate),
      post_implementation_review_date: d(b.handover!.postImplementationReviewDate),
      confirmed_by_id: person(b.handover!.confirmedBy),
      confirmed_date: d(b.handover!.confirmedDate),
    })),
);
insert(
  "capabilities",
  capabilities.map((c) => ({
    id: uid("capability", c.id),
    programme_id: PR(c.programmeId),
    title: c.title,
    description: c.description,
    owner_id: person(c.owner),
  })),
);
insert(
  "capability_projects",
  capabilities.flatMap((c) =>
    c.projectIds.map((p) => ({ capability_id: uid("capability", c.id), project_id: P(p) })),
  ),
);
insert(
  "outcomes",
  outcomes.map((o) => ({
    id: uid("outcome", o.id),
    programme_id: PR(o.programmeId),
    title: o.title,
    description: o.description,
    owner_id: person(o.owner),
  })),
);
insert(
  "outcome_capabilities",
  outcomes.flatMap((o) =>
    o.capabilityIds.map((c) => ({
      outcome_id: uid("outcome", o.id),
      capability_id: uid("capability", c),
    })),
  ),
);
insert(
  "outcome_benefits",
  outcomes.flatMap((o) =>
    o.benefitIds
      .filter((b) => benefitIds.has(b) || (dropped.push(`${o.id}: benefit ${b}`), false))
      .map((b) => ({ outcome_id: uid("outcome", o.id), benefit_id: uid("benefit", b) })),
  ),
);
insert(
  "benefit_maps",
  benefitMaps.map((m) => ({
    id: uid("benefit_map", m.id),
    programme_id: PR(m.programmeId),
    name: m.name,
    description: m.description,
    layout: m.layout,
  })),
);
insert(
  "decision_benefits",
  decisions.flatMap((x) =>
    x.benefitIds
      .filter((b) => benefitIds.has(b) || (dropped.push(`${x.reference}: benefit ${b}`), false))
      .map((b) => ({ decision_id: uid("decision", x.id), benefit_id: uid("benefit", b) })),
  ),
);

emit(`-- ---- Lessons ----`);
const applicability = {
  "This project only": "this_project",
  "Similar projects": "similar_projects",
  "All projects": "all_projects",
} as const;
insert(
  "lessons",
  lessons.map((l) => ({
    id: uid("lesson", l.id),
    project_id: P(l.projectId),
    phase_id: phaseById(l.phaseId),
    sprint_name: l.sprint ?? null,
    type: l.type.toLowerCase(),
    category_id: lk("lesson_category", l.category),
    summary: l.summary,
    what_happened: l.whatHappened,
    impact: l.impact,
    root_cause: l.rootCause,
    recommendation: l.recommendation,
    applicability: applicability[l.applicability],
    raised_by_id: person(l.raisedBy),
    raised_date: d(l.date),
    status: snake(l.status),
  })),
);
insert(
  "lesson_project_types",
  lessons.flatMap((l) =>
    [...new Set(l.projectTypeTags)].map((tag) => ({
      lesson_id: uid("lesson", l.id),
      project_type_id: lk("project_type", tag),
    })),
  ),
);
insert(
  "improvement_actions",
  improvementActions.map((a) => ({
    id: uid("improvement_action", a.id),
    lesson_id: uid("lesson", a.lessonId),
    description: a.description,
    owner_id: person(a.owner),
    due_date: d(a.dueDate),
    status: actionStatus[a.status],
    embedded_in: a.embeddedIn ?? null,
  })),
);
insert(
  "phase_lessons_reviews",
  phaseLessonsReviews.map((r) => ({
    id: uid("phase_review", r.id),
    project_id: P(r.projectId),
    phase_id: phaseById(r.phaseId),
    review_date: d(r.date),
    facilitator_id: person(r.facilitator),
  })),
);
insert(
  "phase_lessons_review_attendees",
  phaseLessonsReviews.flatMap((r) =>
    [...new Set(r.attendees)].map((a) => ({
      review_id: uid("phase_review", r.id),
      resource_id: person(a),
    })),
  ),
);

emit(`-- ---- Roadmaps ----`);
insert(
  "roadmaps",
  roadmaps.map((r) => ({
    id: uid("roadmap", r.id),
    portfolio_id: PF,
    name: r.name,
    owner_id: person(r.owner),
    description: r.description,
  })),
);
insert(
  "roadmap_rows",
  roadmaps.flatMap((r) =>
    r.rows.map((row, i) => ({
      id: uid("roadmap_row", `${r.id}:${row.id}`),
      roadmap_id: uid("roadmap", r.id),
      name: row.name,
      programme_id: row.programmeId ? PR(row.programmeId) : null,
      collection_id: row.collectionId ? uid("collection", row.collectionId) : null,
      sort_order: i + 1,
    })),
  ),
);
insert(
  "roadmap_items",
  roadmaps.flatMap((r) =>
    r.items.map((item, i) =>
      item.kind === "Linked" && item.projectId
        ? {
            id: uid("roadmap_item", `${r.id}:${item.id}`),
            roadmap_id: uid("roadmap", r.id),
            row_id: uid("roadmap_row", `${r.id}:${item.rowId}`),
            project_id: P(item.projectId),
            title: null,
            start_date: null,
            finish_date: null,
            progress: null,
            health: null,
            owner_id: null,
            priority: null,
            sort_order: i + 1,
          }
        : {
            id: uid("roadmap_item", `${r.id}:${item.id}`),
            roadmap_id: uid("roadmap", r.id),
            row_id: uid("roadmap_row", `${r.id}:${item.rowId}`),
            project_id: null,
            title: item.title,
            start_date: d(item.start),
            finish_date: d(item.finish),
            progress: item.progress ?? 0,
            health: item.health ? roadmapHealthMap[item.health] : "not_set",
            owner_id: person(item.owner),
            priority: item.priority?.toLowerCase() ?? null,
            sort_order: i + 1,
          },
    ),
  ),
);
insert(
  "roadmap_item_collections",
  roadmaps.flatMap((r) =>
    r.items
      .filter((i) => i.kind === "Standalone")
      .flatMap((i) =>
        (i.collectionIds ?? []).map((c) => ({
          roadmap_item_id: uid("roadmap_item", `${r.id}:${i.id}`),
          collection_id: uid("collection", c),
        })),
      ),
  ),
);
insert(
  "roadmap_key_dates",
  roadmaps.flatMap((r) =>
    r.keyDates.map((k) => ({
      id: uid("key_date", `${r.id}:${k.id}`),
      roadmap_id: uid("roadmap", r.id),
      title: k.title,
      date: d(k.date),
      owner_id: person(k.owner),
    })),
  ),
);

emit(
  `-- ---- Status reports (oldest first so refs run SR-001 upwards). The latest report per\n-- project gets evidenced health computed now; older ones carry their declared values. ----`,
);
insert(
  "status_reports",
  projects.flatMap((p) =>
    [...(p.reports ?? [])].reverse().map((r, i, all) => ({
      id: uid("status_report", `${p.id}:${r.id}`),
      project_id: P(p.id),
      reporting_date: d(r.reportingDate),
      submitter_id: person(r.submitter),
      overall: healthMap[r.overall],
      schedule: healthMap[r.schedule],
      financial: healthMap[r.financial],
      effort: healthMap[r.effort],
      issue: healthMap[r.issue],
      accomplished: r.accomplished,
      planned: r.planned,
      comments: r.comments,
      override_reasons: r.overrideReasons ?? {},
      ai_draft: r.aiDraft ?? null,
      ...(i < all.length - 1
        ? {
            evidenced_overall: healthMap[r.overall],
            evidenced_schedule: healthMap[r.schedule],
            evidenced_financial: healthMap[r.financial],
            evidenced_effort: healthMap[r.effort],
            evidenced_issue: healthMap[r.issue],
            evidenced_benefit: null,
          }
        : {
            evidenced_overall: null,
            evidenced_schedule: null,
            evidenced_financial: null,
            evidenced_effort: null,
            evidenced_issue: null,
            evidenced_benefit: null,
          }),
    })),
  ),
);

// ---------------------------------------------------------------------------
// Assemble: header, org, reference data, resources, then the sections above.
// ---------------------------------------------------------------------------
const body = out.splice(0);
const s = defaultSettings;
const orgSettings = {
  organisation: {
    name: "Demo University Digital & Technology Services",
    shortName: "DTS",
    brandColour: s.organisation.brandColour,
    supportContact: "dts-pmo@demo-university.ac.uk",
  },
  regional: { ...s.regional, exchangeRates: undefined },
  workingTime: { ...s.workingTime, holidayCalendars: undefined },
  terminology: s.terminology,
  health: s.health,
  risk: s.risk,
  benefits: {
    optimismBias: s.benefits.optimismBias,
    defaultMeasurementFrequency: s.benefits.defaultMeasurementFrequency,
    appraisalYears: s.benefits.appraisalYears,
  },
  notifications: s.notifications,
  templates: {
    statusReportSections: s.templates.statusReportSections,
    committeePack: s.templates.committeePack,
  },
  data: { retentionMonths: s.data.retentionMonths },
  tiers: s.lifecycle.tiers,
  demoAdmins: [],
};
emit(`-- Virtual PMO demo seed. GENERATED by scripts/generate-seed.ts; do not edit by hand.
-- Recreates the prototype's mock data inside one demo organisation ("Demo University").
-- Dates are relative to the run: mock "today" (Mon 21/09/2026) = Monday of the current week.
-- To get in: add your email to settings.demoAdmins, sign in, then call public.join_demo_organisation().

begin;
set local vpmo.seeding = 'on';

do $$
begin
  if exists (select 1 from public.organisations where id = '${ORG}') then
    raise exception 'The demo organisation is already seeded';
  end if;
end $$;

create schema seed_tmp;
revoke all on schema seed_tmp from public;
set local search_path = seed_tmp, public;
create function seed_tmp.u(k text) returns uuid language sql immutable set search_path = '' as $f$ select md5('virtual-pmo-demo:' || k)::uuid $f$;
create function seed_tmp.lk(k text, v text) returns uuid language sql stable set search_path = '' as $f$
  select id from public.lookup_values where organisation_id = '${ORG}' and list_key = k and value = v
$f$;
create function seed_tmp.ph(n integer) returns uuid language sql stable set search_path = '' as $f$
  select id from public.lifecycle_phases where organisation_id = '${ORG}' and sort_order = n
$f$;
create function seed_tmp.phn(n text) returns uuid language sql stable set search_path = '' as $f$
  select id from public.lifecycle_phases where organisation_id = '${ORG}' and name = n
$f$;
create function seed_tmp.anchor() returns date language sql stable set search_path = '' as $f$
  select date_trunc('week', (now() at time zone 'Europe/London'))::date
$f$;
create function seed_tmp.d(n integer) returns date language sql stable set search_path = '' as $f$ select seed_tmp.anchor() + n $f$;
create function seed_tmp.ts(n integer) returns timestamptz language sql stable set search_path = '' as $f$
  select ((seed_tmp.anchor() + n)::timestamp + interval '9 hours') at time zone 'Europe/London'
$f$;

insert into public.organisations (id, name, short_name, slug, region, is_demo, settings)
values ('${ORG}', 'Demo University', 'DTS', 'demo-university', 'uk', true,
        private.default_org_settings() || ${lit(orgSettings)});
insert into public.organisation_subscriptions (organisation_id, plan, seats_total) values ('${ORG}', 'demo', 50);
select private.seed_org_defaults('${ORG}');
insert into public.workspaces (id, organisation_id, name, description)
values ('${WS}', '${ORG}', 'Digital & Technology Services', 'Demo workspace recreated from the prototype data.');

-- Benefit periods: the four default quarters become the prototype's quarters, shifted with
-- every other date (an update rather than delete + insert, so nothing is destroyed).
`);
const periods = [
  ["Q1 Aug–Oct 2026", "01/08/2026", "31/10/2026"],
  ["Q2 Nov 2026–Jan 2027", "01/11/2026", "31/01/2027"],
  ["Q3 Feb–Apr 2027", "01/02/2027", "30/04/2027"],
  ["Q4 May–Jul 2027", "01/05/2027", "31/07/2027"],
] as const;
emit(`update public.benefit_periods bp set id = v.id, label = v.label, start_date = v.start_date, finish_date = v.finish_date
from (select p.id as old_id, row_number() over (order by p.start_date) as n from public.benefit_periods p where p.organisation_id = '${ORG}') x
join (values
  ${periods.map(([label, start, finish], i) => `(${i + 1}, ${period(label)}, ${lit(label)}, ${d(start)}, ${d(finish)})`).join(",\n  ")}
) v(n, id, label, start_date, finish_date) on v.n = x.n
where bp.id = x.old_id;
`);
insert(
  "exchange_rates",
  s.regional.exchangeRates.map((r) => ({
    organisation_id: ORG,
    currency: r.currency,
    rate: r.rate,
    effective_date: d(r.effectiveDate),
  })),
);
insert(
  "holiday_calendars",
  s.workingTime.holidayCalendars.map((c) => ({
    id: uid("calendar", c.id),
    organisation_id: ORG,
    name: c.name,
  })),
);
insert(
  "holiday_dates",
  s.workingTime.holidayCalendars.flatMap((c) =>
    c.dates.map((x) => ({ calendar_id: uid("calendar", c.id), date: d(x.date), name: x.name })),
  ),
);
insert(
  "project_templates",
  s.templates.projectTemplates.map((t) => ({
    id: uid("template", t.id),
    organisation_id: ORG,
    name: t.name,
    tier: t.tier.toLowerCase(),
    description: t.description,
    task_buckets: t.taskBuckets,
  })),
);
const extraProjectTypes = [...new Set(lessons.flatMap((l) => l.projectTypeTags))].filter(
  (t) => !s.lists.projectTypes.includes(t),
);
const skills = [
  ...new Set([
    ...people.flatMap((p) => p.skills.map((k) => k.name)),
    ...genericResources.flatMap((g) => g.skills.map((k) => k.name)),
  ]),
];
insert(
  "lookup_values",
  [
    ...extraProjectTypes.map((v, i) => ({
      organisation_id: ORG,
      list_key: "project_type",
      value: v,
      label: v,
      sort_order: 100 + i,
    })),
    ...skills.map((v, i) => ({
      organisation_id: ORG,
      list_key: "skill",
      value: v,
      label: v,
      sort_order: i + 1,
    })),
    ...s.lists.tags.map((v, i) => ({
      organisation_id: ORG,
      list_key: "tag",
      value: v,
      label: v,
      sort_order: i + 1,
    })),
  ],
  "\non conflict (organisation_id, list_key, value) do nothing",
);

emit(
  `-- ---- Resources (${resources.size}): ${[...resources.values()].filter((r) => r.is_bookable && !r.is_placeholder).length} bookable people, ${[...resources.values()].filter((r) => r.is_placeholder).length} placeholders, the rest non-bookable ----`,
);
for (const r of [...resources.values()]) if (r.line_manager) person(r.line_manager);
const resRows = [...resources.values()];
insert(
  "resources",
  resRows.map((r) => ({
    id: r.id,
    organisation_id: ORG,
    name: r.name,
    email: r.email ?? null,
    job_title: r.job_title ?? null,
    team_id: r.team ? lk("team", r.team) : null,
    contracted_hours_per_week: r.contracted_hours_per_week ?? null,
    fte: r.fte ?? null,
    bau_percentage: r.bau_percentage ?? null,
    is_bookable: r.is_bookable,
    is_placeholder: r.is_placeholder,
    placeholder_role: r.placeholder_role ?? null,
    needs_staffing: r.needs_staffing,
  })),
);
emit(
  resRows
    .filter((r) => r.line_manager)
    .map(
      (r) =>
        `update public.resources set line_manager_id = ${person(r.line_manager)} where id = ${r.id};`,
    )
    .join("\n") + "\n",
);
insert("resource_skills", [
  ...people.flatMap((p) =>
    p.skills.map((k) => ({
      resource_id: resources.get(p.name)!.id,
      skill_id: lk("skill", k.name),
      level: k.level,
    })),
  ),
  ...genericResources.flatMap((g) =>
    g.skills.map((k) => ({
      resource_id: resources.get(`generic:${g.id}`)!.id,
      skill_id: lk("skill", k.name),
      level: k.level,
    })),
  ),
]);
insert(
  "resource_leave",
  people.flatMap((p) =>
    p.leave.map((l) => ({
      id: uid("leave", l.id),
      resource_id: resources.get(p.name)!.id,
      start_date: d(l.start),
      finish_date: d(l.end),
      leave_type: snake(l.type),
    })),
  ),
);

out.push(...body);
emit(`-- ---- Health snapshots: today's real snapshot, then 11 months of synthetic history ----
select private.capture_health_snapshots('${ORG}', d(0));
insert into public.health_snapshots (organisation_id, workspace_id, portfolio_id, programme_id, project_id, snapshot_date,
  overall, schedule, financial, effort, issue, benefit, forecast_finish_date, forecast_basis, metrics, is_synthetic)
select s.organisation_id, s.workspace_id, s.portfolio_id, s.programme_id, s.project_id, (s.snapshot_date - make_interval(months => k))::date,
  case when k >= 6 and s.overall = 'red' then 'amber'::public.health when k >= 9 and s.overall = 'amber' then 'green'::public.health else s.overall end,
  s.schedule, s.financial, s.effort, s.issue, s.benefit, s.forecast_finish_date - (k * 3), s.forecast_basis,
  case when s.portfolio_id is null then s.metrics else (
    select jsonb_object_agg(e.key, case
      when jsonb_typeof(e.value) <> 'number' then e.value
      when e.key in ('activeProjects', 'green', 'amber', 'red', 'unset', 'percentOnTrack') then to_jsonb(round(e.value::text::numeric * f.factor))
      else to_jsonb(round(e.value::text::numeric * f.factor, 2)) end)
    from jsonb_each(s.metrics) e) end,
  true
from public.health_snapshots s
cross join generate_series(1, 11) k
cross join lateral (select 1 - 0.15 * (1 - (((11 - k) / 11.0) ^ 2 * (3 - 2 * ((11 - k) / 11.0))))::numeric as factor) f
where s.organisation_id = '${ORG}' and not s.is_synthetic
on conflict do nothing;
`);
emit(`do $$
begin
  raise notice 'Demo organisation seeded: ${ORG}';
${[...unmatched]
  .sort()
  .map(
    (n) =>
      `  raise notice 'Unmatched person created as an unlinked, non-bookable resource: ${n.replace(/'/g, "''")}';`,
  )
  .join("\n")}
${dropped.map((x) => `  raise notice 'Reference dropped (target not in seed): ${x.replace(/'/g, "''")}';`).join("\n")}
end $$;

drop schema seed_tmp cascade;
commit;
`);
process.stdout.write(out.join("\n"));
