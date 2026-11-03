// Hooks over src/services/reports.ts (report builder).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrgId } from "@/components/auth/organisation-provider";
import type { BlockInstance } from "@/features/reports/blocks/types";
import { qk } from "@/services/query-keys";
import {
  copyTemplate,
  createReport,
  createTemplate,
  fetchBlockData,
  fetchReportContext,
  fetchReportPermissions,
  fetchScopeMetrics,
  getReport,
  getTemplate,
  listForumReporting,
  listForumScopeItems,
  listInclusions,
  listNarratives,
  listRatingSchemes,
  listReportEvents,
  listReports,
  listRiskMatrices,
  listTemplates,
  refreshSelection,
  reorderInclusions,
  saveNarrative,
  saveReportAsTemplate,
  setForumMemberRole,
  setForumScopeItems,
  setInclusion,
  setTemplateArchived,
  updateForumReporting,
  updateTemplate,
  type CreateReportInput,
  type ForumReportingPatch,
  type ReportInput,
  type ScopeItem,
  type TemplateInput,
  type TemplateRecord,
} from "@/services/reports";

/** A stable cache key for a report input (saved report or preview scope). */
export const inputKey = (input: ReportInput) => JSON.stringify(input);

export function useReports() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.reports.list(orgId), queryFn: () => listReports(orgId) });
}

export function useReport(id: string | null | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.reports.detail(orgId, id ?? ""),
    queryFn: () => getReport(id!),
    enabled: !!id,
  });
}

export function useReportPermissions(reportId: string | null | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.reports.detail(orgId, reportId ?? ""), "permissions"],
    queryFn: () => fetchReportPermissions(reportId!),
    enabled: !!reportId,
  });
}

export function useReportContext(input: ReportInput | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.reports.live(orgId, input ? inputKey(input) : ""), "context"],
    queryFn: () => fetchReportContext(input!),
    enabled: !!input,
    staleTime: 30_000,
  });
}

/** Live block data (drafts and previews). Cached by (block key, config, input, entity). */
export function useBlockData(
  input: ReportInput | null,
  block: BlockInstance,
  entityId: string | null,
  enabled = true,
) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [
      ...qk.reports.live(orgId, input ? inputKey(input) : ""),
      "block",
      block.blockKey,
      block.id,
      JSON.stringify(block.config ?? {}),
      entityId ?? "",
    ],
    queryFn: () => fetchBlockData(input!, block, entityId),
    enabled: !!input && enabled,
    staleTime: 30_000,
  });
}

export function useScopeMetrics(input: ReportInput | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.reports.live(orgId, input ? inputKey(input) : ""), "metrics"],
    queryFn: () => fetchScopeMetrics(input!),
    enabled: !!input,
    staleTime: 30_000,
  });
}

export function useInclusions(reportId: string | null | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.reports.inclusions(orgId, reportId ?? ""),
    queryFn: () => listInclusions(reportId!),
    enabled: !!reportId,
  });
}

export function useNarratives(reportId: string | null | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.reports.narratives(orgId, reportId ?? ""),
    queryFn: () => listNarratives(reportId!),
    enabled: !!reportId,
  });
}

export function useReportEvents(reportId: string | null | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: qk.reports.events(orgId, reportId ?? ""),
    queryFn: () => listReportEvents(reportId!),
    enabled: !!reportId,
  });
}

export function useTemplates() {
  const orgId = useOrgId();
  return useQuery({ queryKey: qk.reports.templates(orgId), queryFn: () => listTemplates(orgId) });
}

export function useTemplate(id: string | null | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.reports.templates(orgId), id ?? ""],
    queryFn: () => getTemplate(id!),
    enabled: !!id,
  });
}

export function useRatingSchemes() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.reports.config(orgId), "schemes"],
    queryFn: () => listRatingSchemes(orgId),
    staleTime: 10 * 60_000,
  });
}

export function useRiskMatrices() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.reports.config(orgId), "matrices"],
    queryFn: () => listRiskMatrices(orgId),
    staleTime: 10 * 60_000,
  });
}

