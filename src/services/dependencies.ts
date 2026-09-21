import { dependencies } from "@/data/dependencies-data";
import type { Dependency, DependencyBoundary, DependencyEnd, DependencyType, Health, Milestone } from "@/data/types";
import { getProgramme, getProject } from "@/services/pmo";

const parseDate = (value: string) => { const [d = 1, m = 1, y = 1970] = value.split("/").map(Number); return new Date(y, m - 1, d); };
const today = parseDate("21/09/2026");
/** Working days between two dates, counting Monday to Friday only. */
export function workingDaysBetween(from: Date, to: Date) {
  const direction = to >= from ? 1 : -1;
  let count = 0;
  const cursor = new Date(from);
  while (direction > 0 ? cursor < to : cursor > to) {
    cursor.setDate(cursor.getDate() + direction);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += direction;
  }
  return count;
}

export const dependencyTypes: DependencyType[] = ["Sequencing", "Alignment", "Information", "Resource", "External"];
export const dependencyValidations: Dependency["validation"][] = ["Inferred", "Proposed", "Confirmed", "Closed", "Broken"];

export function getEndProgrammeId(end: DependencyEnd) {
  if (end.programmeId) return end.programmeId;
  if (end.projectId) return getProject(end.projectId)?.programmeId;
  return undefined;
}
export function describeEnd(end: DependencyEnd) {
  if (end.kind === "External") return end.externalName ?? "External party";
  if (end.kind === "Milestone" && end.projectId) {
    const project = getProject(end.projectId);
    const milestone = project?.milestones.find(item => item.id === end.milestoneId);
    return milestone ? `${project?.name ?? "Project"} · ${milestone.title}` : project?.name ?? "Project";
  }
  if (end.projectId) return getProject(end.projectId)?.name ?? "Project";
  if (end.programmeId) return getProgramme(end.programmeId)?.name ?? "Programme";
  return "Unknown";
}
export function getEndMilestone(end: DependencyEnd): Milestone | undefined {
  if (!end.milestoneId || !end.projectId) return undefined;
  return getProject(end.projectId)?.milestones.find(item => item.id === end.milestoneId);
}
const programmeManager = (programmeId?: string) => (programmeId ? getProgramme(programmeId)?.projectManager ?? getProgramme(programmeId)?.manager : undefined);

/** Boundary follows the programmes' assigned project managers (Prompt I1). */
export function getBoundary(dependency: Dependency): DependencyBoundary {
  if (dependency.giver.kind === "External" || dependency.receiver.kind === "External") return "Cross-portfolio";
  const giverProgramme = getEndProgrammeId(dependency.giver);
  const receiverProgramme = getEndProgrammeId(dependency.receiver);
  if (giverProgramme && giverProgramme === receiverProgramme) return "Within programme";
  const giverPm = programmeManager(giverProgramme), receiverPm = programmeManager(receiverProgramme);
  if (giverPm && receiverPm && giverPm !== receiverPm) return "Cross-PM";
  return "Cross-programme";
}

/** Sequencing dependencies with a giving milestone get their health from the forecast against required-by. */
export function getDependencyHealth(dependency: Dependency): Health {
  if (dependency.healthOverride) return dependency.healthOverride;
  if (dependency.validation === "Closed") return "On Track";
  if (dependency.validation === "Broken") return "Off Track";
  const milestone = getEndMilestone(dependency.giver);
  if (dependency.type === "Sequencing" && milestone) {
    if (milestone.actualDate) return "On Track";
    const forecast = parseDate(milestone.forecastDate), requiredBy = parseDate(dependency.requiredBy);
    if (forecast > requiredBy) return "Off Track";
    if (workingDaysBetween(forecast, requiredBy) <= 10) return "At Risk";
    return "On Track";
  }
  const requiredBy = parseDate(dependency.requiredBy);
  if (requiredBy < today) return "Off Track";
  if (!isConfirmed(dependency) && workingDaysBetween(today, requiredBy) <= 20) return "At Risk";
  return "On Track";
}
export function getHealthReason(dependency: Dependency) {
  const milestone = getEndMilestone(dependency.giver);
  if (dependency.validation === "Broken") return "The giving side has confirmed it cannot meet this dependency.";
  if (dependency.type === "Sequencing" && milestone && !milestone.actualDate) {
    const slip = workingDaysBetween(parseDate(dependency.requiredBy), parseDate(milestone.forecastDate));
    if (slip > 0) return `${milestone.title} is forecast ${slip} working days after the required-by date.`;
    if (-slip <= 10) return `${milestone.title} is forecast only ${-slip} working days before the required-by date.`;
    return `${milestone.title} is forecast ${-slip} working days before the required-by date.`;
  }
  if (parseDate(dependency.requiredBy) < today && dependency.validation !== "Closed") return "The required-by date has passed.";
  if (!isConfirmed(dependency)) return "Both owners must accept before this dependency is confirmed.";
  return "Forecast to be met before the required-by date.";
}

