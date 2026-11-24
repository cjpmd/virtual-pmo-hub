// GL-13 notification settings shared by Settings and the notification centre. The rule mirrors
// private.notification_digest in the database: organisation email off wins; else the person's
// choice; else the organisation's default ("Real time" -> as they happen, "Weekly" -> weekly,
// anything else -> daily).
import type { NotificationSettings } from "@/data/settings-types";
import type { AppSettings } from "@/data/settings-types";
import { isModuleEnabled, type ModuleKey } from "@/lib/modules";
import {
  NOTIFICATION_EVENT,
  NOTIFICATION_KINDS,
  type Digest,
  type NotificationKind,
} from "@/services/notifications";

export const DIGEST_LABEL: Record<Digest, string> = {
  immediate: "As they happen",
  daily: "Daily digest",
  weekly: "Weekly digest (Mondays)",
  off: "Off",
};

export function orgDefaultDigest(org: Pick<NotificationSettings, "digest">): Digest {
  return org.digest === "Real time" ? "immediate" : org.digest === "Weekly" ? "weekly" : "daily";
}

export function effectiveDigest(
  org: Pick<NotificationSettings, "digest" | "channels">,
  personal: Digest | null,
): Digest {
  if (org.channels.email === false) return "off";
  return personal ?? orgDefaultDigest(org);
}

/** The Settings › Notifications events the database raises (the rest aren't sent yet). */
export const SUPPORTED_EVENTS: readonly string[] = NOTIFICATION_KINDS.map(
  (kind) => NOTIFICATION_EVENT[kind],
);

/** Kinds that belong to a module (NHS-0): only offered in Settings while the module is on. */
export const NOTIFICATION_MODULE: Partial<Record<NotificationKind, ModuleKey>> = {
  assessment_signoff: "impact_assessment",
  assessment_decided: "impact_assessment",
};

export function notificationKindAvailable(kind: NotificationKind, settings: AppSettings) {
  const owner = NOTIFICATION_MODULE[kind];
  return !owner || isModuleEnabled(owner, settings);
}

/** The kinds this organisation can get (module-owned ones only while their module is on). */
export const availableNotificationKinds = (settings: AppSettings) =>
  NOTIFICATION_KINDS.filter((kind) => notificationKindAvailable(kind, settings));

/** SUPPORTED_EVENTS narrowed to this organisation's modules. */
export const availableEvents = (settings: AppSettings): string[] =>
  availableNotificationKinds(settings).map((kind) => NOTIFICATION_EVENT[kind]);
