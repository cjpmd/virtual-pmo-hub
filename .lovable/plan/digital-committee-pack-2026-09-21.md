# Digital Committee pack

## What will be built
- Replace the Collections placeholder with a collection list and a Digital Committee detail page showing its eight projects, health, budget, and saved packs.
- Add **Generate committee pack** to open a full-screen, paginated preview using the Digital Committee data.
- Build a cover page with committee name, meeting date, and generated timestamp.
- Build a portfolio summary page with project count, RAG totals, budget, forecast, and a concise programme breakdown.
- Build an exceptions page containing every amber or red project and its latest status commentary, with sensible mock commentary where a project has no submitted report.
- Build one highlight-report page per collection project with health dimensions, delivery facts, financials, milestones, risks, and latest progress narrative.
- Add non-functional **Export to PowerPoint** and **Export to PDF** actions.
- Add **Save snapshot** so the generated pack closes and immediately appears in the collection page’s Past packs list for this prototype session.

## Interaction details
- The full-screen preview will include previous/next controls, page count, page thumbnails, and a close action.
- The meeting date will default to 21/09/2026 and remain editable before saving.
- Saved snapshots will include meeting date, generated time, page count, and status.
- The preview will adapt to smaller screens without hiding page content or actions.

## Technical details
- Add collection lookup and collection metrics to the typed service layer.
- Create dedicated `/collections/` and `/collections/$collectionId` routes so navigation remains direct and shareable.
- Keep generated and saved packs in browser memory only; exports remain visibly labelled as prototype actions.
- Use existing project health calculations, reports, and semantic design tokens throughout.

## Validation
- Verify collection navigation, pack generation, all page types, pagination, date editing, snapshot saving, and narrow-screen behaviour.
- Confirm export actions do not download files and the preview produces no browser errors.
