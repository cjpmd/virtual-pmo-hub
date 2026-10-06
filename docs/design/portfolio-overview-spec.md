# Portfolio overview redesign: build spec

Reference design: `docs/design/portfolio-overview-design.html` (open it in a browser; all data in it is example data). This spec says how to build it. Where the reference and the spec disagree, the spec wins.

## 1. Goal

Rebuild the portfolio overview to the reference design, as reusable components that the programme and project pages will also use. Live status first; the board-report view is phase 2 (section 8).

## 2. Design tokens

Add these as design tokens (CSS variables + Tailwind theme), not hex values in components.

| Token | Light | Dark |
|---|---|---|
| bg | #F4F6FA | #0B111C |
| panel | #FFFFFF | #111A29 |
| panel-2 | #EEF3FF | #18233A |
| line | #E4E8EF | #1F2A3C |
| track | #EDF0F5 | #1A2436 |
| text | #101828 | #E7ECF4 |
| muted | #5B6577 | #93A0B5 |
| accent | #2E6BE6 | #4C86FF |
| good | #1B9A4B | #35C26B |
| warn | #F2A516 | #F2B33D |
| orange | #E0702E | #F28A4A |
| bad | #D93B3B | #F0625E |
| bad-text | #B42828 | #F47A76 |

Chart series colours (same in both themes): spend #4C86FF, tasks #A78BFA, milestones #2DD4BF, projects green #F2B33D, plan = muted dashed.

Rules:
- Fonts: Geist for text, Geist Mono for every number. Numbers use `font-variant-numeric: tabular-nums` and are right-aligned in tables.
- **Colour means good or bad, never up or down.** A rising forecast or overspend is bad (red); a falling one is good (green).
- The top band (header, summary strip, chart, signals) always uses the dark tokens. The rest of the page follows the user's theme.
- Status is never colour alone: always a label, a count or a shape (ring vs dot) as well.

## 3. Page layout, top to bottom

1. **Header** (dark band).
2. **Summary strip** (dark band): approved budget, forecast, variance, spent to date, projects on track, milestones due in 30 days, report-vs-data gaps. Each shows its change since last month.
3. **Progress chart + Signals** (dark band), side by side; stacks on narrow screens.
4. **Programme strip**: "Whole portfolio" card plus one card per programme, full width, wraps on small screens. Selecting a card filters everything below it (and the chart and signals) to that programme. URL carries the selection (`?programme=<code>`).
5. **Headline row**: headline sentence, Live / Board report switch, Export board pack button.
6. **Project watchlist** (left, wide) with **Delivery health** and **Health by dimension** stacked on the right.
7. **Budget, spend and forecast by programme** and **Milestone slippage**, side by side.
8. **Status bar** (sticky bottom): live dot, data as-of time, closed/open months, active project count.

## 3a. Navigation

The app keeps its existing left-hand navigation (Home, Portfolio, Delivery, Resources, Governance, Benefits, Insights, Settings). The design's top-bar links in the reference file are placeholders for the tabs *within* a section, not a replacement for the side navigation.

- **Left rail = sections.** Restyle it as a slim icon rail using the dark tokens, so it joins the dark top band and forms one frame around the page. Collapsed by default at 64px (icon plus tooltip and accessible label); expands to 220px with labels via a toggle, and the choice is remembered per user. On wide screens (1600px+) it may default to expanded.
- **Top tabs = pages within the current section.** For Portfolio: Overview, Programmes, Projects, Collections, Roadmap, Requests (as today). They sit in the dark header band.
- **Header right:** workspace switcher, search (Cmd/Ctrl K), notifications, theme, user menu.
- The programme strip, chart, watchlist and everything else lay out in the space to the right of the rail; widths in the reference assume the rail is collapsed.
- Below 900px the rail becomes a bottom sheet / hamburger menu.

## 4. Components

Build each as its own component under `src/components/overview/`, taking a programme filter and theme, so programme and project pages can reuse them.

**SummaryStrip.** Cells of label, value, change. Change colour follows the good/bad rule per metric (define the direction per metric in one place).

