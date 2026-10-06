import type { BenefitCategory, OptimismBiasSetting } from "./types";
import { getSettings } from "@/services/settings";

/** Optimism bias uplifts live in Settings → Benefits; these accessors read the live values. */
export const getOptimismBias = (): OptimismBiasSetting[] => getSettings().benefits.optimismBias;
export const optimismBiasFor = (
  category: BenefitCategory,
  settings: OptimismBiasSetting[] = getOptimismBias(),
) => settings.find((item) => item.category === category)?.percentage ?? 20;
export const getAppraisalYears = () => getSettings().benefits.appraisalYears;
