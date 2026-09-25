# Microsoft 365 connection and self-serve sign-up (prototype)

Mock screens that follow the Claude walkthrough. Everything is simulated, but it is built so a real Microsoft connection can replace the mocks later without changing the screens.

## 1. Self-serve sign-up journey
- **Start page** (`/signup`): a "Start free trial" page with a "Sign in with Microsoft" button. Work accounts only, with a mock message if someone uses a personal account.
- **Workspace detection**: the organisation name and domain are filled in from the mock Microsoft account. If a workspace already exists for that organisation, offer "Join University of X's workspace" instead of creating a duplicate.
- **Five-minute setup wizard**, with everything pre-filled:
  - data region (UK or EU)
  - currency
  - financial year start
  - lifecycle template: University IT six-phase, PRINCE2-style, Agile or Custom
- **Choose a path**: "Explore with sample data" (goes to the current demo) or "Connect Microsoft 365".

## 2. Connect Microsoft 365
- A toggle switches between two roles:
  - **Admin**: shows a mock Microsoft consent screen that lists each permission and why it is needed, then shows as connected.
  - **Non-admin**: shows "This needs approval from your IT admin" with a Send request button, a preview of the one-page explanation the admin receives, and a pending status. Native tasks keep working in the meantime.
- **Discovery**: lists the Planner Basic plans and Planner Premium plans the user can see, grouped by Microsoft 365 group or environment (for example `dundee.crm11.dynamics.com`).
- **Link plans to projects**: suggested one-to-one matches (Accelerator projects match on project ID). You can accept, change or skip each match. Linked projects switch to Planner as their task source.

## 3. Integrations page (Settings > Integrations)
- **Connection card**: organisation, status (Connected / Needs reconnect / Pending approval), granted permissions, environments, and a "Reconnect Microsoft 365" action.
- **Linked plans table**: project, plan type, last sync, sync mode (polling or live updates), health, and a "Sync now" button that briefly shows "Syncing…".
- **Pending changes**: edits waiting to be sent to Planner, with status, retry attempts and the last error.
- **Conflicts**: Planner wins by default. Each conflict shows the field, both values and who changed it, with Keep Planner / Reapply mine actions.
- **Sync log**: filterable events such as reads, writes, throttling back-offs, failed updates ("open in Planner to check") and deleted-in-Planner items.
- **People directory**: last nightly directory sync, with the number of people imported.

## 4. Changes to the Tasks tab for Planner-connected projects
- Planner Premium projects show read-only calculated fields (summary dates, remaining effort) with a lock icon and a tooltip.
- Status chips for sync failed, conflict and reconnect needed, plus an "Open in Planner" link.

## Technical details
- New mock data for connections, discovered plans, plan links, pending changes, conflicts and the sync log in `src/data/integrations.ts`, typed in `types.ts`.
- `src/services/integrations.ts` with swappable functions: `getConnection`, `startConsent`, `requestAdminConsent`, `discoverPlans`, `linkPlan`, `syncNow`, `listOutbox`, `listConflicts`, `resolveConflict` and `listSyncLog`. State is kept in the browser, the same way settings are.
- Routes: `/signup`, `/signup/setup`, `/connect-microsoft` and `/settings/integrations`. Components follow the Portfolio design (`MetricCard`, `BoardWorkspace`, `ChartCard`).
- The new route files are `signup.tsx`, `signup.setup.tsx` and `connect-microsoft.tsx`. The sign-up pages are shown without the app sidebar.
- A short "Going live" note on the Integrations page lists the real steps still needed: app registration, permissions, Dataverse app user and the test environment.
