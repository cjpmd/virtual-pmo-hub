/**
 * Health parity fixture: compares the database roll-ups with services/pmo.ts on the same data.
 *
 *   npx tsx scripts/health-parity.ts <sql-result.json>
 *
 * <sql-result.json> is the single JSON value returned by scripts/health-parity.sql.
 *
 * Two comparisons are reported:
 *   A. Logic parity: pmo.ts fed exactly what the database sees. Task counts are computed from
 *      tasks plus issued tasks (now one work_items table), milestone status is derived by rule,
 *      and programme benefit health uses the benefit's programme (review C). Any difference
 *      here is a porting bug.
 *   B. Behaviour change: pmo.ts on the untouched prototype data (stored taskCount and
 *      overdueTaskCount, stored milestone status, programme benefits via projects). These
 *      differences are the intended consequence of no longer storing derived values.
 *
 * After Stage 4 this is the only place pmo.ts health logic runs.
 */
import { readFileSync } from "node:fs";
import type {
  Benefit,
  Health,
  Milestone,
  MilestoneStatus,
  Project,
  RoadmapHealth,
} from "../src/data/types";
import {
  benefits,
  issuedTasks,
  portfolio,
  programmes,
  projects,
  roadmaps,
} from "../src/data/mock-data";
import { dependencies } from "../src/data/dependencies-data";
import { getDependencyHealth } from "../src/services/dependencies";
import {
  getBenefitDimensionHealth,
  getBenefitHealth,
  getBenefitPercent,
  getBenefitRealised,
  getBenefitVariance,
  getPhaseIndex,
  getProgrammeHealth,
  getProjectHealth,
  getResolvedRoadmapItems,
} from "../src/services/pmo";

type Db = {
  today: string;
  projects: Record<string, Record<string, string | number>>;
  programmes: Record<string, { overall: string; benefit: string }>;
  portfolios: Record<string, string>;
  benefits: Record<string, { health: string; realised: number; percent: number; variance: number }>;
  dependencies: Record<string, { health: string }>;
  milestones: Record<string, string>;
  roadmapItems: Record<string, { health: string; done: boolean; progress: number }>;
};
const db = JSON.parse(readFileSync(process.argv[2] ?? "/dev/stdin", "utf8")) as Db;

const toDb: Record<Health, string> = {
  "On Track": "green",
  "At Risk": "amber",
  "Off Track": "red",
  "Not Set": "not_set",
};
const roadmapToDb: Record<RoadmapHealth, string> = {
  "On track": "green",
  "At risk": "amber",
  "High risk": "red",
  "Not set": "not_set",
  Done: "green",
};
const rank: Record<Health, number> = { "Not Set": 0, "On Track": 1, "At Risk": 2, "Off Track": 3 };
const worst = (items: Health[]) =>
  items.reduce<Health>((w, h) => (rank[h] > rank[w] ? h : w), "Not Set");
const parse = (v: string) => {
  const [d = 1, m = 1, y = 1970] = v.split("/").map(Number);
  return new Date(y, m - 1, d).getTime();
};
const TODAY = parse("21/09/2026");

const milestoneStatus = (m: Milestone): MilestoneStatus => {
  if (m.actualDate) return "Completed";
  const f = parse(m.forecastDate),
    b = parse(m.baselineDate);
  if (f < TODAY) return "Overdue";
  if (f > b) return "Late";
  return f - TODAY > 30 * 86400000 ? "Future" : "On Track";
};
const toDbStatus = (s: MilestoneStatus) => s.toLowerCase().replace(" ", "_");

// A: the prototype data reshaped the way the database stores it.
const issuedByProject = new Map<string, typeof issuedTasks>();
for (const t of issuedTasks)
  issuedByProject.set(t.projectId, [...(issuedByProject.get(t.projectId) ?? []), t]);
const reshaped = (p: Project): Project => {
  // Issued tasks are ordinary work items in the database, so they join the project's tasks.
  const issued = (issuedByProject.get(p.id) ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    bucket: "Issued",
    assignees: [t.assignee],
    start: t.issuedDate,
    finish: t.dueDate,
    percentComplete: t.status === "Done" ? 100 : 0,
    priority: t.priority,
    isMilestone: false,
    checklistCount: t.checklist.length,
    dependencies: [],
  }));
  const tasks = [...(p.tasks ?? []), ...issued];
  const overdue = tasks.filter((t) => t.percentComplete < 100 && parse(t.finish) < TODAY).length;
  return {
    ...p,
    tasks,
    taskCount: tasks.length,
    overdueTaskCount: overdue,
    milestones: p.milestones.map((m) => ({ ...m, status: milestoneStatus(m) })),
  };
};

const rows: string[] = [];
let failures = 0;
const check = (section: string, key: string, expected: unknown, actual: unknown) => {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    failures += 1;
    rows.push(
      `  ✗ ${section} · ${key}: pmo.ts=${JSON.stringify(expected)} db=${JSON.stringify(actual)}`,
    );
  }
};
const count = (label: string, n: number) => rows.push(`${label}: ${n}`);

