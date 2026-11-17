import { describe, expect, it } from "vitest";
import {
  parseDay,
  personCapacity,
  projectTeam,
  resolveAssignments,
  weekStarts,
  weeklyAllocation,
  type AssignmentView,
  type PersonView,
  type ResourceData,
} from "./resources";

const person = (extra: Partial<PersonView> = {}): PersonView => ({
  id: "p1",
  name: "Ada Lovelace",
  jobTitle: "Analyst",
  initials: "AL",
  team: "PMO",
  lineManager: "",
  contractedHoursPerWeek: 40,
  fte: 1,
  bauPercentage: 25,
  skills: [],
  leave: [],
  email: null,
  ...extra,
});
const booking = (extra: Partial<AssignmentView> = {}): AssignmentView => ({
  id: "a1",
  resourceType: "Person",
  resourceId: "p1",
  projectId: "proj",
  role: "Analyst",
  start: "02/11/2026",
  end: "29/11/2026",
  hoursPerWeek: 10,
  bookingType: "Hard",
  updatedAt: "t",
  ...extra,
});
const data = (extra: Partial<ResourceData> = {}): ResourceData => ({
  people: [person()],
  generics: [],
  assignments: [booking()],
  team: [],
  projects: [
    {
      id: "proj",
      code: "P1",
      name: "Project one",
      programmeId: null,
      programmeName: "",
      state: "Active",
      start: "01/11/2026",
      finish: "31/12/2026",
      averagePercentComplete: 50,
    },
  ],
  programmes: [],
  tasks: new Map(),
  ...extra,
});

describe("dates", () => {
  it("parses DD/MM/YYYY", () => {
    expect(parseDay("02/11/2026")).toEqual(new Date(2026, 10, 2));
  });
  it("lists week-commencing dates from a given start", () => {
    expect(weekStarts(3, "02/11/2026")).toEqual(["02/11/2026", "09/11/2026", "16/11/2026"]);
  });
});

describe("personCapacity", () => {
  it("is contracted hours less BAU", () => {
    expect(personCapacity(person(), "02/11/2026")).toBe(30);
  });
  it("drops a fifth per leave day, down to zero", () => {
    const leave = (start: string, end: string) => [
      { id: "l", start, end, type: "Annual leave" as const },
    ];
    expect(personCapacity(person({ leave: leave("03/11/2026", "04/11/2026") }), "02/11/2026")).toBe(
      18,
    );
    expect(personCapacity(person({ leave: leave("01/11/2026", "30/11/2026") }), "02/11/2026")).toBe(
      0,
    );
  });
});

describe("weeklyAllocation", () => {
  it("adds the person's bookings active that week", () => {
    const items = [
      booking(),
      booking({ id: "a2", hoursPerWeek: 5 }),
      booking({ id: "a3", start: "01/12/2026", end: "31/12/2026" }),
      booking({ id: "a4", resourceType: "Generic" }),
    ];
    expect(weeklyAllocation("p1", "09/11/2026", items)).toBe(15);
    expect(weeklyAllocation("p2", "09/11/2026", items)).toBe(0);
  });
});

describe("resolveAssignments", () => {
  it("names the booking and works out effort from the project's progress", () => {
    const [resolved] = resolveAssignments(data());
    expect(resolved).toMatchObject({
      resourceName: "Ada Lovelace",
      team: "PMO",
      projectName: "Project one",
      progress: 50,
      effort: 40,
      effortCompleted: 20,
      effortRemaining: 20,
    });
  });
  it("drops bookings for unknown people or projects", () => {
    expect(resolveAssignments(data({ people: [] }))).toEqual([]);
    expect(resolveAssignments(data({ projects: [] }))).toEqual([]);
  });
});

describe("projectTeam", () => {
  it("splits allocated effort by the project's progress", () => {
    const team = projectTeam(
      data({
        team: [
          {
            id: "t1",
            projectId: "proj",
            personId: "p1",
            role: "Team Member",
            start: "02/11/2026",
            finish: "29/11/2026",
            allocatedEffortHours: 100,
          },
        ],
      }),
      "proj",
    );
    expect(team).toHaveLength(1);
    expect(team[0]).toMatchObject({ completedHours: 50, remainingHours: 50, weeklyHours: 25 });
  });
});
