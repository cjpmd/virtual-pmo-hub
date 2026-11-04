// Committee packs on Supabase (committee_packs). Issuing a pack stores what the forum was
// shown: the sections and the collection and project facts at that moment. Issued packs are
// immutable and never deleted; the database records when and by whom each was issued.
//
// From version 2 the snapshot also holds the Benefits and Decisions pages as shown, so an issued
// pack exports exactly what the forum saw. Earlier packs have only the project facts.
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { addDaysIso } from "@/lib/today";
import type { BenefitsData } from "./benefits";
import { getBenefitsByObjective, getMeasurementSchedule, getValueMetrics } from "./benefits-value";
import { madeSince, type ResolvedDecision } from "./decisions";
import { ServiceError, unwrap, unwrapMaybe } from "./service-error";
import { insertRow } from "./write";

/** The Benefits realisation page, as shown. */
export interface PackBenefitsSection {
  metrics: {
    planned: number;
    realised: number;
    percent: number;
    cashReleasingRealised: number;
    atRisk: number;
  };
  objectives: { id: string; name: string; planned: number; realised: number }[];
  behind: { id: string; reference: string; title: string; percent: number; realised: number }[];
  overdue: {
    id: string;
    reference: string;
    measureName: string;
    daysOverdue: number;
    owner: string;
  }[];
}

/** The Decisions page, as shown. */
export interface PackDecisionsSection {
  required: {
    id: string;
    reference: string;
    title: string;
    neededBy: string;
    overdue: boolean;
    scopeName: string;
    forum: string;
    decisionMaker: string;
    context: string;
    options: string[];
  }[];
  made: {
    id: string;
    reference: string;
    title: string;
    decisionDate: string;
    forum: string;
    decisionMaker: string;
    chosenOption: string;
    impactSummary: string;
  }[];
}

export interface CommitteePackContent {
  /** 2: benefits and decisions are stored. Absent on packs issued before that. */
  version?: 2;
  collection: { id: string; name: string };
  sections: string[];
  pageCount: number;
  coverText: string;
  projects: unknown[];
  benefits?: PackBenefitsSection;
  decisions?: PackDecisionsSection;
}

const SECTION_TYPES = {
  Cover: "cover",
  "Portfolio summary": "summary",
  Milestones: "milestones",
  Exceptions: "exceptions",
  "Benefits realisation": "benefits",
  Decisions: "decisions",
} as const;

export interface PackPage<P extends { id: string; name: string }> {
  id: string;
  label: string;
  type: (typeof SECTION_TYPES)[keyof typeof SECTION_TYPES] | "project";
  project?: P;
}

function sectionPage<P extends { id: string; name: string }>(label: string): PackPage<P> | null {
  const type = SECTION_TYPES[label as keyof typeof SECTION_TYPES];
  return type ? { id: type, label, type } : null;
}

/**
 * A draft pack's pages in the template's section order. "Project highlights" adds one page per
 * project after the sections; unknown section names are skipped.
 */
export function packPages<P extends { id: string; name: string }>(
  sectionOrder: string[],
  projects: P[],
): PackPage<P>[] {
  const sections = sectionOrder.flatMap((label) => {
    const page = sectionPage<P>(label);
    return page ? [page] : [];
  });
  const highlights = sectionOrder.includes("Project highlights")
    ? projects.map((project) => ({
        id: project.id,
        label: project.name,
        type: "project" as const,
        project,
      }))
    : [];
  return [...sections, ...highlights];
}

/**
 * An issued pack's pages, from the page labels it stored: section names, then project names for
 * the highlight pages (matched in order, so two projects with one name both keep their page).
 */
export function issuedPackPages<P extends { id: string; name: string }>(
  labels: string[],
  projects: P[],
): PackPage<P>[] {
  const unused = [...projects];
  return labels.flatMap((label): PackPage<P>[] => {
    const page = sectionPage<P>(label);
    if (page) return [page];
    const index = unused.findIndex((project) => project.name === label);
    if (index < 0) return [];
    const project = unused.splice(index, 1)[0]!;
    return [{ id: project.id, label, type: "project", project }];
  });
}

/** The Benefits page for benefits enabled by any of the projects. */
export function buildBenefitsSection(
  data: BenefitsData,
  projectIds: string[],
): PackBenefitsSection {
  const ids = new Set(projectIds);
  const benefits = data.benefits.filter((benefit) =>
    benefit.enablingProjects.some((link) => ids.has(link.projectId)),
  );
  const metrics = getValueMetrics(benefits);
  return {
    metrics: {
      planned: metrics.planned,
      realised: metrics.realised,
      percent: metrics.percent,
      cashReleasingRealised: metrics.cashReleasingRealised,
      atRisk: metrics.atRisk,
    },
    objectives: getBenefitsByObjective(data, benefits)
      .filter((row) => row.planned > 0)
      .slice(0, 6)
      .map(({ id, name, planned, realised }) => ({ id, name, planned, realised })),
    behind: benefits
      .filter((benefit) => benefit.realisation.behindProfile)
      .slice(0, 5)
      .map((benefit) => ({
        id: benefit.id,
        reference: benefit.reference,
        title: benefit.title,
        percent: benefit.realisation.percent,
        realised: benefit.realisation.realised,
      })),
    overdue: getMeasurementSchedule(benefits)
      .filter((item) => item.state === "Overdue")
      .slice(0, 5)
      .map((item) => ({
        id: item.measure.id,
        reference: item.benefit.reference,
        measureName: item.measure.name,
        daysOverdue: item.daysOverdue,
        owner: item.benefit.owner,
      })),
  };
}