export function useForumReporting() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.forums(orgId), "reporting"],
    queryFn: () => listForumReporting(orgId),
  });
}

export function useForumScopeItems(forumId: string | null | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [...qk.forums(orgId), "scope-items"],
    queryFn: () => listForumScopeItems(orgId),
    select: (rows) => rows.filter((row) => row.forum_id === forumId),
    enabled: !!forumId,
  });
}

// ------------------------------------------------------------------ mutations
export function useReportMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const invalidateReport = (reportId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.reports.detail(orgId, reportId) }),
      queryClient.invalidateQueries({ queryKey: qk.reports.inclusions(orgId, reportId) }),
      queryClient.invalidateQueries({ queryKey: qk.reports.events(orgId, reportId) }),
      queryClient.invalidateQueries({
        queryKey: qk.reports.live(orgId, inputKey({ report_id: reportId })),
      }),
      queryClient.invalidateQueries({ queryKey: qk.reports.list(orgId) }),
    ]);
  return {
    invalidateReport,
    create: useMutation({
      mutationFn: (input: CreateReportInput) => createReport(input),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.reports.list(orgId) }),
    }),
    refreshSelection: useMutation({
      mutationFn: (reportId: string) => refreshSelection(reportId),
      onSuccess: (_d, reportId) => invalidateReport(reportId),
    }),
    setInclusion: useMutation({
      mutationFn: (vars: {
        reportId: string;
        entityId: string;
        mode: "pinned" | "excluded" | null;
      }) => setInclusion(vars.reportId, vars.entityId, vars.mode),
      onSuccess: (_d, vars) => invalidateReport(vars.reportId),
    }),
    reorder: useMutation({
      mutationFn: (vars: { reportId: string; entityIds: string[] }) =>
        reorderInclusions(vars.reportId, vars.entityIds),
      onSuccess: (_d, vars) => invalidateReport(vars.reportId),
    }),
    saveNarrative: useMutation({
      mutationFn: saveNarrative,
      onSuccess: (_d, vars) =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.reports.narratives(orgId, vars.reportId) }),
          queryClient.invalidateQueries({
            queryKey: qk.reports.live(orgId, inputKey({ report_id: vars.reportId })),
          }),
        ]),
    }),
    saveAsTemplate: useMutation({
      mutationFn: (vars: { reportId: string; name: string }) =>
        saveReportAsTemplate(vars.reportId, vars.name),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.reports.templates(orgId) }),
    }),
  };
}

export function useTemplateMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.reports.templates(orgId) });
  return {
    create: useMutation({
      mutationFn: (input: TemplateInput) => createTemplate(orgId, input),
      onSuccess: invalidate,
    }),
    copy: useMutation({
      mutationFn: (vars: { template: TemplateRecord; name?: string }) =>
        copyTemplate(orgId, vars.template, vars.name),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (vars: { id: string; input: Partial<TemplateInput>; lastSeen: string | null }) =>
        updateTemplate(vars.id, vars.input, vars.lastSeen),
      onSuccess: invalidate,
    }),
    archive: useMutation({
      mutationFn: (vars: { id: string; archived: boolean; lastSeen: string | null }) =>
        setTemplateArchived(vars.id, vars.archived, vars.lastSeen),
      onSuccess: invalidate,
    }),
  };
}

export function useForumReportingMutations() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.forums(orgId) });
  return {
    update: useMutation({
      mutationFn: (vars: {
        forumId: string;
        patch: ForumReportingPatch;
        lastSeen: string | null;
      }) => updateForumReporting(vars.forumId, vars.patch, vars.lastSeen),
      onSuccess: invalidate,
    }),
    setRole: useMutation({
      mutationFn: (vars: { forumId: string; resourceId: string; role: string }) =>
        setForumMemberRole(vars.forumId, vars.resourceId, vars.role),
      onSuccess: invalidate,
    }),
    setScopeItems: useMutation({
      mutationFn: (vars: { forumId: string; items: ScopeItem[] }) =>
        setForumScopeItems(vars.forumId, vars.items),
      onSuccess: invalidate,
    }),
  };
}
