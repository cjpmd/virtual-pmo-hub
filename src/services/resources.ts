// Resource management on Supabase: people (resources), placeholders, skills, leave, capacity
// bookings (resource_assignments) and project team roles (project_team_members).
//
// One load per organisation. Resources embed their skills and leave (single FKs); bookings,
// team members and projects are read in parallel. The view models keep the prototype's
// shapes (DD/MM/YYYY dates on the planning grid), and every calculation below is pure, so
// the allocation grid, dashboard, scenarios and project team all count the same way.
import type { Database } from "@/integrations/supabase/types";
import type {
  BookingType,
  GenericResource,
  LeaveEntry,
  Person,
  ResourceAssignment,
  ResourceSkill,
  TeamMember,
} from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { fromIsoDate, toIsoDate } from "@/lib/format";
import { today, todayIso } from "@/lib/today";
import { unwrap } from "./service-error";
import { insertRow, updateRow } from "./write";

type Enums = Database["public"]["Enums"];

const bookingLabel: Record<Enums["booking_type"], BookingType> = { soft: "Soft", hard: "Hard" };
const bookingValue: Record<BookingType, Enums["booking_type"]> = { Soft: "soft", Hard: "hard" };
const roleLabel: Record<Enums["project_role"], TeamMember["role"]> = {
  project_manager: "Project Manager",
  project_officer: "Project Officer",
  programme_manager: "Programme Manager",
  team_member: "Team Member",
  sponsor: "Sponsor",
};
const leaveLabel: Record<Enums["leave_type"], LeaveEntry["type"]> = {
  annual_leave: "Annual leave",
  training: "Training",
  other: "Other",
};

/** Teams are an organisation list (lookup), not a fixed set. */
export type PersonView = Omit<Person, "team"> & { team: string; email: string | null };
export type GenericView = Omit<GenericResource, "team"> & { team: string };
export type AssignmentView = ResourceAssignment & { updatedAt: string };
export interface TeamMemberView extends TeamMember {
  id: string;
  projectId: string;
}
export interface ResourceProject {
  id: string;
  code: string;
  name: string;
  programmeId: string | null;
  programmeName: string;
  state: string;
  start: string;
  finish: string;
  averagePercentComplete: number;
}