/**
 * The Decisions page: decisions on the projects (or not tied to a project) that are pending,
 * soonest needed first, and those made in the last 31 days.
 */
export function buildDecisionsSection(
  all: ResolvedDecision[],
  projectCodes: string[],
): PackDecisionsSection {
  const codes = new Set(projectCodes);
  const decisions = all.filter(
    (decision) => !decision.projectCode || codes.has(decision.projectCode),
  );
  const since = addDaysIso(-31);
  return {
    required: decisions
      .filter((decision) => decision.status === "Pending")
      .sort((a, b) => a.daysToNeededBy - b.daysToNeededBy)
      .map((decision) => ({
        id: decision.id,
        reference: decision.reference,
        title: decision.title,
        neededBy: decision.neededBy,
        overdue: decision.overdue,
        scopeName: decision.scopeName,
        forum: decision.forum,
        decisionMaker: decision.decisionMaker,
        context: decision.context,
        options: decision.options.map((option) => option.title),
      })),
    made: decisions
      .filter((decision) => madeSince(decision, since))
      .map((decision) => ({
        id: decision.id,
        reference: decision.reference,
        title: decision.title,
        decisionDate: decision.decisionDate ?? "",
        forum: decision.forum,
        decisionMaker: decision.decisionMaker,
        chosenOption: decision.chosenOption,
        impactSummary: decision.impactSummary,
      })),
  };
}

export interface IssuedCommitteePack {
  id: string;
  title: string;
  meetingDate: string;
  issuedAt: string | null;
  content: CommitteePackContent;
}

/** One issued pack with its stored snapshot, for viewing and export. */
export async function getCommitteePack(id: string): Promise<IssuedCommitteePack> {
  const row = unwrapMaybe(
    await supabase
      .from("committee_packs")
      .select("id, title, meeting_date, issued_at, content")
      .eq("id", id)
      .maybeSingle(),
    "Loading the committee pack",
  );
  if (!row) throw new ServiceError("not_found", "This pack no longer exists or isn't visible.");
  return {
    id: row.id,
    title: row.title,
    meetingDate: row.meeting_date,
    issuedAt: row.issued_at,
    content: row.content as unknown as CommitteePackContent,
  };
}

export interface CommitteePackRecord {
  id: string;
  collectionId: string | null;
  title: string;
  meetingDate: string;
  issuedAt: string | null;
  issuedBy: string | null;
  pageCount: number | null;
}

export async function listCommitteePacks(orgId: string): Promise<CommitteePackRecord[]> {
  const rows = unwrap(
    await supabase
      .from("committee_packs")
      .select(
        "id, collection_id, title, meeting_date, issued_at, issued_by, page_count:content->pageCount",
      )
      .eq("organisation_id", orgId)
      .order("meeting_date", { ascending: false })
      .order("created_at", { ascending: false }),
    "Loading committee packs",
  );
  const issuerIds = [...new Set(rows.flatMap((row) => (row.issued_by ? [row.issued_by] : [])))];
  const names = new Map<string, string>();
  if (issuerIds.length) {
    const profiles = unwrap(
      await supabase.from("profiles").select("id, display_name").in("id", issuerIds),
      "Loading who issued the packs",
    );
    for (const profile of profiles) names.set(profile.id, profile.display_name);
  }
  return rows.map((row) => {
    return {
      id: row.id,
      collectionId: row.collection_id,
      title: row.title,
      meetingDate: row.meeting_date,
      issuedAt: row.issued_at,
      issuedBy: (row.issued_by && names.get(row.issued_by)) || null,
      pageCount: typeof row.page_count === "number" ? row.page_count : null,
    };
  });
}

/** Issue a pack for a governance collection. The pack can't be changed afterwards. */
export async function issueCommitteePack(input: {
  collectionId: string;
  title: string;
  meetingDate: string;
  content: CommitteePackContent;
}) {
  return insertRow(
    "committee_packs",
    {
      collection_id: input.collectionId,
      title: input.title.trim(),
      meeting_date: input.meetingDate,
      content: JSON.parse(JSON.stringify(input.content)) as Json,
      // The database replaces this with its own clock and records who issued it.
      issued_at: new Date().toISOString(),
    },
    "Issuing the committee pack",
  );
}
