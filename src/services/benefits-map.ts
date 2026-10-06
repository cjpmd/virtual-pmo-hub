// The benefits map (projects → capabilities → outcomes → benefits → objectives), built from
// the data loaded by services/benefits.ts. Realised value and percent come from the view.
import type { BenefitMapNodeType } from "@/data/types";
import type { BenefitsData, BenefitView } from "@/services/benefits";

export interface MapNode {
  id: string;
  type: BenefitMapNodeType;
  title: string;
  subtitle: string;
  owner: string;
  programmeId?: string;
  projectId?: string;
  benefitId?: string;
  objectiveId?: string;
  disbenefit: boolean;
  value?: number;
  realised?: number;
  percent?: number;
  warnings: string[];
}
export interface MapLink {
  id: string;
  from: string;
  to: string;
  disbenefit: boolean;
}
export interface BenefitMapModel {
  nodes: MapNode[];
  links: MapLink[];
  columns: BenefitMapNodeType[];
}

export const mapColumns: BenefitMapNodeType[] = [
  "Project",
  "Capability",
  "Outcome",
  "Benefit",
  "Objective",
];

/** Validation badges shown on benefit nodes (Prompt H2). */
export function getBenefitMapWarnings(benefit: BenefitView): string[] {
  const warnings: string[] = [];
  if (!benefit.measures.length) warnings.push("No measure defined");
  if (!benefit.owner) warnings.push("No benefit owner");
  if (!benefit.enablingProjects.length) warnings.push("No enabling project");
  return warnings;
}

export interface MapFilter {
  programmeId?: string;
  objectiveId?: string;
  projectId?: string;
}