export interface ResourceData {
  people: PersonView[];
  generics: GenericView[];
  assignments: AssignmentView[];
  team: TeamMemberView[];
  projects: ResourceProject[];
  programmes: { id: string; name: string }[];
  /** Task title and % complete for bookings linked to a task. */
  tasks: Map<string, { title: string; percentComplete: number }>;
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export async function loadResources(orgId: string): Promise<ResourceData> {
  const [resources, assignments, team, projects, programmes, lookups, stats] = await Promise.all([
    supabase
      .from("resources")
      .select(
        `id, name, email, job_title, team_id, line_manager_id, contracted_hours_per_week, fte,
         bau_percentage, is_placeholder, placeholder_role, needs_staffing, is_active, is_bookable,
         resource_skills(skill_id, level),
         resource_leave(id, start_date, finish_date, leave_type)`,
      )
      .eq("organisation_id", orgId)
      .order("name"),
    supabase
      .from("resource_assignments")
      .select(
        "id, resource_id, project_id, work_item_id, role, start_date, finish_date, hours_per_week, booking_type, updated_at",
      )
      .eq("organisation_id", orgId)
      .order("start_date"),
    supabase
      .from("project_team_members")
      .select("id, project_id, resource_id, role, start_date, finish_date, allocated_effort_hours")
      .eq("organisation_id", orgId),
    supabase
      .from("projects")
      .select("id, code, name, programme_id, state, start_date, finish_date")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("name"),
    supabase.from("programmes").select("id, name").eq("organisation_id", orgId).order("name"),
    supabase
      .from("lookup_values")
      .select("id, label")
      .eq("organisation_id", orgId)
      .in("list_key", ["team", "skill"]),
    supabase
      .from("v_project_task_stats")
      .select("project_id, avg_percent_complete")
      .eq("organisation_id", orgId),
  ]);
  const label = new Map(
    unwrap(lookups, "Loading teams and skills").map((row) => [row.id, row.label]),
  );
  const resourceRows = unwrap(resources, "Loading people");
  const nameById = new Map(resourceRows.map((row) => [row.id, row.name]));
  const skillsOf = (rows: { skill_id: string; level: number }[] | null): ResourceSkill[] =>
    (rows ?? []).map((skill) => ({
      name: label.get(skill.skill_id) ?? "Skill",
      level: Math.min(3, Math.max(1, skill.level)) as ResourceSkill["level"],
    }));
  const people: PersonView[] = resourceRows
    .filter((row) => !row.is_placeholder && row.is_active && row.is_bookable)
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      jobTitle: row.job_title ?? "",
      initials: initials(row.name),
      team: (row.team_id && label.get(row.team_id)) || "Unassigned",
      lineManager: (row.line_manager_id && nameById.get(row.line_manager_id)) || "",
      contractedHoursPerWeek: Number(row.contracted_hours_per_week ?? 37.5),
      fte: Number(row.fte ?? 1),
      bauPercentage: Number(row.bau_percentage ?? 0),
      skills: skillsOf(row.resource_skills),
      leave: (row.resource_leave ?? []).map((entry) => ({
        id: entry.id,
        start: fromIsoDate(entry.start_date),
        end: fromIsoDate(entry.finish_date),
        type: leaveLabel[entry.leave_type],
      })),
    }));
  const generics: GenericView[] = resourceRows
    .filter((row) => row.is_placeholder && row.is_active)
    .map((row) => ({
      id: row.id,
      name: row.name,
      role: row.placeholder_role ?? row.job_title ?? "Unfilled role",
      team: (row.team_id && label.get(row.team_id)) || "Unassigned",
      skills: skillsOf(row.resource_skills),
      needsStaffing: row.needs_staffing,
    }));
  const placeholder = new Set(generics.map((item) => item.id));
  const assignmentRows = unwrap(assignments, "Loading bookings");
  const taskIds = assignmentRows
    .map((row) => row.work_item_id)
    .filter((id): id is string => Boolean(id));
  const taskRows = taskIds.length
    ? unwrap(
        await supabase
          .from("v_work_items")
          .select("id, title, percent_complete, status")
          .in("id", taskIds),
        "Loading booked tasks",
      )
    : [];
  const progress = new Map(
    unwrap(stats, "Loading task progress").map((row) => [
      row.project_id,
      row.avg_percent_complete ?? 0,
    ]),
  );
  const programmeRows = unwrap(programmes, "Loading programmes");
  const programmeName = new Map(programmeRows.map((row) => [row.id, row.name]));
  const startOfWindow = todayIso();
  return {
    people,
    generics,
    assignments: assignmentRows.map((row) => ({
      id: row.id,
      resourceType: placeholder.has(row.resource_id) ? "Generic" : "Person",
      resourceId: row.resource_id,
      projectId: row.project_id,
      ...(row.work_item_id && { taskId: row.work_item_id }),
      role: row.role ?? "",
      start: fromIsoDate(row.start_date),
      end: fromIsoDate(row.finish_date),
      hoursPerWeek: Number(row.hours_per_week),
      bookingType: bookingLabel[row.booking_type],
      updatedAt: row.updated_at,
    })),
    team: unwrap(team, "Loading project teams").map((row) => ({
      id: row.id,
      projectId: row.project_id,
      personId: row.resource_id,
      role: roleLabel[row.role],
      start: fromIsoDate(row.start_date ?? startOfWindow),
      finish: fromIsoDate(row.finish_date ?? row.start_date ?? startOfWindow),
      allocatedEffortHours: Number(row.allocated_effort_hours),
    })),
    projects: unwrap(projects, "Loading projects").map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      programmeId: row.programme_id,
      programmeName: (row.programme_id && programmeName.get(row.programme_id)) || "Unassigned",
      state: row.state,
      start: fromIsoDate(row.start_date ?? startOfWindow),
      finish: fromIsoDate(row.finish_date ?? row.start_date ?? startOfWindow),
      averagePercentComplete: progress.get(row.id) ?? 0,
    })),
    programmes: programmeRows,
    tasks: new Map(
      taskRows.map((row) => [
        row.id ?? "",
        {
          title: row.title ?? "",
          percentComplete: row.percent_complete ?? (row.status === "done" ? 100 : 0),
        },
      ]),
    ),
  };
}

// ---- Pure calculations (dates are DD/MM/YYYY, as the planning grid shows them) ----------

const DAY = 86_400_000;
export const parseDay = (value: string) => {
  const [d = 1, m = 1, y = 1970] = value.split("/").map(Number);
  return new Date(y, m - 1, d);
};
const formatDay = (date: Date) =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
const daysInclusive = (start: string, finish: string) =>
  Math.max(1, Math.round((parseDay(finish).getTime() - parseDay(start).getTime()) / DAY) + 1);

