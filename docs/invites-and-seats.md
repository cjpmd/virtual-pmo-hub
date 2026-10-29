# Invites, seats and join requests (work package 2.1)

Status: the database design is in `docs/sql/2-1-invites-seats.sql` (proposal, awaiting approval).
The rest of this document (Stripe and Resend settings, the manual test checklist) is written
with the build.

## Seats

- The UI shows three tiers over the five database roles: **admin** (organisation admin),
  **member** (organisation contributor, manager or PMO, or an organisation viewer who is
  contributor or above in any workspace) and **viewer** (everyone else).
- Admins and members use a paid seat. Viewers are free.
- Seats used = paid members + pending, unexpired invitations for a paid role.

## What a free viewer can do

Principle: a viewer can act on items personally assigned to them, but can't run or edit shared
work. The database enforces this (RLS and the RPC permission checks), not only the UI.

**Free for viewers**

| Action | Enforced by |
|---|---|
| View projects, programmes, portfolios, dashboards, boards and reports in their workspaces | read policies (`my_workspace_ids()`) |
| Record, defer or reverse a decision where they are the named decision maker | `private.can_record_decision` (decision-maker branch) |
| Create, edit and submit business cases on their own requests (demand intake) | `private.my_authored_request_ids`, `private.my_editable_business_case_ids` |
| Add, change and remove their own leave entries | `resource_leave` policies (`my_resource_ids()`) |
| Create, edit and delete their own personal dashboards and saved views (not shared) | `dashboards` / `saved_views` policies |
| Favourites and their own profile | `user_favourites` / `profiles` policies |

**Needs a paid seat (member or admin)**

| Action | Enforced by |
|---|---|
| Create or edit any project, programme, portfolio, RAIDD, milestone, task, status report or other record | write policies (`my_workspace_ids('contributor')` and above, `my_editable_project_ids()`) |
| Edit meetings or record decisions as forum chair | `private.is_forum_chair` |
| Edit a programme office note as programme manager | `private.can_edit_programme_note` |
| Accept or decline a task offer | `work_item_offers_update` policy |
| Create or share a shared dashboard or saved view | `dashboards` / `saved_views` policies |
| Upload attachments, evidence or documents | storage policies (contributor and above) |

## Join domains: future option

Today an admin can add only the exact domain of their own confirmed email, or the Microsoft
(Entra) tenant they signed in from. Proving control of any other domain by a DNS TXT record is a
possible later addition.
