/** Automation recipes offered on the benefit, dependency and governance boards (hidden until 4.3). */
export const benefitAutomationRecipes = [
  "When a measurement is 7 days overdue, notify the benefit owner",
  "When actual is more than 20% below target for two periods, set confidence to Low and notify the SRO",
  "Every quarter, remind benefit owners to submit measurements",
];
export const dependencyAutomationRecipes = [
  "When a sequencing dependency goes Off Track, notify both owners",
  "When a dependency is awaiting confirmation 14 days after it was raised, notify the giving owner",
];
export const governanceAutomationRecipes = [
  "When a decision passes its needed-by date, notify the decision maker and the forum chair",
  "When an assumption is marked Invalidated, prompt the owner to raise an issue",
  "When a phase gate is passed without a lessons review, notify the project manager",
];
