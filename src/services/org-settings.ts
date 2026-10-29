// Organisation settings, read from and written to Supabase.
//
// Settings live in three places, and this service hides the split from the settings store:
//   - organisations columns: name, short_name, brand_colour, support_contact, logo_path
//   - organisations.settings jsonb: regional, health thresholds, risk matrix, terminology,
//     tiers, templates, notifications, working time, benefit appraisal defaults, role homes
//   - tables: lifecycle_phases + gate_criteria, lookup_values (lists), exchange_rates,
//     holiday_calendars + holiday_dates, project_templates, organisation members, audit_log
//
// loadOrgSettings() returns a Partial<AppSettings> the store merges over its defaults.
// saveOrgSettings() compares the previous and next AppSettings and writes only what changed:
// the jsonb document with optimistic concurrency on organisations.updated_at, and table rows
// by id. Lists diff by label: a removed value is deactivated (records may still point at it),
// an added value is inserted or reactivated.
import type {
  AppSettings,
  AuditEntry,
  ExchangeRate,
  HolidayCalendar,
  ProjectTemplate,
  UserAccount,
  UserRole,
} from "@/data/settings-types";
import type { GateCheckKey, GateCriterion, LifecyclePhase, ProjectTier } from "@/data/types";
import type { Database, Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { defaultRoles } from "@/data/settings-data";
import { fromIsoDate, toIsoDate } from "@/lib/format";
import { tierLabel } from "./labels";
import { ServiceError, unwrap, unwrapMaybe } from "./service-error";
import type { TableName } from "./db";
import { deleteRows, insertRow, insertRows, updateRow } from "./write";

type AppRole = Database["public"]["Enums"]["app_role"];
type GateKey = Database["public"]["Enums"]["gate_check_key"];
type Tier = Database["public"]["Enums"]["project_tier"];

export const appRoleLabel: Record<AppRole, UserRole> = {
  viewer: "Viewer",
  contributor: "Contributor",
  manager: "Manager",
  pmo: "PMO",
  admin: "Admin",
};
export const appRoleValue = Object.fromEntries(
  Object.entries(appRoleLabel).map(([key, value]) => [value, key]),
) as Record<UserRole, AppRole>;

const gateKeyLabel: Record<GateKey, GateCheckKey> = {
  benefit_profiles_owned: "benefit-profiles-owned",
  benefit_baselines: "benefit-baselines",
  benefits_handover: "benefits-handover",
  lessons_reviewed: "lessons-reviewed",
  phase_lessons_review: "phase-lessons-review",
};
const tierValue = Object.fromEntries(
  Object.entries(tierLabel).map(([key, value]) => [value, key]),
) as Record<ProjectTier, Tier>;

/** lookup_values.list_key for each settings list. Issue severity and dependency type are enums. */
export const LIST_KEYS = {
  lessonCategories: "lesson_category",
  projectTypes: "project_type",
  businessUnits: "business_unit",
  collectionTypes: "collection_type",
  tags: "tag",
  decisionForums: "decision_forum",
  changeTypes: "change_type",
  costCategories: "cost_category",
  fundingSources: "funding_source",
} as const;
type ListName = keyof typeof LIST_KEYS;

/** Top-level keys stored in organisations.settings. */
const JSONB_KEYS = [
  "regional",
  "workingTime",
  "terminology",
  "health",
  "risk",
  "benefits",
  "notifications",
  "templates",
  "data",
] as const;

export interface LookupValue {
  id: string;
  listKey: string;
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

export interface OrgSettingsData {
  settings: Partial<AppSettings>;
  /** organisations.updated_at: the version the jsonb document was read at. */
  updatedAt: string;
  logoPath: string | null;
  lookups: LookupValue[];
  /** Extra jsonb keys the front end doesn't model, kept untouched on save. */
  rawSettings: Record<string, Json>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function loadOrgSettings(orgId: string, userId: string): Promise<OrgSettingsData> {
  const [
    org,
    phases,
    criteria,
    lookups,
    rates,
    calendars,
    templates,
    members,
    audit,
    subscription,
  ] = await Promise.all([
    supabase
      .from("organisations")
      .select(
        "id, name, short_name, brand_colour, support_contact, logo_path, settings, updated_at",
      )
      .eq("id", orgId)
      .single(),
    supabase
      .from("lifecycle_phases")
      .select("id, name, short_name, description, gate_name, sort_order")
      .eq("organisation_id", orgId)
      .order("sort_order"),
    supabase
      .from("gate_criteria")
      .select("id, phase_id, label, tiers, document, check_key, sort_order")
      .eq("organisation_id", orgId)
      .order("sort_order"),
    supabase
      .from("lookup_values")
      .select("id, list_key, value, label, sort_order, is_active")
      .eq("organisation_id", orgId)
      .order("sort_order"),
    supabase
      .from("exchange_rates")
      .select("id, currency, rate, effective_date")
      .eq("organisation_id", orgId)
      .order("effective_date"),
    // One-to-many with a single FK: embed the dates.
    supabase
      .from("holiday_calendars")
      .select("id, name, holiday_dates(date, name)")
      .eq("organisation_id", orgId)
      .order("name"),
    supabase
      .from("project_templates")
      .select("id, name, tier, description, task_buckets")
      .eq("organisation_id", orgId)
      .order("name"),
    supabase.from("organisation_members").select("profile_id, role").eq("organisation_id", orgId),
    // Only pmo/admin can read the audit log; RLS returns nothing for everyone else.
    supabase
      .from("audit_log")
      .select("id, created_at, actor_id, action, entity_table, detail")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50),
    // Admins only; others get no row and the defaults stay hidden behind the card's notice.
    supabase
      .from("organisation_subscriptions")
      .select(
        "plan, status, billing_interval, seats_total, trial_ends_at, current_period_end, cancel_at_period_end, billing_contact, stripe_customer_id",
      )
      .eq("organisation_id", orgId)
      .maybeSingle(),
  ]);
  const orgRow = unwrap(org, "Loading organisation settings");
  const memberRows = unwrap(members, "Loading members");
  const profiles = memberRows.length
    ? unwrap(
        await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in(
            "id",
            memberRows.map((row) => row.profile_id),
          ),
        "Loading members",
      )
    : [];
  const profileById = new Map(profiles.map((row) => [row.id, row]));
  const criteriaRows = unwrap(criteria, "Loading gate criteria");
  const lookupRows: LookupValue[] = unwrap(lookups, "Loading lists").map((row) => ({
    id: row.id,
    listKey: row.list_key,
    value: row.value,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
  const activeLabels = (listKey: string) =>
    lookupRows.filter((row) => row.listKey === listKey && row.isActive).map((row) => row.label);

  const stored = isObject(orgRow.settings) ? (orgRow.settings as Record<string, Json>) : {};
  const settings: Partial<AppSettings> & Record<string, unknown> = {};
  for (const key of JSONB_KEYS) if (isObject(stored[key])) settings[key] = stored[key] as never;

  settings.organisation = {
    name: orgRow.name,
    shortName: orgRow.short_name ?? orgRow.name.slice(0, 3).toUpperCase(),
    brandColour: orgRow.brand_colour ?? "#2a4c96",
    supportContact: orgRow.support_contact ?? "",
    logoDataUrl: orgRow.logo_path ? await signedLogoUrl(orgRow.logo_path) : "",
  };

  const lists = Object.fromEntries(
    Object.entries(LIST_KEYS).map(([name, key]) => [name, activeLabels(key)]),
  ) as Record<ListName, string[]>;
  settings.lists = {
    ...lists,
    issueSeverities: ["Low", "Medium", "High"],
    dependencyTypes: ["Sequencing", "Alignment", "Information", "Resource", "External"],
  };

  const benefits = isObject(stored["benefits"]) ? stored["benefits"] : {};
  settings.benefits = {
    ...(benefits as unknown as AppSettings["benefits"]),
    categories: activeLabels("benefit_category") as AppSettings["benefits"]["categories"],
    classifications: ["Cash-releasing", "Non-cash-releasing", "Qualitative", "Societal"],
  };

  const regional = isObject(stored["regional"]) ? stored["regional"] : {};
  settings.regional = {
    ...(regional as unknown as AppSettings["regional"]),
    exchangeRates: unwrap(rates, "Loading exchange rates").map((row): ExchangeRate => ({
      id: row.id,
      currency: row.currency,
      rate: Number(row.rate),
      effectiveDate: fromIsoDate(row.effective_date),
    })),
  };

  const working = isObject(stored["workingTime"]) ? stored["workingTime"] : {};
  settings.workingTime = {
    ...(working as unknown as AppSettings["workingTime"]),
    holidayCalendars: unwrap(calendars, "Loading holiday calendars").map(
      (row): HolidayCalendar => ({
        id: row.id,
        name: row.name,
        dates: (row.holiday_dates ?? [])
          .map((entry) => ({ date: fromIsoDate(entry.date), name: entry.name }))
          .sort((a, b) => (toIsoDate(a.date) ?? "").localeCompare(toIsoDate(b.date) ?? "")),
      }),
    ),
  };

  const templateSettings = isObject(stored["templates"]) ? stored["templates"] : {};
  settings.templates = {
    ...(templateSettings as unknown as AppSettings["templates"]),
    projectTemplates: unwrap(templates, "Loading project templates").map(
      (row): ProjectTemplate => ({
        id: row.id,
        name: row.name,
        tier: tierLabel[row.tier],
        description: row.description ?? "",
        taskBuckets: row.task_buckets ?? [],
      }),
    ),
  };

  settings.lifecycle = {
    phases: unwrap(phases, "Loading lifecycle phases").map((row): LifecyclePhase => ({
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      description: row.description ?? "",
      gateName: row.gate_name ?? "",
      criteria: criteriaRows
        .filter((item) => item.phase_id === row.id)
        .map((item): GateCriterion => ({
          id: item.id,
          label: item.label,
          tiers: (item.tiers ?? []).map((tier) => tierLabel[tier]),
          ...(item.document ? { document: item.document } : {}),
          ...(item.check_key ? { check: gateKeyLabel[item.check_key] } : {}),
        })),
    })),
    tiers: Array.isArray(stored["tiers"])
      ? (stored["tiers"] as unknown as AppSettings["lifecycle"]["tiers"])
      : [],
  };

  settings.users = memberRows.map((row): UserAccount => ({
    id: row.profile_id,
    name: profileById.get(row.profile_id)?.display_name ?? "Unknown",
    email: profileById.get(row.profile_id)?.email ?? "",
    role: appRoleLabel[row.role],
    team: "",
    active: true,
  }));
  settings.currentUserId = userId;
  const homes = isObject(stored["roleHomes"])
    ? (stored["roleHomes"] as Record<string, string>)
    : {};
  settings.roles = roleDefinitions(homes);

  const names = new Map(profiles.map((row) => [row.id, row.display_name]));
  const auditRows = audit.error ? [] : (audit.data ?? []);
  settings.data = {
    ...((isObject(stored["data"]) ? stored["data"] : {}) as unknown as AppSettings["data"]),
    auditLog: auditRows.map((row): AuditEntry => ({
      id: row.id,
      timestamp: row.created_at,
      actor: (row.actor_id && names.get(row.actor_id)) || "Virtual PMO",
      action:
        AUDIT_EVENT_LABELS[row.action] ?? `${row.action} ${row.entity_table.replaceAll("_", " ")}`,
      detail: describeAudit(row.detail),
    })),
  };

  const plan = subscription.error ? null : subscription.data;
  const viewers = memberRows.filter((row) => row.role === "viewer").length;
  settings.subscription = {
    canManage: memberRows.some((row) => row.profile_id === userId && row.role === "admin"),
    plan: plan?.plan ?? "",
    status: plan?.status ?? "",
    billingInterval:
      plan?.billing_interval === "month" || plan?.billing_interval === "year"
        ? plan.billing_interval
        : "",
    paidSeatsUsed: memberRows.length - viewers,
    viewers,
    seatsTotal: plan?.seats_total ?? 0,
    trialEndsAt: plan?.trial_ends_at ?? "",
    currentPeriodEnd: plan?.current_period_end ?? "",
    cancelAtPeriodEnd: plan?.cancel_at_period_end ?? false,
    billingContact: plan?.billing_contact ?? "",
    hasBillingAccount: Boolean(plan?.stripe_customer_id),
  };

  return {
    settings,
    updatedAt: orgRow.updated_at,
    logoPath: orgRow.logo_path,
    lookups: lookupRows,
    rawSettings: stored,
  };
}

/** Work package 2.1 events (private.write_audit); row changes keep "<operation> <table>". */
const AUDIT_EVENT_LABELS: Record<string, string> = {
  "invite.created": "Invitation created",
  "invite.sent": "Invitation emailed",
  "invite.send_failed": "Invitation email failed",
  "invite.revoked": "Invitation revoked",
  "invite.accepted": "Invitation accepted",
  "invite.bounced": "Invitation email bounced",
  "invite.suppressed": "Invitation email suppressed",
  "invite.complained": "Invitation marked as spam",
  "member.role_changed": "Member role changed",
  "member.removed": "Member removed",
  "join_settings.changed": "Join requests setting changed",
  "join_domain.added": "Join domain added",
  "join_domain.removed": "Join domain removed",
  "join_request.created": "Request to join",
  "join_request.withdrawn": "Join request withdrawn",
  "join_request.approved": "Join request approved",
  "join_request.declined": "Join request declined",
  "billing.seats_added": "Seats added",
  "billing.seat_reduction_scheduled": "Seat reduction scheduled",
  "billing.scheduled_change_cancelled": "Scheduled billing change cancelled",
  "billing.interval_switch_scheduled": "Plan switch scheduled",
  "seats.changed": "Paid seats changed",
  "seats.change_scheduled": "Seat or plan change scheduled",
  "seats.scheduled_change_cleared": "Scheduled seat or plan change cleared",
};

function describeAudit(detail: Json): string {
  if (!isObject(detail)) return "";
  const changed = detail["changed"];
  if (Array.isArray(changed)) return `Changed ${changed.join(", ")}`;
  const title = detail["title"] ?? detail["name"];
  if (typeof title === "string") return title;
  // 2.1 events: who it concerns and what changed.
  const parts = [detail["email"], detail["value"]].filter(
    (part) => typeof part === "string",
  ) as string[];
  if (detail["from"] !== undefined && detail["to"] !== undefined)
    parts.push(`${String(detail["from"])} → ${String(detail["to"])}`);
  else if (typeof detail["role"] === "string") parts.push(detail["role"]);
  return parts.join(", ");
}

/** The fixed role ladder (see defaultRoles) with each role's configured default home page. */
export const roleDefinitions = (homes: Record<string, string> = {}): AppSettings["roles"] =>
  defaultRoles.map((role) => ({ ...role, defaultHome: homes[role.role] ?? role.defaultHome }));

async function signedLogoUrl(path: string) {
  const { data } = await supabase.storage.from("org-assets").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? "";
}

/** Uploads a logo to org-assets/{org}/logo-… and returns its storage path. Admins only. */
export async function uploadLogo(orgId: string, file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const path = `${orgId}/logo-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from("org-assets")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (error)
    throw new ServiceError("forbidden", `Uploading the logo: ${error.message}`, { cause: error });
  return path;
}

// ---- Saving -----------------------------------------------------------------------------

export interface SaveContext {
  orgId: string;
  data: OrgSettingsData;
  /** Logo file chosen in this edit, if any. */
  logoFile?: File | undefined;
  /**
   * Ids the screen made up for rows it added (phase-…, c-…) → the uuid the database gave
   * them. Kept across saves so later edits to a new row update it instead of inserting again.
   */
  ids: Map<string, string>;
}

/** The database id for a row the screen may have created with a temporary id. */
const resolveId = (ids: Map<string, string>, id: string) =>
  ids.get(id) ?? (isUuid(id) ? id : undefined);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Writes the difference between two settings snapshots. Returns the new organisations.updated_at. */
export async function saveOrgSettings(
  context: SaveContext,
  previous: AppSettings,
  next: AppSettings,
): Promise<void> {
  const { orgId, data } = context;
  await saveOrganisation(context, previous, next);
  await saveJsonb(orgId, data, previous, next);
  for (const [name, listKey] of Object.entries(LIST_KEYS) as Array<[ListName, string]>)
    if (!same(previous.lists[name], next.lists[name]))
      await saveList(orgId, listKey, data.lookups, next.lists[name]);
  if (!same(previous.benefits.categories, next.benefits.categories))
    await saveList(orgId, "benefit_category", data.lookups, next.benefits.categories);
  const { ids } = context;
  if (!same(previous.lifecycle.phases, next.lifecycle.phases))
    await savePhases(orgId, ids, previous.lifecycle.phases, next.lifecycle.phases);
  if (!same(previous.regional.exchangeRates, next.regional.exchangeRates))
    await saveRates(orgId, ids, previous.regional.exchangeRates, next.regional.exchangeRates);
  if (!same(previous.workingTime.holidayCalendars, next.workingTime.holidayCalendars))
    await saveCalendars(
      orgId,
      ids,
      previous.workingTime.holidayCalendars,
      next.workingTime.holidayCalendars,
    );
  if (!same(previous.templates.projectTemplates, next.templates.projectTemplates))
    await saveTemplates(
      orgId,
      ids,
      previous.templates.projectTemplates,
      next.templates.projectTemplates,
    );
  if (!same(previous.users, next.users)) await saveMembers(orgId, previous.users, next.users);
}

async function saveOrganisation(context: SaveContext, previous: AppSettings, next: AppSettings) {
  const before = previous.organisation,
    after = next.organisation;
  if (same(before, after) && !context.logoFile) return;
  let logoPath: string | null | undefined;
  if (context.logoFile) logoPath = await uploadLogo(context.orgId, context.logoFile);
  else if (before.logoDataUrl && !after.logoDataUrl) logoPath = null;
  const written = await updateRow(
    "organisations",
    context.orgId,
    {
      name: after.name.trim() || before.name,
      short_name: after.shortName.trim() || null,
      brand_colour: after.brandColour,
      support_contact: after.supportContact.trim() || null,
      ...(logoPath !== undefined && { logo_path: logoPath }),
    },
    { context: "Saving organisation details", lastSeen: context.data.updatedAt },
  );
  context.data.updatedAt = written.updatedAt ?? context.data.updatedAt;
}

async function saveJsonb(
  orgId: string,
  data: OrgSettingsData,
  previous: AppSettings,
  next: AppSettings,
) {
  // Optimism bias is written on its own first: PMO members may change it, while the rest of
  // the document is admin-only (a database trigger enforces both).
  if (!same(previous.benefits.optimismBias, next.benefits.optimismBias))
    await saveOptimismBias(orgId, data, next.benefits.optimismBias);
  const strip = (settings: AppSettings) => ({
    regional: { ...settings.regional, exchangeRates: undefined },
    workingTime: { ...settings.workingTime, holidayCalendars: undefined },
    terminology: settings.terminology,
    health: settings.health,
    risk: settings.risk,
    benefits: {
      ...settings.benefits,
      categories: undefined,
      classifications: undefined,
      optimismBias: undefined,
    },
    notifications: settings.notifications,
    templates: { ...settings.templates, projectTemplates: undefined },
    data: { retentionMonths: settings.data.retentionMonths },
    tiers: settings.lifecycle.tiers,
    roleHomes: Object.fromEntries(settings.roles.map((role) => [role.role, role.defaultHome])),
  });
  const before = strip(previous),
    after = strip(next);
  if (same(before, after)) return;
  const storedBenefits = isObject(data.rawSettings["benefits"]) ? data.rawSettings["benefits"] : {};
  const document = JSON.parse(
    JSON.stringify({
      ...data.rawSettings,
      ...after,
      benefits: { ...after.benefits, optimismBias: storedBenefits["optimismBias"] },
    }),
  ) as Json;
  const written = await updateRow(
    "organisations",
    orgId,
    { settings: document },
    { context: "Saving settings", lastSeen: data.updatedAt },
  );
  data.updatedAt = written.updatedAt ?? data.updatedAt;
  data.rawSettings = document as Record<string, Json>;
}

/**
 * Write only settings.benefits.optimismBias, leaving the stored document otherwise exactly as
 * loaded, so the change is allowed for PMO members as well as admins. The database validates
 * the values (0–80%, one per category).
 */
async function saveOptimismBias(
  orgId: string,
  data: OrgSettingsData,
  bias: AppSettings["benefits"]["optimismBias"],
) {
  const benefits = isObject(data.rawSettings["benefits"]) ? data.rawSettings["benefits"] : {};
  const document = {
    ...data.rawSettings,
    benefits: {
      ...benefits,
      optimismBias: bias.map(({ category, percentage }) => ({ category, percentage })),
    },
  } as Record<string, Json>;
  const written = await updateRow(
    "organisations",
    orgId,
    { settings: document },
    { context: "Saving the optimism bias", lastSeen: data.updatedAt },
  );
  data.updatedAt = written.updatedAt ?? data.updatedAt;
  data.rawSettings = document;
}

const slug = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "value";

async function saveList(orgId: string, listKey: string, lookups: LookupValue[], labels: string[]) {
  const rows = lookups.filter((row) => row.listKey === listKey);
  const wanted = labels.map((label) => label.trim()).filter(Boolean);
  for (const row of rows)
    if (row.isActive && !wanted.includes(row.label))
      await updateRow(
        "lookup_values",
        row.id,
        { is_active: false },
        { context: "Removing a list value" },
      );
  for (const [index, label] of wanted.entries()) {
    const existing = rows.find((row) => row.label === label);
    if (existing) {
      if (!existing.isActive || existing.sortOrder !== index)
        await updateRow(
          "lookup_values",
          existing.id,
          { is_active: true, sort_order: index },
          { context: "Saving a list value" },
        );
      continue;
    }
    const taken = new Set(rows.map((row) => row.value));
    let value = slug(label);
    for (let suffix = 2; taken.has(value); suffix += 1) value = `${slug(label)}_${suffix}`;
    await insertRow(
      "lookup_values",
      // Org-level table: no parent row for the tenant trigger to copy from, so send the org.
      {
        organisation_id: orgId,
        list_key: listKey,
        value,
        label,
        sort_order: index,
        is_active: true,
      } as never,
      "Adding a list value",
    );
  }
}

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/**
 * Generic diff for a table-backed list: delete rows that disappeared, insert rows without a
 * database id yet (remembering their new id), update rows whose fields changed.
 */
async function syncRows<T extends { id: string }, R extends TableName>(
  orgId: string,
  table: R,
  ids: Map<string, string>,
  previous: T[],
  next: T[],
  toFields: (item: T, index: number) => Record<string, unknown> | undefined,
  label: string,
  after?: (item: T, id: string, before: T | undefined) => Promise<void>,
  insertOnly?: (item: T, index: number) => Record<string, unknown>,
) {
  const removed = previous
    .filter((item) => !next.some((candidate) => candidate.id === item.id))
    .map((item) => resolveId(ids, item.id))
    .filter((id): id is string => Boolean(id));
  if (removed.length) await deleteRows(table, removed, `Removing a ${label}`);
  for (const [index, item] of next.entries()) {
    const fields = toFields(item, index);
    if (!fields) continue; // not valid yet; saved once it is
    const before = previous.find((candidate) => candidate.id === item.id);
    let id = resolveId(ids, item.id);
    if (!id) {
      // Root settings tables (phases, rates, calendars, templates) have no parent row for the
      // tenant trigger to copy organisation_id from, so it is sent here. On child tables
      // (gate_criteria) the trigger overwrites it from the parent, so sending it is harmless.
      id = (
        await insertRow(
          table,
          { organisation_id: orgId, ...fields, ...insertOnly?.(item, index) } as never,
          `Adding a ${label}`,
        )
      ).id;
      ids.set(item.id, id);
    } else if (!before || !same(toFields(before, previous.indexOf(before)), fields))
      await updateRow(table, id, fields as never, { context: `Saving a ${label}` });
    if (after) await after(item, id, before);
  }
}

/**
 * Phase order is unique per organisation, and each row write is its own request, so writing
 * sort_order row by row collides with a neighbour (seeded orders start at 1; a new phase or a
 * swap lands on a number another phase still holds). So rows are saved without their order,
 * new rows take a parking slot, and reorder_lifecycle_phases renumbers them all 1..n in one
 * transaction, where the deferred unique check only runs at the end.
 */
const PARKED_SORT_ORDER = 100_000;

const savePhases = async (
  orgId: string,
  ids: Map<string, string>,
  previous: LifecyclePhase[],
  next: LifecyclePhase[],
) => {
  // First renumber in the previous order, so rows a failed save left on parking values are
  // back at 1..n before this save parks its new rows.
  await reorderPhases(orgId, ids, previous);
  await savePhaseRows(orgId, ids, previous, next);
  await reorderPhases(orgId, ids, next);
};

const reorderPhases = async (orgId: string, ids: Map<string, string>, phases: LifecyclePhase[]) => {
  const ordered = phases
    .map((phase) => resolveId(ids, phase.id))
    .filter((id): id is string => Boolean(id));
  unwrapMaybe(
    await supabase.rpc("reorder_lifecycle_phases", {
      p_organisation_id: orgId,
      p_phase_ids: ordered,
    }),
    "Ordering the phases",
  );
};

const savePhaseRows = (
  orgId: string,
  ids: Map<string, string>,
  previous: LifecyclePhase[],
  next: LifecyclePhase[],
) =>
  syncRows(
    orgId,
    "lifecycle_phases",
    ids,
    previous,
    next,
    (phase, index) => ({
      name: phase.name.trim() || `Phase ${index + 1}`,
      short_name: phase.shortName.trim() || `Phase ${index + 1}`,
      description: phase.description,
      gate_name: phase.gateName,
    }),
    "phase",
    (phase, phaseId, before) =>
      same(before?.criteria, phase.criteria)
        ? Promise.resolve()
        : syncRows(
            orgId,
            "gate_criteria",
            ids,
            before?.criteria ?? [],
            phase.criteria,
            (criterion, index) => ({
              phase_id: phaseId,
              label: criterion.label.trim() || "Gate criterion",
              tiers: criterion.tiers.map((tier) => tierValue[tier]),
              document: criterion.document?.trim() || null,
              sort_order: index,
            }),
            "gate criterion",
          ),
    (_phase, index) => ({ sort_order: PARKED_SORT_ORDER + index }),
  );

const saveRates = (
  orgId: string,
  ids: Map<string, string>,
  previous: ExchangeRate[],
  next: ExchangeRate[],
) =>
  syncRows(
    orgId,
    "exchange_rates",
    ids,
    previous,
    next,
    (rate) => {
      const date = toIsoDate(rate.effectiveDate);
      return date && rate.currency.trim()
        ? { currency: rate.currency.trim().toUpperCase(), rate: rate.rate, effective_date: date }
        : undefined;
    },
    "rate",
  );

const saveCalendars = (
  orgId: string,
  ids: Map<string, string>,
  previous: HolidayCalendar[],
  next: HolidayCalendar[],
) =>
  syncRows(
    orgId,
    "holiday_calendars",
    ids,
    previous,
    next,
    (calendar) => ({ name: calendar.name.trim() || "Calendar" }),
    "calendar",
    async (calendar, calendarId, before) => {
      const known = new Set((before?.dates ?? []).map((entry) => toIsoDate(entry.date)));
      const added = calendar.dates
        .map((entry) => ({ date: toIsoDate(entry.date), name: entry.name }))
        .filter(
          (entry): entry is { date: string; name: string } =>
            Boolean(entry.date) && !known.has(entry.date),
        );
      if (added.length)
        await insertRows(
          "holiday_dates",
          added.map((entry) => ({ calendar_id: calendarId, date: entry.date, name: entry.name })),
          "Adding holidays",
        );
    },
  );

const saveTemplates = (
  orgId: string,
  ids: Map<string, string>,
  previous: ProjectTemplate[],
  next: ProjectTemplate[],
) =>
  syncRows(
    orgId,
    "project_templates",
    ids,
    previous,
    next,
    (template) => ({
      name: template.name.trim() || "Template",
      tier: tierValue[template.tier],
      description: template.description,
      task_buckets: template.taskBuckets,
    }),
    "template",
  );

/**
 * Role changes for existing members, through change_member_role (admins only, paid-seat limit,
 * last admin kept). Direct writes to organisation_members are revoked (work package 2.1).
 */
async function saveMembers(orgId: string, previous: UserAccount[], next: UserAccount[]) {
  for (const user of next) {
    const before = previous.find((item) => item.id === user.id);
    if (!before || before.role === user.role) continue;
    unwrapMaybe(
      await supabase.rpc("change_member_role", {
        p_organisation_id: orgId,
        p_profile_id: user.id,
        p_role: appRoleValue[user.role],
      }),
      `Changing ${user.name}'s role`,
    );
  }
}

/** Saves the signed-in user's own display name (profiles.display_name). */
export async function saveDisplayName(userId: string, name: string) {
  await updateRow(
    "profiles",
    userId,
    { display_name: name.trim() },
    { context: "Saving your name" },
  );
}
