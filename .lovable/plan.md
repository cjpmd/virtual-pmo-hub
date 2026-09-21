# Roadmaps

## Goal
Add a portfolio Roadmaps area that replaces Microsoft Roadmap with two realistic, interactive mock roadmaps and committee-ready presentation.

## What will be built
- Add typed roadmap, row, item, and key-date models behind the existing service layer.
- Seed “DTS 2025/26 Roadmap” and “Summer Priorities 2026”, mixing project-linked items with standalone planned initiatives.
- Add Roadmaps to the main navigation and create a dedicated `/roadmaps` page with its own page metadata.
- Add a roadmap switcher, owner details, legend, month/quarter/year zoom controls, and regrouping by programme, collection, priority, or project manager.
- Render an August–July financial-year timeline with time headers, financial-year markers, a 21/09/2026 today line, status-coloured item bars, and progress fill.
- Keep linked item dates and health derived from project data, show a lock indicator, and link them to project pages.
- Show standalone items with dashed outlines and support pointer dragging plus left/right resizing; changes stay local to the prototype.
- Add key-date flags to the timeline and a panel listing each date, status, and owner.
- Add a full-screen Present mode with simplified controls and clean committee-focused framing.

## Technical details
- Reuse the existing typed mock data and `src/services` boundary; page code will not import raw data.
- Derive project progress from task completion or project stage, and map existing project health to roadmap statuses.
- Use native pointer events for constrained drag/resize, snapping dates to the active zoom interval.
- Preserve UK dates, light/dark themes, semantic health tokens, and responsive horizontal timeline scrolling.
- Validate route generation, type safety, linked/standalone behaviour, all grouping and zoom options, presentation mode, and desktop/mobile rendering.