/** Week-commencing dates from this week's Monday (or a given DD/MM/YYYY start). */
export function weekStarts(count = 26, start?: string) {
  const first = start ? parseDay(start) : today();
  if (!start) first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: count }, (_, index) =>
    formatDay(new Date(first.getTime() + index * 7 * DAY)),
  );
}

/** Hours available for project work in a week: contracted less BAU, less leave days. */
export function personCapacity(person: PersonView, weekStart: string) {
  const base = person.contractedHoursPerWeek * (1 - person.bauPercentage / 100);
  const start = parseDay(weekStart).getTime();
  const end = start + 6 * DAY;
  const leaveDays = person.leave.reduce((sum, entry) => {
    const from = Math.max(start, parseDay(entry.start).getTime());
    const to = Math.min(end, parseDay(entry.end).getTime());
    return sum + (to >= from ? Math.floor((to - from) / DAY) + 1 : 0);
  }, 0);
  return Math.max(0, base - (base * Math.min(5, leaveDays)) / 5);
}

const activeIn = (item: { start: string; end: string }, week: Date) =>
  parseDay(item.start) <= week && parseDay(item.end) >= week;

export function weeklyAllocation(personId: string, weekStart: string, items: AssignmentView[]) {
  const week = parseDay(weekStart);
  return items
    .filter(
      (item) =>
        item.resourceType === "Person" && item.resourceId === personId && activeIn(item, week),
    )
    .reduce((sum, item) => sum + item.hoursPerWeek, 0);
}

export interface ResolvedAssignment extends AssignmentView {
  resourceName: string;
  team: string;
  projectName: string;
  programmeId: string | null;
  programmeName: string;
  taskName?: string;
  progress: number;
  effort: number;
  effortCompleted: number;
  effortRemaining: number;
}

export function resolveAssignments(
  data: ResourceData,
  items = data.assignments,
): ResolvedAssignment[] {
  const people = new Map(data.people.map((item) => [item.id, item]));
  const generics = new Map(data.generics.map((item) => [item.id, item]));
  const projects = new Map(data.projects.map((item) => [item.id, item]));
  return items.flatMap((item) => {
    const person = people.get(item.resourceId);
    const generic = generics.get(item.resourceId);
    const project = projects.get(item.projectId);
    if (!project || (!person && !generic)) return [];
    const task = item.taskId ? data.tasks.get(item.taskId) : undefined;
    const progress = task?.percentComplete ?? project.averagePercentComplete;
    const effort = Math.round((item.hoursPerWeek * daysInclusive(item.start, item.end)) / 7);
    return [
      {
        ...item,
        resourceName: person?.name ?? generic?.name ?? "Unassigned",
        team: person?.team ?? generic?.team ?? "Unassigned",
        projectName: project.name,
        programmeId: project.programmeId,
        programmeName: project.programmeName,
        ...(task && { taskName: task.title }),
        progress,
        effort,
        effortCompleted: Math.round((effort * progress) / 100),
        effortRemaining: Math.round(effort * (1 - progress / 100)),
      },
    ];
  });
}

export function resourceDashboard(data: ResourceData) {
  const weeks = weekStarts();
  const named = resolveAssignments(data).filter((item) => item.resourceType === "Person");
  const people = data.people.map((person) => {
    const allocations = weeks.map((week) => weeklyAllocation(person.id, week, data.assignments));
    const capacities = weeks.map((week) => personCapacity(person, week));
    const allocated = allocations.reduce((sum, value) => sum + value, 0);
    const capacity = capacities.reduce((sum, value) => sum + value, 0);
    const mine = named.filter((item) => item.resourceId === person.id);
    return {
      person,
      allocated,
      capacity,
      utilisation: capacity ? Math.round((allocated / capacity) * 100) : 0,
      peak: Math.max(
        0,
        ...allocations.map((value, index) =>
          capacities[index] ? (value / (capacities[index] ?? 1)) * 100 : 0,
        ),
      ),
      effortCompleted: mine.reduce((sum, item) => sum + item.effortCompleted, 0),
      effortRemaining: mine.reduce((sum, item) => sum + item.effortRemaining, 0),
    };
  });
  const totalCapacity = people.reduce((sum, item) => sum + item.capacity, 0);
  const allocated = people.reduce((sum, item) => sum + item.allocated, 0);
  return {
    people,
    totalCapacity,
    allocated,
    utilisation: totalCapacity ? Math.round((allocated / totalCapacity) * 100) : 0,
    overAllocated: people.filter((item) => item.peak > 100).length,
    unstaffed: data.generics.filter((item) => item.needsStaffing).length,
  };
}