/** Builds the five-column network model: projects → capabilities → outcomes → benefits → objectives. */
export function buildBenefitMap(data: BenefitsData, filter: MapFilter = {}): BenefitMapModel {
  const allBenefits = data.benefits;
  const objectives = data.objectives;
  const { capabilities, outcomes } = data;
  const projectById = new Map(data.projects.map((project) => [project.id, project]));
  const getProject = (id: string) => projectById.get(id);
  const programmeName = new Map(data.programmes.map((programme) => [programme.id, programme.name]));
  const inProgramme = (programmeId?: string | null) =>
    !filter.programmeId || programmeId === filter.programmeId;
  const scopedCapabilities = capabilities.filter((item) => inProgramme(item.programmeId));
  const scopedOutcomes = outcomes.filter((item) => inProgramme(item.programmeId));

  // A benefit belongs on the map when an outcome in scope produces it, or when a project in scope enables it.
  const chainBenefitIds = new Set(scopedOutcomes.flatMap((item) => item.benefitIds));
  let benefitList = allBenefits.filter((benefit) => {
    if (chainBenefitIds.has(benefit.id)) return true;
    return benefit.enablingProjects.some((link) => {
      const project = getProject(link.projectId);
      return project ? inProgramme(project.programmeId) : false;
    });
  });
  if (filter.objectiveId)
    benefitList = benefitList.filter((item) =>
      item.strategicObjectiveIds.includes(filter.objectiveId ?? ""),
    );
  if (filter.projectId)
    benefitList = benefitList.filter((item) =>
      item.enablingProjects.some((link) => link.projectId === filter.projectId),
    );
  const keptBenefitIds = new Set(benefitList.map((item) => item.id));

  // Outcomes and capabilities follow the benefits that survived the filter.
  const narrowed = Boolean(filter.objectiveId || filter.projectId);
  const outcomeList = scopedOutcomes.filter((item) =>
    narrowed ? item.benefitIds.some((id) => keptBenefitIds.has(id)) : true,
  );
  const chainCapabilityIds = new Set(outcomeList.flatMap((item) => item.capabilityIds));
  const capabilityList = scopedCapabilities.filter((item) =>
    narrowed
      ? chainCapabilityIds.has(item.id) ||
        (filter.projectId ? item.projectIds.includes(filter.projectId) : false)
      : true,
  );

  // Projects come from the capabilities on the map plus any project that directly enables a kept benefit.
  const projectIds = Array.from(
    new Set(
      [
        ...capabilityList.flatMap((item) => item.projectIds),
        ...benefitList.flatMap((benefit) => benefit.enablingProjects.map((link) => link.projectId)),
      ].filter((id) => {
        if (filter.projectId) return id === filter.projectId;
        const project = getProject(id);
        return project ? inProgramme(project.programmeId) : false;
      }),
    ),
  );
  const objectiveIds = new Set(benefitList.flatMap((item) => item.strategicObjectiveIds));

  const nodes: MapNode[] = [];
  const links: MapLink[] = [];

  for (const projectId of projectIds) {
    const project = getProject(projectId);
    if (!project) continue;
    nodes.push({
      id: `project:${projectId}`,
      type: "Project",
      title: project.name,
      subtitle: programmeName.get(project.programmeId ?? "") ?? "Unassigned",
      owner: project.managerName,
      ...(project.programmeId ? { programmeId: project.programmeId } : {}),
      projectId,
      disbenefit: false,
      warnings: [],
    });
  }
  for (const capability of capabilityList) {
    nodes.push({
      id: `capability:${capability.id}`,
      type: "Capability",
      title: capability.title,
      subtitle: capability.description,
      owner: capability.owner,
      programmeId: capability.programmeId,
      disbenefit: false,
      warnings: capability.projectIds.length ? [] : ["No delivering project"],
    });
    for (const projectId of capability.projectIds)
      if (projectIds.includes(projectId))
        links.push({
          id: `l-${projectId}-${capability.id}`,
          from: `project:${projectId}`,
          to: `capability:${capability.id}`,
          disbenefit: false,
        });
  }
  for (const outcome of outcomeList) {
    const linkedBenefits = outcome.benefitIds.filter((id) => keptBenefitIds.has(id));
    nodes.push({
      id: `outcome:${outcome.id}`,
      type: "Outcome",
      title: outcome.title,
      subtitle: outcome.description,
      owner: outcome.owner,
      programmeId: outcome.programmeId,
      disbenefit: false,
      warnings: linkedBenefits.length ? [] : ["No benefit linked to this outcome"],
    });
    for (const capabilityId of outcome.capabilityIds)
      if (capabilityList.some((item) => item.id === capabilityId))
        links.push({
          id: `l-${capabilityId}-${outcome.id}`,
          from: `capability:${capabilityId}`,
          to: `outcome:${outcome.id}`,
          disbenefit: false,
        });
  }
  for (const benefit of benefitList) {
    const disbenefit = benefit.type === "Disbenefit";
    const producing = outcomeList.filter((outcome) => outcome.benefitIds.includes(benefit.id));
    const warnings = getBenefitMapWarnings(benefit);
    if (!producing.length) warnings.push("No capability or outcome mapped");
    nodes.push({
      id: `benefit:${benefit.id}`,
      type: "Benefit",
      title: benefit.title,
      subtitle: `${benefit.reference} · ${benefit.classification}`,
      owner: benefit.owner || "Unassigned",
      benefitId: benefit.id,
      disbenefit,
      value: benefit.plannedTotalValue,
      realised: benefit.realisation.realised,
      percent: benefit.realisation.percent,
      warnings,
    });
    for (const outcome of producing)
      links.push({
        id: `l-${outcome.id}-${benefit.id}`,
        from: `outcome:${outcome.id}`,
        to: `benefit:${benefit.id}`,
        disbenefit,
      });
    // Without an outcome in between, join the enabling project straight to the benefit so the gap is visible.
    if (!producing.length)
      for (const link of benefit.enablingProjects)
        if (projectIds.includes(link.projectId))
          links.push({
            id: `l-${link.projectId}-${benefit.id}`,
            from: `project:${link.projectId}`,
            to: `benefit:${benefit.id}`,
            disbenefit,
          });
    for (const objectiveId of benefit.strategicObjectiveIds)
      if (objectiveIds.has(objectiveId))
        links.push({
          id: `l-${benefit.id}-${objectiveId}`,
          from: `benefit:${benefit.id}`,
          to: `objective:${objectiveId}`,
          disbenefit,
        });
  }
  for (const objective of objectives) {
    const supporting = benefitList.filter(
      (item) => item.type === "Benefit" && item.strategicObjectiveIds.includes(objective.id),
    );
    // Objectives nothing supports are the point of the check, so keep them on the unfiltered map.
    if (!objectiveIds.has(objective.id) && (narrowed || (filter.programmeId && supporting.length)))
      continue;
    nodes.push({
      id: `objective:${objective.id}`,
      type: "Objective",
      title: objective.title,
      subtitle: objective.description,
      owner: objective.owner,
      objectiveId: objective.id,
      disbenefit: false,
      warnings: supporting.length ? [] : ["No supporting benefit"],
    });
  }
  return { nodes, links, columns: mapColumns };
}

export function getMapValidationSummary(model: BenefitMapModel) {
  const flagged = model.nodes.filter((node) => node.warnings.length);
  return {
    total: flagged.length,
    benefits: flagged.filter((node) => node.type === "Benefit").length,
    outcomes: flagged.filter((node) => node.type === "Outcome").length,
    objectives: flagged.filter((node) => node.type === "Objective").length,
    capabilities: flagged.filter((node) => node.type === "Capability").length,
  };
}
