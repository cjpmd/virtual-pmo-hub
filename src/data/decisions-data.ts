import type {
  Assumption,
  Decision,
  DecisionForum,
  DecisionImpact,
  DecisionOption,
  DecisionStatus,
} from "./types";

export const decisionForums: DecisionForum[] = [
  "Project Board",
  "Programme Board",
  "Digital Committee",
  "Architecture Review Board",
  "Change Advisory Board",
];

const impact = (
  scope: [boolean, string],
  cost: [boolean, string],
  time: [boolean, string],
  benefits: [boolean, string],
): DecisionImpact => ({
  scope: { impacted: scope[0], note: scope[1] },
  cost: { impacted: cost[0], note: cost[1] },
  time: { impacted: time[0], note: time[1] },
  benefits: { impacted: benefits[0], note: benefits[1] },
});
const option = (id: string, title: string, pros: string[], cons: string[]): DecisionOption => ({
  id,
  title,
  pros,
  cons,
});

interface Seed extends Omit<Decision, "id" | "reference"> {
  key: string;
}

const seeds: Seed[] = [
  {
    key: "ebbot-phase-4",
    projectId: "ebbot-chatbot",
    title: "Approve move of Ebbot to Phase 4 subject to TOPdesk catalogue clean-up",
    context:
      "The assistant is ready to build, but routing depends on a service catalogue that still contains duplicated and unowned entries. Moving to Phase 4 without the clean-up risks rework during testing.",
    options: [
      option(
        "o1",
        "Approve Phase 4 now, clean the catalogue in parallel",
        ["Keeps the January pilot date", "Build team stays engaged"],
        ["Routing rules may need rework", "Testing could surface catalogue defects late"],
      ),
      option(
        "o2",
        "Approve Phase 4 conditional on catalogue clean-up completing by 13 November",
        ["Protects the pilot date", "Gives the service desk a firm deadline"],
        ["Conditional approvals need tracking", "Slips if the clean-up slips"],
      ),
      option(
        "o3",
        "Hold at Phase 3 until the catalogue is clean",
        ["Lowest rework risk"],
        ["Pilot slips by at least a term", "Team released to other work"],
      ),
    ],
    chosenOptionId: "o2",
    rationale:
      "Conditional approval keeps the pilot date while making the catalogue clean-up an explicit, owned dependency with a board-visible date.",
    decisionMaker: "Amelia Price",
    forum: "Project Board",
    neededBy: "11/09/2026",
    decisionDate: "10/09/2026",
    status: "Made",
    impact: impact(
      [false, "No change to agreed scope."],
      [false, "Absorbed within the approved budget."],
      [true, "Phase 4 entry is conditional on 13/11/2026."],
      [true, "Protects the reduced service desk contacts profile from Q3."],
    ),
    riskIds: ["ebbot-amber-risk"],
    issueIds: [],
    changeIds: [],
    dependencyIds: ["dep-010"],
    benefitIds: ["ben-003", "ben-004"],
    actions: [
      {
        id: "a1",
        description: "Publish the catalogue clean-up plan with named owners",
        owner: "Priya Ncube",
        dueDate: "02/10/2026",
        status: "In progress",
      },
    ],
    evidenceLink: "Ebbot Project Board minutes 10-09-2026.docx",
  },
  {
    key: "descope-service-point",
    projectId: "service-desk-optimisation",
    title: "Descope Implement New Service Point",
    context:
      "The walk-up service point was scoped before the assistant pilot. Footfall has fallen 38% year on year and the space is now required by Estates.",
    options: [
      option(
        "o1",
        "Deliver the service point as scoped",
        ["Honours the original business case", "Visible presence on campus"],
        [
          "Low forecast usage",
          "Ongoing staffing cost",
          "Estates space is not available until 2028",
        ],
      ),
      option(
        "o2",
        "Descope and redirect the funding to assistant knowledge curation",
        ["Releases £46k", "Strengthens a benefit already in realisation"],
        ["Perception of reduced physical presence", "Needs a communications plan"],
      ),
    ],
    chosenOptionId: "o2",
    rationale:
      "Falling footfall and the unavailability of the space mean the original benefit cannot be realised; the funding does more good against the assistant's knowledge base.",
    decisionMaker: "Martin Lowe",
    forum: "Programme Board",
    neededBy: "28/08/2026",
    decisionDate: "27/08/2026",
    status: "Made",
    impact: impact(
      [true, "Service point removed from scope."],
      [true, "£46k released back to the programme."],
      [false, "No change to the closure date."],
      [true, "Original footfall benefit withdrawn; knowledge benefit strengthened."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: ["cr1"],
    dependencyIds: [],
    benefitIds: ["ben-012", "ben-013"],
    actions: [
      {
        id: "a1",
        description: "Withdraw the footfall benefit profile and record the reason",
        owner: "Elliot Reed",
        dueDate: "11/09/2026",
        status: "Done",
      },
      {
        id: "a2",
        description: "Agree the communications line with Student Services",
        owner: "Layla Owen",
        dueDate: "25/09/2026",
        status: "Open",
      },
    ],
    evidenceLink: "Optimisation Programme Board minutes 27-08-2026.docx",
  },
  {
    key: "storage-option",
    projectId: "storage-expansion",
    title: "Choose storage expansion option",
    context:
      "Research storage will reach 92% capacity by February 2027. Three options were appraised against cost, resilience and the net zero objective.",
    options: [
      option(
        "o1",
        "Extend the existing on-premises array",
        ["Lowest capital cost", "No migration needed"],
        ["Array is end of support in 2029", "No improvement in resilience"],
      ),
      option(
        "o2",
        "Hybrid tier with cloud archive for cold data",
        ["Balances cost and resilience", "Reduces data hall power draw"],
        ["Needs a data classification exercise", "Egress costs to model"],
      ),
      option(
        "o3",
        "Full cloud migration",
        ["Highest resilience", "No hardware refresh"],
        ["Highest whole-life cost", "Research workloads are latency sensitive"],
      ),
    ],
    decisionMaker: "Oliver Bennett",
    forum: "Architecture Review Board",
    neededBy: "09/10/2026",
    status: "Pending",
    impact: impact(
      [true, "Determines the migration scope for DFS work."],
      [true, "Whole-life cost varies by £180k across the options."],
      [true, "Option 3 adds three months."],
      [true, "Only options 2 and 3 support the energy reduction benefit."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: ["dep-009"],
    benefitIds: ["ben-009"],
    actions: [],
  },
  {
    key: "vdi-hold",
    projectId: "vdi-review",
    title: "Hold the VDI pilot until the data centre network is stable",
    context:
      "The giving milestone for the network refresh has slipped to 20 November, past the VDI required-by date of 30 October. Starting the pilot on an unstable network would invalidate the performance testing.",
    options: [
      option(
        "o1",
        "Start the pilot on the current network",
        ["Keeps the published date"],
        ["Performance results would not be credible", "Likely rerun of testing"],
      ),
      option(
        "o2",
        "Hold the pilot until the network is signed off stable",
        ["Credible test results", "Protects the business case"],
        ["Six week delay to the pilot", "Pilot cohort needs re-engaging"],
      ),
    ],
    decisionMaker: "Sienna Patel",
    forum: "Project Board",
    neededBy: "18/09/2026",
    status: "Pending",
    impact: impact(
      [false, "No scope change."],
      [false, "No additional cost."],
      [true, "Pilot start moves from 30/10/2026 to at least 04/12/2026."],
      [true, "Device experience benefit slips one quarter."],
    ),
    riskIds: ["vdi-dep-risk"],
    issueIds: [],
    changeIds: [],
    dependencyIds: ["dep-008"],
    benefitIds: ["ben-011"],
    actions: [],
  },
  {
    key: "copilot-licensing",
    projectId: "copilot-microsoft-integration",
    title: "Agree the Copilot licensing model for 2026/27",
    context:
      "Departmental demand exceeds the pilot allocation. Central funding, devolved purchase and a hybrid allocation model were compared.",
    options: [
      option(
        "o1",
        "Central funding for all staff",
        ["Simple to administer", "Equitable access"],
        ["£310k annual cost", "Low predicted utilisation in some areas"],
      ),
      option(
        "o2",
        "Devolved purchase by faculty",
        ["Cost follows demand"],
        ["Fragmented governance", "No institutional view of value"],
      ),
      option(
        "o3",
        "Hybrid: central core allocation plus devolved top-up",
        ["Predictable base cost", "Demand-led growth"],
        ["Needs an allocation rule", "Annual review overhead"],
      ),
    ],
    decisionMaker: "Martin Lowe",
    forum: "Digital Committee",
    neededBy: "11/09/2026",
    status: "Pending",
    impact: impact(
      [true, "Determines the rollout population."],
      [true, "Between £96k and £310k per year."],
      [false, "No change to the delivery plan."],
      [true, "Adoption level drives the time-back benefit."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: ["dep-012"],
    benefitIds: [],
    actions: [],
  },
  {
    key: "cis-priority",
    projectId: "cis-safeguards-cyber-security-improvements",
    title: "Confirm the CIS safeguard implementation order",
    context:
      "Implementation Group 1 safeguards can be sequenced by insurer priority or by internal risk score. The two orders differ for six safeguards.",
    options: [
      option(
        "o1",
        "Follow the insurer priority order",
        ["Fastest route to the insurance requirement"],
        ["Leaves two high internal risks open longer"],
      ),
      option(
        "o2",
        "Follow the internal risk score",
        ["Addresses the biggest exposure first"],
        ["Insurance evidence deadline is at risk"],
      ),
      option(
        "o3",
        "Merge both, insurer-critical first then risk score",
        ["Meets the deadline and the risk appetite"],
        ["Slightly longer overall programme"],
      ),
    ],
    chosenOptionId: "o3",
    rationale:
      "The merged order meets the insurer evidence deadline without leaving the two highest internal risks unaddressed into the new year.",
    decisionMaker: "Aisha Wallace",
    forum: "Programme Board",
    neededBy: "04/09/2026",
    decisionDate: "03/09/2026",
    status: "Made",
    impact: impact(
      [false, "No change to the safeguard set."],
      [false, "No change to cost."],
      [true, "Adds two weeks to the overall sequence."],
      [true, "Protects the cyber insurance compliance benefit."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: ["dep-005", "dep-007"],
    benefitIds: ["ben-006", "ben-007"],
    actions: [
      {
        id: "a1",
        description: "Reissue the safeguard implementation schedule",
        owner: "Harrison Shaw",
        dueDate: "18/09/2026",
        status: "Done",
      },
    ],
    evidenceLink: "Resilience Programme Board minutes 03-09-2026.docx",
  },
  {
    key: "network-vendor",
    projectId: "network-refresh-data-centre",
    title: "Accept the revised vendor delivery date for core switching",
    context:
      "Dataflow Systems has confirmed a four week slip on core switch delivery. Accepting it moves the Network stable milestone to 20 November.",
    options: [
      option(
        "o1",
        "Accept the revised date",
        ["No change of supplier", "Contract pricing retained"],
        ["Network stable milestone slips past two dependent projects' required-by dates"],
      ),
      option(
        "o2",
        "Source alternative hardware from a second supplier",
        ["Recovers the original date"],
        ["23% price premium", "Different support model"],
      ),
    ],
    chosenOptionId: "o1",
    rationale:
      "The premium for alternative hardware is not justified; the slip is manageable if the two dependent projects are told now and the VDI pilot is rescheduled.",
    decisionMaker: "Oliver Bennett",
    forum: "Project Board",
    neededBy: "16/09/2026",
    decisionDate: "16/09/2026",
    status: "Made",
    impact: impact(
      [false, "No scope change."],
      [false, "Contract price unchanged."],
      [true, "Network stable moves from 16/10/2026 to 20/11/2026."],
      [true, "Downtime reduction benefit starts one quarter later."],
    ),
    riskIds: ["vdi-dep-risk"],
    issueIds: [],
    changeIds: [],
    dependencyIds: ["dep-008", "dep-014"],
    benefitIds: ["ben-008"],
    actions: [
      {
        id: "a1",
        description: "Notify both dependent project managers and re-plan the VDI pilot",
        owner: "Aisha Khan",
        dueDate: "25/09/2026",
        status: "In progress",
      },
    ],
    evidenceLink: "Network Refresh Project Board minutes 16-09-2026.docx",
  },
  {
    key: "sits-integration",
    projectId: "sits-admissions-management",
    title: "Choose the SITS integration pattern for admissions automation",
    context:
      "Automation can integrate through the supported REST interface or through direct database views. The review board must set the pattern before build starts.",
    options: [
      option(
        "o1",
        "Supported REST interface",
        ["Vendor supported", "Survives upgrades"],
        ["Rate limits need managing", "Some fields unavailable"],
      ),
      option(
        "o2",
        "Direct database views",
        ["Full field coverage", "No rate limits"],
        ["Breaks on upgrade", "Outside vendor support"],
      ),
    ],
    decisionMaker: "Jacob Cole",
    forum: "Architecture Review Board",
    neededBy: "16/09/2026",
    status: "Pending",
    impact: impact(
      [true, "Determines which admissions steps can be automated."],
      [true, "Option 2 adds ongoing maintenance cost."],
      [true, "Option 1 adds four weeks of build."],
      [true, "Field coverage limits the automation benefit."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: ["dep-006"],
    benefitIds: [],
    actions: [],
  },
  {
    key: "asset-tooling",
    projectId: "asset-management",
    title: "Select the asset management tooling",
    context:
      "The asset baseline can be held in the existing service management platform or a dedicated discovery tool.",
    options: [
      option(
        "o1",
        "Extend the existing service management platform",
        ["No new supplier", "Single source for CIs"],
        ["Weaker discovery", "Manual reconciliation"],
      ),
      option(
        "o2",
        "Dedicated discovery tooling with a feed into service management",
        ["Accurate automated discovery"],
        ["£38k per year", "Integration to build and support"],
      ),
    ],
    chosenOptionId: "o2",
    rationale:
      "Manual reconciliation was the root cause of the previous asset baseline going stale within six months; automated discovery is the only option that sustains the benefit.",
    decisionMaker: "Sienna Patel",
    forum: "Architecture Review Board",
    neededBy: "21/08/2026",
    decisionDate: "20/08/2026",
    status: "Made",
    impact: impact(
      [true, "Adds an integration to the scope."],
      [true, "£38k recurring."],
      [true, "Adds three weeks."],
      [true, "Protects the asset accuracy benefit beyond closure."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: ["dep-004"],
    benefitIds: [],
    actions: [
      {
        id: "a1",
        description: "Add the discovery tool to the recurring revenue forecast",
        owner: "Elliot Reed",
        dueDate: "04/09/2026",
        status: "Done",
      },
    ],
    evidenceLink: "Architecture Review Board minutes 20-08-2026.docx",
  },
  {
    key: "windows-wave",
    projectId: "windows-11-rollout",
    title: "Approve a change freeze exemption for the December deployment wave",
    context:
      "Wave 4 falls inside the winter change freeze. Deferring it pushes 900 devices into the exam period.",
    options: [
      option(
        "o1",
        "Defer wave 4 to January",
        ["Respects the freeze"],
        ["900 devices deploy during exams", "Extended support cost continues"],
      ),
      option(
        "o2",
        "Seek a freeze exemption for low-risk faculty devices only",
        ["Avoids exam-period disruption", "Scoped risk"],
        ["Exemption sets a precedent", "Needs CAB approval"],
      ),
    ],
    decisionMaker: "Priya Ncube",
    forum: "Change Advisory Board",
    neededBy: "27/11/2026",
    status: "Pending",
    impact: impact(
      [false, "No scope change."],
      [true, "Deferral extends support costs by £14k."],
      [true, "Determines whether wave 4 lands in December or January."],
      [false, "No change to the benefit profile."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: [],
    benefitIds: ["ben-010"],
    actions: [],
  },
  {
    key: "benefits-attribution",
    programmeId: "automation",
    title: "Agree the attribution rule for shared service desk benefits",
    context:
      "Reduced service desk contacts is claimed by both the assistant and the service desk optimisation project. Double counting would overstate portfolio value by £96k.",
    options: [
      option(
        "o1",
        "Attribute wholly to the assistant",
        ["Simple"],
        ["Ignores process change contribution"],
      ),
      option(
        "o2",
        "Split 70/40 as currently recorded",
        ["Reflects both contributions"],
        ["Totals 110% and overstates value"],
      ),
      option(
        "o3",
        "Split 60/40 and record the rule in the benefits framework",
        ["Adds to 100%", "Repeatable for future shared benefits"],
        ["Requires both profiles to be reissued"],
      ),
    ],
    chosenOptionId: "o3",
    rationale:
      "A documented attribution rule prevents recurrence and brings the portfolio total back to a defensible figure.",
    decisionMaker: "Chris McDonald",
    forum: "Programme Board",
    neededBy: "14/08/2026",
    decisionDate: "13/08/2026",
    status: "Made",
    impact: impact(
      [false, "No delivery scope change."],
      [false, "No cost change."],
      [false, "No schedule change."],
      [true, "Reduces claimed portfolio benefit by £96k."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: [],
    benefitIds: ["ben-003", "ben-013"],
    actions: [
      {
        id: "a1",
        description: "Reissue both benefit profiles with the agreed attribution",
        owner: "Elliot Reed",
        dueDate: "28/08/2026",
        status: "Done",
      },
      {
        id: "a2",
        description: "Add the attribution rule to the benefits framework",
        owner: "Elliot Reed",
        dueDate: "16/10/2026",
        status: "In progress",
      },
    ],
    evidenceLink: "Benefits attribution paper 13-08-2026.pdf",
  },
  {
    key: "triage-assurance",
    projectId: "research-data-triage-ai",
    title: "Set the assurance level for research triage models",
    context:
      "Models that classify research data need an assurance level agreeing before they can run unsupervised.",
    options: [
      option(
        "o1",
        "Human in the loop for all classifications",
        ["Lowest risk"],
        ["Removes most of the time saving"],
      ),
      option(
        "o2",
        "Human review of low-confidence classifications only",
        ["Retains most of the benefit", "Focuses effort where it matters"],
        ["Needs a confidence threshold and monitoring"],
      ),
      option(
        "o3",
        "Fully automated with quarterly audit",
        ["Maximum time saving"],
        ["Unacceptable to the research ethics panel"],
      ),
    ],
    decisionMaker: "Daniel Mercer",
    forum: "Digital Committee",
    neededBy: "16/10/2026",
    status: "Pending",
    impact: impact(
      [true, "Determines the review workflow."],
      [false, "No cost change."],
      [false, "No schedule change."],
      [true, "Directly sets the triage time saving and the assurance disbenefit."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: [],
    benefitIds: ["ben-018", "ben-020"],
    actions: [],
  },
  {
    key: "planner-standard",
    programmeId: "standards",
    title: "Standardise on Planner Premium for medium and large projects",
    context:
      "Three task tools are in use across the portfolio, which prevents a single view of effort and progress.",
    options: [
      option(
        "o1",
        "Mandate Planner Premium for medium and large projects",
        ["Single reporting view", "Licences already held"],
        ["Migration effort for eight projects"],
      ),
      option(
        "o2",
        "Allow any tool with a reporting export",
        ["No migration"],
        ["Reporting stays manual", "No effort roll-up"],
      ),
    ],
    chosenOptionId: "o1",
    rationale:
      "The reporting overhead of three tools already exceeds the migration effort, and the licences are sunk cost.",
    decisionMaker: "Chris McDonald",
    forum: "Programme Board",
    neededBy: "24/07/2026",
    decisionDate: "23/07/2026",
    status: "Superseded",
    impact: impact(
      [false, "No project scope change."],
      [false, "Licences already held."],
      [true, "Two weeks of migration per project."],
      [false, "No benefit impact."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: [],
    benefitIds: [],
    actions: [],
    evidenceLink: "Standards Programme Board minutes 23-07-2026.docx",
  },
  {
    key: "planner-standard-2",
    programmeId: "standards",
    title: "Standardise on Planner Premium for all projects with more than 20 tasks",
    context:
      "The tier-based rule left several task-heavy small projects reporting manually. The board asked for a size-based rule instead.",
    options: [
      option(
        "o1",
        "Keep the tier-based rule",
        ["Already communicated"],
        ["Task-heavy small projects stay outside reporting"],
      ),
      option(
        "o2",
        "Switch to a task-count rule of 20 or more tasks",
        ["Captures every project that materially affects reporting"],
        ["Requires a second round of communications"],
      ),
    ],
    chosenOptionId: "o2",
    rationale:
      "Tier is a proxy for governance, not for reporting load; a task-count rule captures the projects that actually affect the portfolio view.",
    decisionMaker: "Chris McDonald",
    forum: "Programme Board",
    neededBy: "04/09/2026",
    decisionDate: "03/09/2026",
    status: "Made",
    impact: impact(
      [false, "No project scope change."],
      [false, "No cost change."],
      [true, "Adds four small projects to the migration list."],
      [false, "No benefit impact."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: [],
    benefitIds: [],
    actions: [
      {
        id: "a1",
        description: "Reissue the task tooling standard and notify affected project managers",
        owner: "Amelia Price",
        dueDate: "25/09/2026",
        status: "Open",
      },
    ],
    evidenceLink: "Standards Programme Board minutes 03-09-2026.docx",
  },
  {
    key: "identity-recovery-scope",
    projectId: "identity-recovery-service",
    title: "Confirm whether the recovery service covers student identities in phase one",
    context:
      "Phase one was scoped for staff identities. Including students triples the directory size and needs a second recovery environment.",
    options: [
      option(
        "o1",
        "Staff only in phase one",
        ["Deliverable within the approved budget"],
        ["Student services remain exposed until phase two"],
      ),
      option(
        "o2",
        "Staff and students in phase one",
        ["Removes the exposure in one step"],
        ["£120k additional cost", "Adds four months"],
      ),
    ],
    decisionMaker: "Aisha Wallace",
    forum: "Digital Committee",
    neededBy: "20/11/2026",
    status: "Pending",
    impact: impact(
      [true, "Determines the phase one population."],
      [true, "Up to £120k."],
      [true, "Up to four months."],
      [true, "Changes the recovery time benefit profile."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: ["dep-018"],
    benefitIds: [],
    actions: [],
  },
  {
    key: "dfs-retention",
    projectId: "dfs-migrations-data-retention",
    title: "Approve the file share retention schedule",
    context:
      "The proposed schedule deletes unaccessed files after seven years. Two faculties have asked for an exemption.",
    options: [
      option(
        "o1",
        "Apply the schedule with no exemptions",
        ["Maximum storage reduction", "Single rule to operate"],
        ["Faculty objection", "Possible research data loss"],
      ),
      option(
        "o2",
        "Apply the schedule with a documented research exemption route",
        ["Protects research data", "Keeps most of the reduction"],
        ["Exemption register to maintain"],
      ),
    ],
    decisionMaker: "Daniel Mercer",
    forum: "Digital Committee",
    neededBy: "15/01/2027",
    status: "Pending",
    impact: impact(
      [true, "Sets which shares are in scope."],
      [true, "Exemptions reduce the storage saving by an estimated £18k."],
      [false, "No schedule change."],
      [true, "Reduces the storage cost benefit."],
    ),
    riskIds: [],
    issueIds: [],
    changeIds: [],
    dependencyIds: ["dep-009"],
    benefitIds: [],
    actions: [],
  },
];

export const decisions: Decision[] = seeds.map((seed, index) => {
  const { key: _key, ...rest } = seed;
  return {
    ...rest,
    id: `dec-${String(index + 1).padStart(3, "0")}`,
    reference: `DEC-${String(index + 1).padStart(3, "0")}`,
  };
});

// Link the superseded planner standard to the decision that replaced it.
const superseded = decisions.find((item) => item.status === "Superseded");
const replacement = decisions.find((item) =>
  item.title.startsWith("Standardise on Planner Premium for all projects"),
);
if (superseded && replacement) {
  superseded.supersededById = replacement.id;
  replacement.supersedesId = superseded.id;
}

export const nextDecisionReference = () => `DEC-${String(decisions.length + 1).padStart(3, "0")}`;

interface AssumptionSeed {
  assumption: string;
  projectId?: string;
  programmeId?: string;
  owner: string;
  rationale: string;
  validationDate: string;
  status: Assumption["status"];
  raisedIssueId?: string;
  notes?: string;
}
const assumptionSeeds: AssumptionSeed[] = [
  {
    assumption:
      "The service desk can release two analysts for two days a week during the assistant pilot.",
    projectId: "ebbot-chatbot",
    owner: "Priya Ncube",
    rationale:
      "Agreed verbally at the mobilisation workshop; not yet reflected in the team's rota.",
    validationDate: "02/10/2026",
    status: "Open",
  },
  {
    assumption:
      "Knowledge articles will be reviewed and owned by the publishing service, not by the project.",
    projectId: "ebbot-chatbot",
    owner: "Eva Chen",
    rationale: "The operating model places content ownership with the service owner.",
    validationDate: "28/08/2026",
    status: "Validated",
    notes: "Confirmed in the service owner forum on 27/08/2026.",
  },
  {
    assumption:
      "Core switch hardware will be delivered within the contracted eight week lead time.",
    projectId: "network-refresh-data-centre",
    owner: "Aisha Khan",
    rationale: "Lead time stated in the framework contract.",
    validationDate: "11/09/2026",
    status: "Invalidated",
    raisedIssueId: "issue-network-leadtime",
    notes:
      "Vendor confirmed a four week slip on 14/09/2026. Issue raised and the dependent VDI pilot re-planned.",
  },
  {
    assumption: "HR will supply a clean joiner feed with no manual corrections needed.",
    projectId: "account-creation-automation",
    owner: "Sofia Rahman",
    rationale: "The HR data quality project completed in July 2026.",
    validationDate: "16/10/2026",
    status: "Open",
  },
  {
    assumption:
      "Faculties will fund Copilot licences above the central allocation from their own budgets.",
    projectId: "copilot-microsoft-integration",
    owner: "Martin Lowe",
    rationale: "Stated position of the Finance Business Partners, pending the licensing decision.",
    validationDate: "09/10/2026",
    status: "Open",
  },
  {
    assumption:
      "The insurer will accept CIS Implementation Group 1 evidence without an independent audit.",
    projectId: "cis-safeguards-cyber-security-improvements",
    owner: "Harrison Shaw",
    rationale: "Broker confirmed the evidence format in the renewal discussion.",
    validationDate: "18/09/2026",
    status: "Validated",
    notes: "Broker confirmed in writing on 17/09/2026.",
  },
  {
    assumption: "No more than 12% of devices will need a hardware replacement to run Windows 11.",
    projectId: "windows-11-rollout",
    owner: "Freya Walsh",
    rationale: "Based on the readiness scan completed in May 2026.",
    validationDate: "23/10/2026",
    status: "Open",
  },
  {
    assumption:
      "Research workloads can tolerate cloud archive retrieval times for data older than 18 months.",
    projectId: "storage-expansion",
    owner: "Daniel Brooks",
    rationale: "Sampled access patterns from the research file shares.",
    validationDate: "20/11/2026",
    status: "Open",
  },
  {
    assumption:
      "The existing service catalogue can be cleaned by the service desk without additional resource.",
    programmeId: "standards",
    owner: "Priya Ncube",
    rationale: "Estimated at 12 days of effort across six weeks.",
    validationDate: "16/09/2026",
    status: "Invalidated",
    raisedIssueId: "issue-catalogue-resource",
    notes:
      "Effort re-estimated at 31 days. Issue raised and the clean-up date moved to 06/11/2026.",
  },
  {
    assumption: "Benefit owners will submit quarterly measurements without PMO chasing.",
    programmeId: "standards",
    owner: "Elliot Reed",
    rationale: "Set out in the benefits framework and agreed at handover.",
    validationDate: "30/09/2026",
    status: "Open",
  },
];

export const assumptions: Assumption[] = assumptionSeeds.map((seed, index) => ({
  id: `asm-${String(index + 1).padStart(3, "0")}`,
  reference: `ASM-${String(index + 1).padStart(3, "0")}`,
  ...(seed.projectId ? { projectId: seed.projectId } : {}),
  ...(seed.programmeId ? { programmeId: seed.programmeId } : {}),
  assumption: seed.assumption,
  owner: seed.owner,
  rationale: seed.rationale,
  validationDate: seed.validationDate,
  status: seed.status,
  ...(seed.raisedIssueId ? { raisedIssueId: seed.raisedIssueId } : {}),
  ...(seed.notes ? { notes: seed.notes } : {}),
}));

export const decisionStatuses: DecisionStatus[] = ["Pending", "Made", "Superseded", "Reversed"];