export function teamUtilisation(data: ResourceData) {
  const dashboard = resourceDashboard(data);
  return Array.from(new Set(data.people.map((person) => person.team))).map((team) => {
    const rows = dashboard.people.filter((item) => item.person.team === team);
    const capacity = rows.reduce((sum, item) => sum + item.capacity, 0);
    const allocated = rows.reduce((sum, item) => sum + item.allocated, 0);
    return {
      team,
      capacity,
      allocated,
      utilisation: capacity ? Math.round((allocated / capacity) * 100) : 0,
    };
  });
}

/** People with the skill, ranked by the least free capacity they have in any week of the project. */
export function projectCandidates(data: ResourceData, projectId: string, skill: string) {
  const project = data.projects.find((item) => item.id === projectId);
  if (!project) return [];
  const weeks = weekStarts(
    Math.max(1, Math.ceil(daysInclusive(project.start, project.finish) / 7)),
    project.start,
  );
  return data.people
    .filter((person) => !skill || person.skills.some((item) => item.name === skill))
    .map((person) => {
      const free = Math.max(
        0,
        Math.min(
          ...weeks.map(
            (week) =>
              personCapacity(person, week) - weeklyAllocation(person.id, week, data.assignments),
          ),
        ),
      );
      return { person, freeCapacity: Math.round(free * 10) / 10 };
    })
    .sort((a, b) => b.freeCapacity - a.freeCapacity);
}

export function roleDemand(data: ResourceData, weeks = weekStarts(), items = data.assignments) {
  const roles = Array.from(
    new Set([
      ...data.generics.map((item) => item.role),
      ...data.people.flatMap((person) => person.skills.map((skill) => skill.name)),
    ]),
  );
  return roles.map((role) => ({
    role,
    weeks: weeks.map((week) => {
      const at = parseDay(week);
      const demand = items
        .filter((item) => item.role === role && activeIn(item, at))
        .reduce((sum, item) => sum + item.hoursPerWeek, 0);
      const capacity = data.people
        .filter((person) => person.skills.some((skill) => skill.name === role))
        .reduce((sum, person) => sum + personCapacity(person, week), 0);
      return { week, demand, capacity };
    }),
  }));
}

export interface ProjectTeamMember extends TeamMemberView {
  person: PersonView;
  completedHours: number;
  remainingHours: number;
  weeklyHours: number;
}

/** The project's governance roles with effort burned in line with task progress. */
export function projectTeam(data: ResourceData, projectId: string): ProjectTeamMember[] {
  const project = data.projects.find((item) => item.id === projectId);
  const progress = (project?.averagePercentComplete ?? 0) / 100;
  const people = new Map(data.people.map((item) => [item.id, item]));
  return data.team
    .filter((member) => member.projectId === projectId)
    .flatMap((member) => {
      const person = people.get(member.personId);
      if (!person) return [];
      const completedHours = Math.round(member.allocatedEffortHours * progress);
      return [
        {
          ...member,
          person,
          completedHours,
          remainingHours: member.allocatedEffortHours - completedHours,
          weeklyHours:
            member.allocatedEffortHours /
            Math.max(1, daysInclusive(member.start, member.finish) / 7),
        },
      ];
    });
}

// ---- Writes -------------------------------------------------------------------------------

/** Move a booking to another person and/or week (allocation grid drag and drop). */
export async function moveAssignment(
  item: AssignmentView,
  resourceId: string,
  start: string,
  end: string,
) {
  return updateRow(
    "resource_assignments",
    item.id,
    {
      resource_id: resourceId,
      start_date: toIsoDate(start) ?? todayIso(),
      finish_date: toIsoDate(end) ?? todayIso(),
    },
    { context: "Moving the booking", lastSeen: item.updatedAt },
  );
}

export async function bookResource(input: {
  projectId: string;
  resourceId: string;
  role: string;
  start: string;
  end: string;
  hoursPerWeek: number;
  bookingType: BookingType;
}) {
  return insertRow(
    "resource_assignments",
    {
      project_id: input.projectId,
      resource_id: input.resourceId,
      role: input.role || null,
      start_date: toIsoDate(input.start) ?? todayIso(),
      finish_date: toIsoDate(input.end) ?? todayIso(),
      hours_per_week: input.hoursPerWeek,
      booking_type: bookingValue[input.bookingType],
    },
    "Booking the resource",
  );
}
