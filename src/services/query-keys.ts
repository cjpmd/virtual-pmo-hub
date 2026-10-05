// TanStack Query keys for every Supabase-backed service, in one place.
//
// Shape: ["org", orgId, <entity>, ...detail]. Everything tenant-scoped sits under the
// organisation, so switching organisation or signing out can drop one subtree, and a
// write can invalidate exactly the lists and details it affects.
//   queryClient.invalidateQueries({ queryKey: qk.org(orgId) })            -> all org data
//   queryClient.invalidateQueries({ queryKey: qk.projects.all(orgId) })   -> project lists + details
export const qk = {
  me: () => ["me"] as const,
  memberships: (userId: string) => ["me", userId, "memberships"] as const,

  org: (orgId: string) => ["org", orgId] as const,

  portfolios: {
    all: (orgId: string) => ["org", orgId, "portfolios"] as const,
    list: (orgId: string) => ["org", orgId, "portfolios", "list"] as const,
    health: (orgId: string) => ["org", orgId, "portfolios", "health"] as const,
    overview: (orgId: string, portfolioId: string) =>
      ["org", orgId, "portfolios", "overview", portfolioId] as const,
  },
  programmes: {
    all: (orgId: string) => ["org", orgId, "programmes"] as const,
    list: (orgId: string) => ["org", orgId, "programmes", "list"] as const,
    detail: (orgId: string, programmeId: string) =>
      ["org", orgId, "programmes", "detail", programmeId] as const,
  },
  projects: {
    all: (orgId: string) => ["org", orgId, "projects"] as const,
    list: (orgId: string) => ["org", orgId, "projects", "list"] as const,
    detail: (orgId: string, code: string) => ["org", orgId, "projects", "detail", code] as const,
    milestones: (orgId: string, projectId: string) =>
      ["org", orgId, "projects", projectId, "milestones"] as const,
    raid: (orgId: string, projectId: string) =>
      ["org", orgId, "projects", projectId, "raid"] as const,
    forecastHistory: (orgId: string, projectId: string) =>
      ["org", orgId, "projects", projectId, "forecast-history"] as const,
    tasks: (orgId: string, projectId: string) =>
      ["org", orgId, "projects", projectId, "tasks"] as const,
    canEdit: (orgId: string, projectId: string) =>
      ["org", orgId, "projects", projectId, "can-edit"] as const,
  },
  benefits: {
    all: (orgId: string) => ["org", orgId, "benefits"] as const,
    list: (orgId: string) => ["org", orgId, "benefits", "list"] as const,
  },
  dependencies: (orgId: string) => ["org", orgId, "projects", "dependencies"] as const,
  roadmaps: (orgId: string) => ["org", orgId, "projects", "roadmaps"] as const,
  governance: (orgId: string) => ["org", orgId, "governance"] as const,
  lessons: (orgId: string) => ["org", orgId, "lessons"] as const,
  issuedTasks: (orgId: string) => ["org", orgId, "projects", "issued-tasks"] as const,
  orgRaid: (orgId: string) => ["org", orgId, "projects", "org-raid"] as const,
  requests: (orgId: string) => ["org", orgId, "requests"] as const,
  resources: {
    list: (orgId: string) => ["org", orgId, "resources", "list"] as const,
    mine: (orgId: string, userId: string) => ["org", orgId, "resources", "mine", userId] as const,
  },
  lookups: (orgId: string, listKey: string) => ["org", orgId, "lookups", listKey] as const,
  settings: (orgId: string) => ["org", orgId, "settings"] as const,
  workspaceRoles: (orgId: string) => ["org", orgId, "workspace-roles"] as const,
  phases: (orgId: string) => ["org", orgId, "phases"] as const,
} as const;