// ---- A. Logic parity ------------------------------------------------------
rows.push(
  `Database "today": ${db.today} (mock 21/09/2026)`,
  "",
  "A. Logic parity (differences are porting bugs)",
);
const before = failures;
for (const original of projects) {
  const p = reshaped(original);
  const got = db.projects[p.name];
  if (!got) {
    check("project", p.name, "present", "missing");
    continue;
  }
  check("project tasks", p.name, [p.taskCount, p.overdueTaskCount], [got.taskCount, got.overdue]);
  // Patch the shared array entry so pmo.ts helpers that look projects up see the reshaped one.
  const index = projects.indexOf(original);
  projects[index] = p;
  check("project health", p.name, toDb[getProjectHealth(p)], got.overall);
  projects[index] = original;
}
const reshapedProjects = projects.map(reshaped);
const programmeExpected: Health[] = [];
for (const programme of programmes) {
  const kids = reshapedProjects.filter((p) => p.programmeId === programme.id);
  const own = benefits.filter(
    (b) =>
      projects.find((p) => p.id === b.enablingProjects[0]?.projectId)?.programmeId === programme.id,
  );
  const stage = Math.max(0, ...kids.map((p) => getPhaseIndex(p.stage)));
  const saved = projects.splice(0, projects.length, ...reshapedProjects);
  const benefitHealth = getBenefitDimensionHealth(own, stage);
  const expected = worst([...kids.map(getProjectHealth), benefitHealth]);
  projects.splice(0, projects.length, ...saved);
  check("programme health", programme.name, toDb[expected], db.programmes[programme.name]?.overall);
  programmeExpected.push(expected);
}
check(
  "portfolio health",
  portfolio.name,
  toDb[worst(programmeExpected)],
  db.portfolios[portfolio.name],
);
for (const b of benefits as Benefit[]) {
  const got = db.benefits[b.title];
  if (!got) {
    check("benefit", b.title, "present", "missing");
    continue;
  }
  check(
    "benefit",
    b.title,
    {
      health: toDb[getBenefitHealth(b)],
      realised: getBenefitRealised(b),
      percent: getBenefitPercent(b),
      variance: getBenefitVariance(b).variancePercent,
    },
    {
      health: got.health,
      realised: Number(got.realised),
      percent: got.percent,
      variance: got.variance,
    },
  );
}
for (const dep of dependencies)
  check(
    "dependency",
    dep.reference,
    toDb[getDependencyHealth(dep)],
    db.dependencies[dep.reference]?.health,
  );
{
  const saved = projects.splice(0, projects.length, ...reshapedProjects);
  for (const r of roadmaps)
    for (const item of getResolvedRoadmapItems(r)) {
      const got = db.roadmapItems[`${r.name} / ${item.title}`];
      if (!got) {
        check("roadmap", `${r.name} / ${item.title}`, "present", "missing");
        continue;
      }
      check(
        "roadmap",
        `${r.name} / ${item.title}`,
        { health: roadmapToDb[item.health], done: item.health === "Done", progress: item.progress },
        { health: got.health, done: got.done, progress: got.progress },
      );
    }
  projects.splice(0, projects.length, ...saved);
}
count("A failures", failures - before);

// ---- B. Behaviour change vs the prototype ---------------------------------
rows.push(
  "",
  "B. Behaviour change vs the prototype UI (expected; derived values are no longer stored)",
);
const changes: string[] = [];
for (const p of projects) {
  const was = toDb[getProjectHealth(p)],
    now = db.projects[p.name]?.overall;
  if (was !== now)
    changes.push(
      `  ~ project ${p.name}: ${was} → ${now} (stored tasks ${p.taskCount}/${p.overdueTaskCount} overdue; db ${db.projects[p.name]?.taskCount}/${db.projects[p.name]?.overdue})`,
    );
}
for (const programme of programmes) {
  const was = toDb[getProgrammeHealth(programme)],
    now = db.programmes[programme.name]?.overall;
  if (was !== now) changes.push(`  ~ programme ${programme.name}: ${was} → ${now}`);
}
let milestoneChanges = 0;
for (const p of projects)
  for (const m of p.milestones) {
    const now = db.milestones[`${p.name} / ${m.title}`];
    if (now && toDbStatus(m.status) !== now) {
      milestoneChanges += 1;
      changes.push(`  ~ milestone ${p.name} / ${m.title}: stored ${m.status} → derived ${now}`);
    }
  }
rows.push(...changes);
count("B differences", changes.length);
rows.push(
  `  (${milestoneChanges} of them are stored milestone statuses that disagree with the date rule)`,
);

console.log(rows.join("\n"));
process.exitCode = failures ? 1 : 0;
