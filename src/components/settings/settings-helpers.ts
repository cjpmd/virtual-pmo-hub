import { defaultLifecyclePhases } from "@/data/lifecycle";
import type { AppSettings } from "@/data/settings-types";
import { updateSettings } from "@/services/settings";

/** A fresh copy of the default lifecycle phases, for Reset. */
export const getDefaultPhases = () =>
  JSON.parse(JSON.stringify(defaultLifecyclePhases)) as typeof defaultLifecyclePhases;
/** The amount the currency and number previews format. */
export const sample = 1_248_500;
/** Saves a partial update to one settings group. */
export const patch = <K extends keyof AppSettings>(key: K, value: Partial<AppSettings[K]>) =>
  updateSettings({ [key]: value } as Partial<AppSettings>);