**ProgressChart.** The centrepiece. Every series is plotted as **% of its own full-year plan**, which is what lets different measures share one axis.
- Series (toggle chips, each with its current value):
  - Plan: the budget's cumulative phasing, as % of FY budget (dashed reference line).
  - Spend: cumulative actuals ÷ FY budget; forecast continues dotted to year end.
  - Tasks done: completed work items ÷ work items due this FY; forecast dotted from current run rate.
  - Milestones: signed off ÷ milestones baselined for this FY; forecast dotted from current forecast dates.
  - Projects green: % of active projects evidenced green, from `health_snapshots` (month-end values).
  - Red risks (off by default): count, on a secondary right-hand axis when switched on.
  - Capabilities delivered: capabilities delivered and accepted ÷ capabilities due this FY; forecast dotted from forecast dates. On by default in Overlay (it's the earliest benefits signal).
  - Outcomes achieved (off by default in Overlay): outcomes achieved ÷ outcomes due this FY.
  - Benefits realised (off by default in Overlay): realised value ÷ FY profile.
- Tabs are presets of the chips: Overlay (spend, tasks, milestones, projects green), Spend (plan, spend, forecast), Delivery (tasks, milestones), Health (projects green plus one line per dimension), Benefits (capabilities delivered, outcomes achieved, benefits realised, plus % of each that is green: the full benefits chain on one view), Timeline (milestones plus event markers, larger).
- Event markers: diamonds along the top for key milestones and gates (milestones flagged as key) and committee dates; label on hover/focus.
- "Today" line; the forecast region is shaded.
- Gap callout: when spend leads milestones by more than 15 points, draw the bracket with the gap in points.
- Hover/focus shows a crosshair with every visible series' value for that month. Keyboard: arrow keys move the crosshair.
- Range: FY (default), last 12 months, all.
- Accessible: a visually hidden table of the same data, plus an `aria-label` summary sentence.

**SignalsList.** Generated by rules, newest first, max 5, each linking to its source:
- spend leads milestones by > 15 points (portfolio or programme)
- a project's evidenced health changed this month
- forecast moved more than the org's threshold (default £25k or 5%)
- report vs data disagree (from `status_reports` declared vs evidenced)
- milestones forecast to land < 90% of this year's plan
- a capability or outcome turned amber or red, or a capability is past its target date and not accepted

**ProgrammeCard.** Name, forecast vs budget (good/bad colour), on-track count, health bar, 6-month sparkline of % green. Selected state: accent border, `aria-current`.

**ProjectWatchlist.** Grouped by programme with a group row (name, on-track count, forecast vs budget). Columns: project, report ring + data dot, vs budget, change this month, 6-month trend sparkline. Sort tabs: biggest overspend, biggest movers, report vs data. Groups collapse. Row click opens the project.

**DeliveryHealth, HealthByDimension, BudgetByProgramme, MilestoneSlippage.** Keep the existing chart designs; restyle to the tokens. Health by dimension reads month-end values from `health_snapshots`.

**StatusBar.** As-of time is the latest data refresh, not the page load time.

**Dependency:** the capability and outcome series need the benefits pathway work (capability and outcome dates, status, RAG). Build the chart so those series are hidden until that data exists.

## 5. Headline sentence

Generated by rules, not AI: pick the two most significant findings (largest overspend programme, largest health change, spend-vs-delivery gap) and fill a template. Editable by PMO in board-report mode (phase 2). Stored per month so the board pack keeps the wording that was agreed.

## 6. Data and performance

- One RPC per load: `get_portfolio_overview(p_workspace uuid, p_programme uuid default null, p_range text default 'fy')` returning all strip values, chart series, signals, cards and watchlist rows as JSON. No per-widget waterfalls.
- Measured as a signed-in user through RLS (rule from the RLS fix): under 500 ms on the demo org, and report the 500-project org timing.
- Spend and plan series need the financials work (F2). Until F2 lands, build the chart with the spend series reading the current project figures and mark it in code as temporary; swap to the financials views in F2.

## 7. Responsive

Desktop first. Below 1100px the chart and signals stack; the watchlist and side column stack; programme cards wrap. Below 640px the watchlist hides the 6-month column. Nothing scrolls sideways except the watchlist table inside its own container.

## 8. Phase 2 (not this build)

Board report view: the Live / Board report switch rearranges the same components into the headline-led layout (one headline per section above each chart) and Export board pack produces a PDF of it, saved as an issued committee pack (immutable, per the committee_packs table).

## 9. Stages

1. Tokens + SummaryStrip + StatusBar + layout shell with the dark band. Stop with screenshots in light and dark.
2. ProgressChart with all series, tabs, markers, crosshair, accessible table. Stop.
3. ProgrammeCard strip with filtering, ProjectWatchlist, SignalsList. Stop.
4. Restyle the four existing charts, headline sentence, the RPC and timings, advisors. Stop.
