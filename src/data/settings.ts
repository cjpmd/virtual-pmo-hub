import type { BenefitCategory, OptimismBiasSetting } from "./types";

// Green Book style optimism bias uplifts applied to raw benefit estimates during appraisal.
// Editable in Admin → Appraisal.
export const defaultOptimismBias: OptimismBiasSetting[] = [
  { category: "Efficiency", percentage: 20 },
  { category: "Income", percentage: 30 },
  { category: "Student experience", percentage: 25 },
  { category: "Research", percentage: 25 },
  { category: "Risk reduction", percentage: 15 },
  { category: "Compliance", percentage: 10 },
  { category: "Sustainability", percentage: 15 },
];

export const optimismBiasFor = (category: BenefitCategory, settings: OptimismBiasSetting[] = defaultOptimismBias) =>
  settings.find(item => item.category === category)?.percentage ?? 20;

export const defaultAppraisalYears = 5;
