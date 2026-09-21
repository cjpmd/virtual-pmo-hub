# Plan: Benefits Management module

## What will be added
- Add a major **Benefits** area to the main navigation with four sub-pages: Register, Map, Realisation, and Value Dashboard.
- Seed realistic university IT benefits data aligned to MSP, IPA and Green Book practice: strategic objectives, benefits, disbenefits, measures, measurement records, and reviews.
- Add Benefits tabs to project and programme pages so linked benefits are visible where delivery teams already work.

## Data and rules
- Extend the typed mock data model with strategic objectives, benefits, benefit measures, target profiles, measurement records, and reviews.
- Seed six DTS 2025/26 strategic objectives and 21 total records: 18 benefits and 3 disbenefits across the named examples and six other projects.
- Add service functions for benefit roll-ups, planned value, realised value, percentage realised, measurement due dates, benefit health, duplicate-measure warnings, attribution warnings, and lifecycle validation.
- Enforce these lifecycle messages in the UI:
  - Validated requires a business owner and eligibility confirmation.
  - Planned requires at least one measure with a baseline and target profile.
  - Realised or Partially realised requires a post-implementation review.

## Benefits pages
- **Register**: monday-style board with the requested columns and seeded saved views: All benefits, By strategic objective, By programme, Cash-releasing, Disbenefits, Measurements overdue, Unowned or unvalidated, and In realisation (closed projects).
- **Map**: visual relationship view connecting objectives, benefits/disbenefits, and enabling projects with attribution percentages and warning banners.
- **Realisation**: measurement cadence view with overdue measurements, upcoming records, validation status, planned vs actual progress, and review prompts.
- **Value Dashboard**: KPI cards and charts for total planned value, realised value, confidence mix, status mix, category mix, and objective contribution.

## Benefit Profile page
- Add a detail page for each benefit with lifecycle stepper, confidence and owner in the header.
- Include sections for description/classification, strategic contribution, enabling project attribution, measures with target profile tables and planned-vs-actual line charts, measurement history, dependencies, reviews, and activity log.
- Add a **Record measurement** side panel that captures a mock measurement locally and shows validation state.

## Project and programme integration
- Add a **Benefits** tab to project detail pages showing linked benefits, planned vs realised summary, and a benefit health pill.
- Add a **Benefits** tab to programme detail pages with the same roll-up for all projects in the programme.
- Show amber warning banners where duplicate measures are detected or attribution exceeds 100%.

## Technical notes
- Keep all data mock-only and typed, with components reading through service functions so it remains swappable later.
- Reuse the existing BoardWorkspace, HealthPill, KPI card, chart, route metadata, and UK date/currency conventions.
- Use TanStack Router file routes for `/benefits`, `/benefits/map`, `/benefits/realisation`, `/benefits/dashboard`, and `/benefits/$benefitId`.
- Verify type safety and browser rendering for the main Benefits flow, project/programme tabs, and a mobile viewport.
