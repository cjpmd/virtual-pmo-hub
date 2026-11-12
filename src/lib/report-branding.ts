// Report cover branding (GL-14, decision D-d). The logo switch moved from the retired Funding
// pack template (templates.committeePack.showLogo) to templates.reports.showLogo. Stored
// settings are not rewritten: until an admin changes the new switch, the old value applies.
import type { AppSettings } from "@/data/settings-types";

export function reportShowLogo(settings: Pick<AppSettings, "templates">): boolean {
  return settings.templates.reports?.showLogo ?? settings.templates.committeePack?.showLogo ?? true;
}