export const isConfirmed = (dependency: Dependency) => dependency.giverAccepted && dependency.receiverAccepted;
export function getAcceptanceState(dependency: Dependency) {
  if (dependency.validation === "Closed") return "Closed";
  if (isConfirmed(dependency)) return "Confirmed";
  if (!dependency.giverAccepted && !dependency.receiverAccepted) return "Awaiting both";
  return dependency.giverAccepted ? "Awaiting receiver" : "Awaiting giver";
}

export interface ResolvedDependency extends Dependency {
  giverLabel: string; receiverLabel: string; giverProgrammeId: string | undefined; receiverProgrammeId: string | undefined;
  giverProgrammeName: string; receiverProgrammeName: string; giverPm: string; receiverPm: string;
  boundary: DependencyBoundary; health: Health; healthReason: string; acceptance: string; daysToRequiredBy: number;
  giverMilestone: Milestone | undefined;
}
export function getDependencies(): ResolvedDependency[] {
  return dependencies.map(dependency => {
    const giverProgrammeId = getEndProgrammeId(dependency.giver), receiverProgrammeId = getEndProgrammeId(dependency.receiver);
    return {
      ...dependency,
      giverLabel: describeEnd(dependency.giver),
      receiverLabel: describeEnd(dependency.receiver),
      giverProgrammeId, receiverProgrammeId,
      giverProgrammeName: giverProgrammeId ? getProgramme(giverProgrammeId)?.name ?? "Unassigned" : dependency.giver.externalName ?? "External",
      receiverProgrammeName: receiverProgrammeId ? getProgramme(receiverProgrammeId)?.name ?? "Unassigned" : dependency.receiver.externalName ?? "External",
      giverPm: programmeManager(giverProgrammeId) ?? "External",
      receiverPm: programmeManager(receiverProgrammeId) ?? "External",
      boundary: getBoundary(dependency),
      health: getDependencyHealth(dependency),
      healthReason: getHealthReason(dependency),
      acceptance: getAcceptanceState(dependency),
      daysToRequiredBy: Math.round((parseDate(dependency.requiredBy).getTime() - today.getTime()) / 86400000),
      giverMilestone: getEndMilestone(dependency.giver),
    };
  });
}
export const getDependency = (id: string) => getDependencies().find(item => item.id === id);

export function getDependencyMetrics(items = getDependencies()) {
  return {
    total: items.length,
    crossPm: items.filter(item => item.boundary === "Cross-PM").length,
    awaiting: items.filter(item => item.acceptance.startsWith("Awaiting")).length,
    offTrack: items.filter(item => item.health === "Off Track").length,
    atRisk: items.filter(item => item.health === "At Risk").length,
    inferred: items.filter(item => item.validation === "Inferred").length,
    external: items.filter(item => item.type === "External" || item.giver.kind === "External" || item.receiver.kind === "External").length,
  };
}

/** Dependencies touching a project or programme, split into what it relies on and what relies on it. */
export function getDependenciesFor(scope: { projectId?: string; programmeId?: string }, items = getDependencies()) {
  const matches = (end: DependencyEnd) => (scope.projectId ? end.projectId === scope.projectId : false) || (scope.programmeId ? getEndProgrammeId(end) === scope.programmeId : false);
  return {
    weDependOn: items.filter(item => matches(item.receiver)),
    dependsOnUs: items.filter(item => matches(item.giver)),
  };
}

/** Agenda for the PM sync: cross-PM dependencies that need a conversation (Prompt I1). */
export function getDependencySyncAgenda(items = getDependencies()) {
  const crossPm = items.filter(item => item.boundary === "Cross-PM" || item.boundary === "Cross-portfolio");
  return {
    offTrack: crossPm.filter(item => item.health === "Off Track"),
    awaitingConfirmation: crossPm.filter(item => item.acceptance.startsWith("Awaiting")),
    dueSoon: crossPm.filter(item => item.daysToRequiredBy >= 0 && item.daysToRequiredBy <= 30),
  };
}

export const dependencyLineStyle = (type: DependencyType) => (type === "Sequencing" ? "solid" : type === "Alignment" ? "dashed" : type === "Information" ? "dotted" : type === "Resource" ? "dashed" : "solid");
export const dependencyStrokeDash = (type: DependencyType) => (type === "Sequencing" ? undefined : type === "Alignment" ? "8 5" : type === "Information" ? "2 4" : type === "Resource" ? "12 4" : "6 3");
export const healthStroke = (health: Health) => (health === "Off Track" ? "var(--health-bad)" : health === "At Risk" ? "var(--health-warn)" : health === "On Track" ? "var(--health-good)" : "var(--border)");
