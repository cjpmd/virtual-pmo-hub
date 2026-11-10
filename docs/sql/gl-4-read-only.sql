-- GL-4 Read-only when a trial or subscription lapses (docs/go-live-plan.md).
-- Applied 10/11/2026 as migration 20261110093319_gl_4_read_only (approved with approve-as-viewer
-- added). Round 2 (09/11/2026), with your decisions: Outsider backfilled to today + 14 days;
-- user_favourites writable; declining join requests and free viewer invites allowed; storage
-- covered; E2E test organisation trial extended by a year; edge functions audited; bulk write
-- cost measured.
--
-- Evidence (live project xvdlmtkzfmbcegkmampz, read-only, 09/11/2026)
-- ---------------------------------------------------------------------
-- private.organisation_is_writable(org) (migration 2_3_stripe_billing) has no callers.
-- organisation_subscriptions on live:
--   University                 demo   status null  trial_ends_at null        writable (demo)
--   VPMO Test Outsider Org     trial  status null  trial_ends_at null        writable FOREVER (bug)
--   Originoverthrow            trial  status null  trial_ends_at 12/11/2026  left as it is (you decide)
--   E2E 2.1 Test Organisation  trial  status null  trial_ends_at 12/11/2026  extended a year (§2)
-- The bug: for a trial row with trial_ends_at null every clause is false or NULL, so the whole
--   OR is NULL, and the outer coalesce(..., true) (meant for "no subscription row") turns it
--   into true. Same for past_due with current_period_end null: coalesce(now()) gives a grace
--   period that never ends. create_organisation already sets trial_ends_at = now() + 14 days
--   (since migration auth_email_microsoft), so only the one old row is affected.
--
-- Table inventory (public, 143 tables):
--   * 139 have organisation_id (136 get the trigger; 3 are exempt, below) (all tenant tables, including those without workspace_id:
--     benefit_periods, business_case_templates, exchange_rates, financial_periods,
--     gate_criteria, holiday_*, lifecycle_phases, lookup_values, ms_connections,
--     organisation_* (6), project_templates, rating_schemes, resource_*, resources,
--     risk_matrices, user_favourites, workspaces). Tables that fill organisation_id from their
--     parent do it in a BEFORE trigger (<table>_00_tenant_guard, workspace_members_fill_org),
--     so the read-only trigger is named zz_org_read_only: BEFORE triggers fire in name order
--     and every existing one starts with its table name (latest today: workspaces_updated_at),
--     so it runs last and sees the filled-in organisation_id.
--   * 4 don't: organisations (the trigger reads its id instead), profiles (personal, not
--     covered), stripe_webhook_events and resend_webhook_events (service role only, no org).
--   * storage.objects: buckets org-assets, attachments, evidence and documents keep objects
--     under <organisation_id>/...; their insert, update and delete policies gain a writable
--     check (§9). report-pdfs has no client write policy (service role only).
--
-- How a system write is told from a user write: auth.uid() is null and the JWT role isn't anon.
--   pg_cron jobs run as postgres with no JWT; edge functions using the service role send a JWT
--   with role service_role and no sub. A signed-in user always has a sub, whether they write
--   directly (current_user authenticated) or through a SECURITY DEFINER RPC (current_user is
--   the owner, but request.jwt.claims still carries their sub), so definer RPCs are covered.
--   current_user can't be used: inside a definer RPC it is postgres, the same as cron.
--   An anon caller is treated as a user (refused), not as the system. In storage, the service
--   role bypasses RLS, so system uploads (the server PDF) are unaffected.
--
-- Writes that still work when read-only
--   * System writes (cron health refresh, snapshots, metric and forecast history, report-notify,
--     stripe-webhook, resend-webhook): auth.uid() null, allowed.
--   * organisation_subscriptions, audit_log, user_favourites: no trigger. Billing is service
--     role; the audit log only records allowed actions; favourites are personal (your call).
--   * profiles: no trigger (name, email sync, last_organisation_id).
--   * Allowed row changes, decided by what the row change looks like, not by a session setting
--     (AGENTS.md: no session setting may bypass a rule). All in §5:
--       Getting under the seat count
--         organisation_members  DELETE (remove_member); UPDATE that only sets role to viewer.
--         workspace_members     DELETE (cascade); UPDATE that only sets role to viewer.
--         resources             UPDATE that only clears profile_id (ON DELETE SET NULL cascade).
--         organisation_invites  UPDATE that only revokes a pending invite (paid or viewer).
--       Free viewer invites (create_invites, resend_invite, send-invite, accept_invite)
--         organisation_invites            INSERT with role viewer; UPDATE of a viewer invite
--                                         that keeps it viewer (token, resend, sent, accepted).
--         organisation_invite_workspaces  INSERT for a viewer invite.
--         organisation_members            INSERT with role viewer (accepting).
--         workspace_members               INSERT with role viewer (accepting).
--         resources                       the link made for a new viewer member: INSERT of a
--                                         non-bookable resource for them, or UPDATE that only
--                                         sets an empty profile_id to them.
--         organisation_join_requests      pending -> withdrawn (accepting withdraws the
--                                         person's pending request).
--       Join requests (decide_join_request)
--         organisation_join_requests      pending -> declined, or pending -> approved with
--                                         decided_role viewer (the same rule as viewer
--                                         invites; add_member then inserts viewer rows),
--                                         touching only status, decided_role, decided_by and
--                                         decided_at. Withdrawing your own request
--                                         (pending -> withdrawn) is allowed too.
--         Approving with a paid role stays refused.
--   * Settings › Subscription: checkout and portal run in edge functions; the subscription row
--     is written by stripe-webhook and create-checkout-session (service role). Not refused.
--   Everything else by a signed-in user (or anon) in a read-only organisation is refused with
--   errcode P0001, hint 'org_read_only': create/edit any record, settings (organisations
--   UPDATE), paid invites, accepting a paid invite, raising a member's role, new join
--   requests, report lifecycle RPCs (submit/approve/publish), AI drafts, file uploads.
--
-- System jobs that create new user-facing work, and skip read-only organisations
--   * vpmo-scheduled-report-packs (private.create_scheduled_packs): skips them (§8). It runs
--     as postgres, so the trigger alone wouldn't stop it.
--   * vpmo-report-notify only sends what's already queued; nothing new is queued for a
--     read-only organisation once packs stop and the lifecycle RPCs are refused. No change.
--   * Health refresh, snapshots, metric/forecast history, pruning: keep running (they keep
--     existing data correct). GL-6 (billing emails) will need the opposite: it runs *because*
--     an organisation is read-only.
--
-- Edge functions: service-role writes made on a user's behalf (audit, decision 5)
-- ---------------------------------------------------------------------
-- The database can't refuse these by itself: with the service role auth.uid() is null, so the
-- trigger treats them as system writes. Each was read in supabase/functions (09/11/2026):
--   report-distribute    NEEDS A CHECK. A publisher calls it to (re)send a published pack. The
--                        permission check is a read as the caller; the write (record_report_event
--                        'distributed') and the emails go through the service role, so a
--                        read-only organisation could still send. Change: after the permission
--                        check, call public.organisation_writable(report's organisation) as
--                        the caller and return 400 { code: 'org_read_only' } if false.
--   report-ai-summary    CHECK ADDED EARLY, though already covered. Every write is as the caller
--                        (record_ai_draft), so the trigger refuses it, but only after the
--                        Anthropic call has been paid for. Change: the same check before
--                        calling Anthropic.
--   report-publish       NO CHECK NEEDED. publish_report runs as the caller first and is refused
--                        by the trigger; the service-role steps (print token, pdf_generated
--                        event, distribution) only run after it succeeds.
--   send-invite          NO CHECK NEEDED. create_invites / resend_invite run as the caller first
--                        (viewer invites pass, paid ones are refused); the service-role steps
--                        (issue_invite_token, mark_invite_sent, record_invite_email_id) only run
--                        for invites those calls returned.
--   notify-join-request  NO CHECK NEEDED. It only marks an existing pending request as notified
--                        and emails admins; creating the request (request_to_join, as the
--                        caller) is refused in a read-only organisation. A request made before
--                        the lapse can still be notified, which helps admins decline it.
--   manage-subscription  NO CHECK, ON PURPOSE. Seat and interval changes in Stripe are how an
--                        admin gets out of read-only; its only database write is
--                        record_billing_request (audit_log, exempt).
--   create-checkout-session  NO CHECK, ON PURPOSE. Subscribing restores writes; it writes
--                        organisation_subscriptions (exempt) with the service role.
--   create-portal-session    No database writes.
--   stripe-webhook, resend-webhook  Not on a user's behalf (signed webhooks); system writes.
--   report-notify        Not on a user's behalf (cron); sends what's queued, marks sent_at.
--   Netlify report-pdf   Only reached from report-publish after publish succeeded.
-- The check goes in supabase/functions/_shared/http.ts as requireWritable(client, orgId),
-- used by report-distribute and report-ai-summary. It calls the new public RPC in §7, which
-- GL-5 will reuse for the banner.
--
-- Cost (local Postgres 16, demo seed, signed in as an organisation admin through RLS; local is
-- several times slower than hosted, so read the ratios). Each figure is the median of 7 runs,
-- each run in its own transaction, rolled back.
--   Writable organisation (the normal case: the trigger checks and lets the write through).
--   "Trigger" is zz_org_read_only's own time from EXPLAIN ANALYZE; "total" is the whole
--   statement, with all the table's other triggers (tenant guard, audit, health enqueue).
--                                         trigger (median, range)   total without   total with
--     Project CSV import, 500 rows,
--       one insert (Settings › Data)      17.9 ms (13.1–18.5)        331 ms          324 ms
--     Lessons CSV import, 500 rows        16.5 ms (13.4–18.3)        325 ms          326 ms
--     Single project update               0.07 ms (0.06–0.12)        3.5 ms          3.6 ms
--   About 0.035 ms a row: roughly 5% of a 500-row import and 2% of a single update, inside the
--   run-to-run noise of the totals. A board paste moves one task (task-workspace.tsx), so it's
--   the single-row case. A storage upload adds one call of the same lookup.
--   * Reads: none. This is a trigger on writes, not a policy, so no SELECT path changes.
--     Storage reads (select policy) are unchanged too.
--   * Writes: per row, one GUC read for auth.uid() (system writes stop there), then one
--     primary-key lookup on organisation_subscriptions. After approval, also measured on live
--     with a single signed-in update, and written up in docs/perf.md.
--
-- Additive only: new functions, triggers, a constraint, two data updates, and three storage
-- policies altered in place (alter policy, as migration benefits_pathway did). Nothing is
-- dropped or deleted. create_scheduled_packs and organisation_is_writable are replaced in
-- place with the same signatures.

-- =============================================================================================
-- Migration (supabase/migrations/20261110093319_gl_4_read_only.sql)
-- =============================================================================================

-- 1. Fix the writable check. Same rules as 2.3, but every clause is null-safe, and the default
--    of true applies only when the organisation has no subscription row at all.
--    Writable when: demo plan; or Stripe status trialing / active; or past_due and less than
--    14 days after current_period_end; or no failed/ended Stripe status and a trial that hasn't
--    ended. A trial with no end date, or past_due with no period end, is now read-only.
create or replace function private.organisation_is_writable(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select
      (s.plan = 'demo') is true
      or (s.status in ('trialing', 'active')) is true
      or (s.status = 'past_due' and s.current_period_end + interval '14 days' > now()) is true
      or (coalesce(s.status, '') not in ('canceled', 'unpaid', 'incomplete_expired', 'past_due')
          and s.trial_ends_at > now()) is true
    from public.organisation_subscriptions s
    where s.organisation_id = p_org
  ), true);
$$;
revoke execute on function private.organisation_is_writable(uuid) from public, anon, authenticated;

-- 2. Trial end dates on existing rows, then forbid a trial without one.
--    a. Any trial with no end date gets 14 days from today (decision 1). On live that is only
--       "VPMO Test Outsider Org" (a98e388d-97fb-4a5a-a83e-f9ee88dbaaaf).
update public.organisation_subscriptions
set trial_ends_at = now() + interval '14 days'
where plan = 'trial' and trial_ends_at is null;

--    b. "E2E 2.1 Test Organisation" is the e2e suite's own organisation (docs/invites-and-seats.md)
--       and must stay writable or the suite fails once its trial ends on 12/11/2026. A year from
--       today keeps it a trial (so trial behaviour stays tested) without going read-only.
--       Matched by id, so on a branch or local database (where the row doesn't exist) it
--       updates nothing. "Originoverthrow" is deliberately left as it is.
update public.organisation_subscriptions
set trial_ends_at = now() + interval '1 year'
where organisation_id = 'b7c1b116-f327-434a-ac70-2fddc27bf0a5' and plan = 'trial';

alter table public.organisation_subscriptions
  add constraint organisation_subscriptions_trial_end_check
  check (plan <> 'trial' or trial_ends_at is not null) not valid;
alter table public.organisation_subscriptions
  validate constraint organisation_subscriptions_trial_end_check;
-- create_organisation already inserts trial_ends_at = now() + interval '14 days'; with the
-- constraint, nothing can create a trial without one again. No change to create_organisation.

-- 3. The assertion. Called by the trigger and the storage check; available to other private
--    code that wants to fail early with the same message. Not exposed to clients.
create or replace function private.assert_org_writable(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if p_org is not null and not private.organisation_is_writable(p_org) then
    raise exception 'This organisation is read-only because its trial or subscription has ended. An admin can subscribe in Settings › Subscription to restore editing.'
      using errcode = 'P0001', hint = 'org_read_only';
  end if;
end;
$$;
revoke execute on function private.assert_org_writable(uuid) from public, anon, authenticated;

-- 4. Is this write by the system (cron, service role) rather than a person?
create or replace function private.is_system_write()
returns boolean
language sql
stable
set search_path to ''
as $$
  select (select auth.uid()) is null
     and coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
                  '') <> 'anon';
$$;
revoke execute on function private.is_system_write() from public, anon, authenticated;

-- 5. Row changes allowed while read-only (see the header for why each one). Compares whole rows
--    minus the columns the change may touch, so any other edit in the same statement is still
--    refused. A few rules look up the member or invite they depend on, so it is STABLE and
--    SECURITY DEFINER (it only reads).
create or replace function private.read_only_write_allowed(p_table text, p_op text, p_old jsonb, p_new jsonb)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select case
    -- Members: leave, step down to viewer, or join as viewer.
    when p_table in ('organisation_members', 'workspace_members') then
      case p_op
        when 'DELETE' then true
        when 'INSERT' then p_new ->> 'role' = 'viewer'
        when 'UPDATE' then p_new ->> 'role' = 'viewer'
          and (p_old - 'role' - 'updated_at') = (p_new - 'role' - 'updated_at')
        else false
      end

    -- Invites: revoke any pending invite; create and work with viewer invites.
    when p_table = 'organisation_invites' then
      case p_op
        when 'INSERT' then p_new ->> 'role' = 'viewer'
        when 'UPDATE' then
          (p_old ->> 'role' = 'viewer' and p_new ->> 'role' = 'viewer')
          or (p_old -> 'revoked_at' = 'null'::jsonb and p_new -> 'revoked_at' <> 'null'::jsonb
              and (p_old - 'revoked_at' - 'revoked_by' - 'updated_at')
                = (p_new - 'revoked_at' - 'revoked_by' - 'updated_at'))
        else false
      end
    when p_table = 'organisation_invite_workspaces' and p_op = 'INSERT' then
      exists (select 1 from public.organisation_invites i
              where i.id = (p_new ->> 'invite_id')::uuid and i.role = 'viewer')

    -- Resources: unlink a removed member; link or create the resource for a new viewer member
    -- (private.link_profile_to_resource). team_list is a generated column, NULL in NEW inside a
    -- BEFORE trigger, so it's left out of the comparison.
    when p_table = 'resources' and p_op = 'UPDATE' then
      (p_old - 'profile_id' - 'updated_at' - 'team_list') = (p_new - 'profile_id' - 'updated_at' - 'team_list')
      and (p_new -> 'profile_id' = 'null'::jsonb
           or (p_old -> 'profile_id' = 'null'::jsonb
               and exists (select 1 from public.organisation_members m
                           where m.organisation_id = (p_new ->> 'organisation_id')::uuid
                             and m.profile_id = (p_new ->> 'profile_id')::uuid
                             and m.role = 'viewer')))
    when p_table = 'resources' and p_op = 'INSERT' then
      (p_new ->> 'is_bookable')::boolean is false
      and exists (select 1 from public.organisation_members m
                  where m.organisation_id = (p_new ->> 'organisation_id')::uuid
                    and m.profile_id = (p_new ->> 'profile_id')::uuid
                    and m.role = 'viewer')

    -- Join requests: decline, approve as viewer, or withdraw (by the requester, or by
    -- accepting an invite).
    when p_table = 'organisation_join_requests' and p_op = 'UPDATE' then
      p_old ->> 'status' = 'pending'
      and (p_new ->> 'status' in ('declined', 'withdrawn')
           or (p_new ->> 'status' = 'approved' and p_new ->> 'decided_role' = 'viewer'))
      and (p_old - 'status' - 'decided_role' - 'decided_by' - 'decided_at' - 'updated_at')
        = (p_new - 'status' - 'decided_role' - 'decided_by' - 'decided_at' - 'updated_at')

    else false
  end;
$$;
revoke execute on function private.read_only_write_allowed(text, text, jsonb, jsonb) from public, anon, authenticated;

-- 6. One generic trigger function. TG_ARGV[0] names the organisation column (default
--    organisation_id; 'id' on organisations). SECURITY DEFINER so it can read the
--    subscription row whatever the caller's RLS.
create or replace function private.enforce_org_writable()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_col text := coalesce(tg_argv[0], 'organisation_id');
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_org uuid;
begin
  if private.is_system_write() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_org := coalesce(v_new ->> v_col, v_old ->> v_col)::uuid;
  if v_org is not null and not private.organisation_is_writable(v_org)
     and not private.read_only_write_allowed(tg_table_name, tg_op, v_old, v_new) then
    perform private.assert_org_writable(v_org);
  end if;
  -- A row moved between organisations (not done anywhere today) must be writable on both sides.
  if tg_op = 'UPDATE' and (v_old ->> v_col) is distinct from (v_new ->> v_col) then
    perform private.assert_org_writable((v_old ->> v_col)::uuid);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function private.enforce_org_writable() from public, anon, authenticated;

-- Attach it. Every public table with an organisation_id column, except the three exempt ones.
-- supabase/tests/read_only_mode.sql fails if a later table with organisation_id has neither the
-- trigger nor a place on this list, and AGENTS.md gains a rule to add it.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'organisation_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname not in ('organisation_subscriptions', 'audit_log', 'user_favourites')
    order by c.relname
  loop
    execute format(
      'create trigger zz_org_read_only before insert or update or delete on public.%I
         for each row execute function private.enforce_org_writable()', t.relname);
  end loop;
end;
$$;

-- organisations: no insert check (create_organisation inserts the organisation before its
-- subscription row, and a new organisation is always writable).
create trigger zz_org_read_only before update or delete on public.organisations
  for each row execute function private.enforce_org_writable('id');

-- 7. For the edge functions (report-distribute, report-ai-summary) and GL-5's banner: is this
--    organisation writable? A signed-in caller must be a member; the service role may ask
--    about any organisation.
create or replace function public.organisation_writable(p_organisation_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if (select auth.uid()) is not null and not private.is_org_member(p_organisation_id) then
    raise exception 'You are not a member of this organisation' using errcode = '42501';
  end if;
  return private.organisation_is_writable(p_organisation_id);
end;
$$;
revoke execute on function public.organisation_writable(uuid) from public, anon;
grant execute on function public.organisation_writable(uuid) to authenticated, service_role;

-- 8. Scheduled pack drafts skip read-only organisations. Body unchanged apart from the
--    marked line.
create or replace function private.create_scheduled_packs()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  m record;
  v_id uuid;
  v_prev uuid;
  n integer := 0;
begin
  for m in
    select mt.id as meeting_id, mt.meeting_date, mt.papers_deadline, f.*
    from public.meetings mt join public.forums f on f.id = mt.forum_id
    where f.auto_create_packs and f.active and f.archived_at is null and f.default_template_id is not null and f.scope_type is not null
      and mt.status = 'planned' and mt.papers_deadline < private.org_today(f.organisation_id)
      and mt.papers_deadline >= private.org_today(f.organisation_id) - 7
      and not exists (select 1 from public.reports r where r.meeting_id = mt.id)
      and private.organisation_is_writable(f.organisation_id)  -- GL-4
  loop
    select r.id into v_prev from public.reports r where r.forum_id = m.id and r.status = 'published' order by r.published_at desc limit 1;
    insert into public.reports (organisation_id, workspace_id, title, template_id, template_version, forum_id, meeting_id,
      scope_type, scope_entity_id, scope_items, as_at, blocks, selection_rules, previous_report_id, created_by)
    select m.organisation_id, m.workspace_id, m.name || ' — ' || to_char(m.meeting_date, 'DD Mon YYYY'), t.id, t.version, m.id, m.meeting_id,
      m.scope_type, case when m.scope_type = 'custom' then null else m.scope_entity_id end,
      case when m.scope_type = 'custom' then (select coalesce(jsonb_agg(jsonb_build_object('entity_type', s.entity_type, 'entity_id', s.entity_id)), '[]')
        from public.forum_scope_items s where s.forum_id = m.id) end,
      m.papers_deadline, t.blocks, t.selection_rules, v_prev, null
    from public.report_templates t where t.id = m.default_template_id
    returning id into v_id;
    perform private.compute_inclusions(v_id);
    insert into public.report_events (report_id, event, actor, payload)
    values (v_id, 'created', null, jsonb_build_object('scheduled', true, 'system', true, 'creator', 'system', 'meeting_id', m.meeting_id));
    insert into public.report_notifications (report_id, kind, recipients)
    values (v_id, 'draft_ready', private.draft_pack_recipients(v_id))
    on conflict (report_id, kind) do nothing;
    n := n + 1;
  end loop;
  return n;
end;
$function$;

-- 9. Storage: refuse uploads, replacements and deletions under a read-only organisation's
--    folder. Every client-writable bucket (org-assets, attachments, evidence, documents) keeps
--    objects at <organisation_id>/..., so the first folder names the organisation. A path whose
--    first folder isn't an organisation id is left to the existing checks (they refuse it
--    anyway). The service role bypasses RLS, so system writes are unaffected. Each policy
--    keeps its current expression (as on live, 09/11/2026) and gains one condition.
--    For a member of the organisation it raises the same org_read_only error as the tables,
--    so the app can show the friendly message; for anyone else it just returns false (a plain
--    RLS refusal), so it never tells an outsider whether another organisation is read-only.
create or replace function private.storage_path_writable(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_org uuid := private.try_uuid((storage.foldername(p_name))[1]);
begin
  if v_org is null or private.organisation_is_writable(v_org) then
    return true;
  end if;
  if private.is_org_member(v_org) then
    perform private.assert_org_writable(v_org);
  end if;
  return false;
end;
$$;
revoke execute on function private.storage_path_writable(text) from public, anon;
grant execute on function private.storage_path_writable(text) to authenticated, service_role;

alter policy vpmo_objects_insert on storage.objects
  with check (
    (((bucket_id = 'org-assets'::text) AND private.has_org_role(private.try_uuid((storage.foldername(name))[1]), 'admin'::app_role))
      OR ((bucket_id = ANY (ARRAY['attachments'::text, 'evidence'::text])) AND private.has_workspace_role(private.storage_workspace(name), 'contributor'::app_role))
      OR ((bucket_id = 'documents'::text) AND private.can_upload_document(name)))
    AND private.storage_path_writable(name)
  );

alter policy vpmo_objects_update on storage.objects
  using (
    (((bucket_id = 'org-assets'::text) AND (private.try_uuid((storage.foldername(name))[1]) = ANY (( SELECT private.my_org_ids('admin'::app_role) AS my_org_ids)::uuid[])))
      OR ((bucket_id = ANY (ARRAY['attachments'::text, 'evidence'::text])) AND (private.storage_workspace(name) = ANY (( SELECT private.my_workspace_ids('contributor'::app_role) AS my_workspace_ids)::uuid[]))))
    AND private.storage_path_writable(name)
  )
  with check (
    (((bucket_id = 'org-assets'::text) AND (private.try_uuid((storage.foldername(name))[1]) = ANY (( SELECT private.my_org_ids('admin'::app_role) AS my_org_ids)::uuid[])))
      OR ((bucket_id = ANY (ARRAY['attachments'::text, 'evidence'::text])) AND (private.storage_workspace(name) = ANY (( SELECT private.my_workspace_ids('contributor'::app_role) AS my_workspace_ids)::uuid[]))))
    AND private.storage_path_writable(name)
  );

alter policy vpmo_objects_delete on storage.objects
  using (
    (((bucket_id = 'org-assets'::text) AND (private.try_uuid((storage.foldername(name))[1]) = ANY (( SELECT private.my_org_ids('admin'::app_role) AS my_org_ids)::uuid[])))
      OR ((bucket_id = ANY (ARRAY['attachments'::text, 'evidence'::text])) AND (private.storage_workspace(name) = ANY (( SELECT private.my_workspace_ids('manager'::app_role) AS my_workspace_ids)::uuid[]))))
    AND private.storage_path_writable(name)
  );
