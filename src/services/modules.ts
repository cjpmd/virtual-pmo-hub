// Modules, sector packs and governance roles (NHS-0). The database decides everything:
// set_organisation_module, preview_sector_pack and apply_sector_pack are admin-only RPCs that
// audit each change; governance role holders are rows PMO and admins write through the shared
// write helper. Migration 20261122150000_nhs_0_modules.
import { supabase } from "@/integrations/supabase/client";
import { isModuleKey, type ModuleKey } from "@/lib/modules";
import type { SectorPack } from "@/data/sector-packs";
import type { NewRow } from "./db";
import { unwrap } from "./service-error";
import { deleteRows, insertRow, updateRow } from "./write";

export interface PackPlan {
  pack: SectorPack;
  previousPack: SectorPack;
  modulesOn: ModuleKey[];
  modulesAlreadyOn: ModuleKey[];
  termsAdded: Record<string, string>;
  termsKept: string[];
  seeded: Array<{ list: string; value: string; label: string }>;
  financialYearStartMonth: number;
  suggestedFinancialYearStartMonth: number | null;
  applied: boolean;
}

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Reads the jsonb the pack RPCs return (pure; unit-tested). */
export function parsePackPlan(value: unknown): PackPlan {
  const row = asObject(value);
  const pack = (v: unknown): SectorPack => (v === "nhs" ? "nhs" : "general");
  const terms = asObject(row["terms_added"]);
  return {
    pack: pack(row["pack"]),
    previousPack: pack(row["previous_pack"]),
    modulesOn: asStrings(row["modules_on"]).filter(isModuleKey),
    modulesAlreadyOn: asStrings(row["modules_already_on"]).filter(isModuleKey),
    termsAdded: Object.fromEntries(
      Object.entries(terms).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    termsKept: asStrings(row["terms_kept"]),
    seeded: (Array.isArray(row["seeded"]) ? row["seeded"] : []).map((item) => {
      const seed = asObject(item);
      return {
        list: String(seed["list"] ?? ""),
        value: String(seed["value"] ?? ""),
        label: String(seed["label"] ?? ""),
      };
    }),
    financialYearStartMonth: Number(row["financial_year_start_month"] ?? 1),
    suggestedFinancialYearStartMonth:
      typeof row["suggested_financial_year_start_month"] === "number"
        ? (row["suggested_financial_year_start_month"] as number)
        : null,
    applied: row["applied"] === true,
  };
}

export async function setOrganisationModule(orgId: string, key: ModuleKey, enabled: boolean) {
  return unwrap(
    await supabase.rpc("set_organisation_module", { p_org: orgId, p_key: key, p_enabled: enabled }),
    enabled ? "Switching the module on" : "Switching the module off",
  );
}

export async function previewSectorPack(orgId: string, pack: SectorPack, modules?: ModuleKey[]) {
  return parsePackPlan(
    unwrap(
      await supabase.rpc("preview_sector_pack", {
        p_org: orgId,
        p_pack: pack,
        ...(modules ? { p_modules: modules } : {}),
      }),
      "Checking what the pack adds",
    ),
  );
}

export async function applySectorPack(orgId: string, pack: SectorPack, modules?: ModuleKey[]) {
  return parsePackPlan(
    unwrap(
      await supabase.rpc("apply_sector_pack", {
        p_org: orgId,
        p_pack: pack,
        ...(modules ? { p_modules: modules } : {}),
      }),
      "Applying the pack",
    ),
  );
}

// ---- Governance roles ----

export interface GovernanceRole {
  value: string;
  label: string;
  isActive: boolean;
}
export interface GovernanceRoleHolder {
  id: string;
  roleKey: string;
  profileId: string;
  isDeputy: boolean;
  updatedAt: string;
}

export async function listGovernanceRoles(orgId: string): Promise<GovernanceRole[]> {
  const rows = unwrap(
    await supabase
      .from("lookup_values")
      .select("value, label, is_active, sort_order")
      .eq("organisation_id", orgId)
      .eq("list_key", "governance_role")
      .order("sort_order"),
    "Loading governance roles",
  );
  return rows.map((row) => ({ value: row.value, label: row.label, isActive: row.is_active }));
}

export async function listGovernanceRoleHolders(orgId: string): Promise<GovernanceRoleHolder[]> {
  const rows = unwrap(
    await supabase
      .from("governance_role_holders")
      .select("id, role_key, profile_id, is_deputy, updated_at")
      .eq("organisation_id", orgId)
      .order("created_at"),
    "Loading governance role holders",
  );
  return rows.map((row) => ({
    id: row.id,
    roleKey: row.role_key,
    profileId: row.profile_id,
    isDeputy: row.is_deputy,
    updatedAt: row.updated_at,
  }));
}

export function addGovernanceRoleHolder(
  orgId: string,
  input: { roleKey: string; profileId: string; isDeputy: boolean },
) {
  return insertRow(
    "governance_role_holders",
    {
      organisation_id: orgId,
      role_key: input.roleKey,
      profile_id: input.profileId,
      is_deputy: input.isDeputy,
    } as NewRow<"governance_role_holders">,
    "Assigning the governance role",
  );
}

export function setGovernanceRoleDeputy(holder: GovernanceRoleHolder, isDeputy: boolean) {
  return updateRow(
    "governance_role_holders",
    holder.id,
    { is_deputy: isDeputy },
    { context: "Changing the deputy flag", lastSeen: holder.updatedAt },
  );
}

export function removeGovernanceRoleHolder(id: string) {
  return deleteRows("governance_role_holders", [id], "Removing the governance role");
}
