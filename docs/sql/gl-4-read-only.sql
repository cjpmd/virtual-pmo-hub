-- GL-4 Read-only when a trial or subscription lapses (docs/go-live-plan.md). PROPOSAL, not applied.
--
-- Evidence (live project xvdlmtkzfmbcegkmampz, read-only, 09/11/2026)
-- ---------------------------------------------------------------------
-- private.organisation_is_writable(org) (migration 2_3_stripe_billing) has no callers.
-- organisation_subscriptions on live:
--   University                 demo   status null  trial_ends_at null        writable (demo)
--   VPMO Test Outsider Org     trial  status null  trial_ends_at null        writable FOREVER (bug)
--   Originoverthrow            trial  status null  trial_ends_at 12/11/2026  writable until then
--   E2E 2.1 Test Organisation  trial  status null  trial_ends_at 12/11/2026  writable until then
-- The bug: for a trial row with trial_ends_at null every clause is false or NULL, so the whole
--   OR is NULL, and the outer coalesce(..., true) (meant for "no subscription row") turns it
--   into true. Same for past_due with current_period_end null: coalesce(now()) gives a grace
--   period that never ends. create_organisation already sets trial_ends_at = now() + 14 days
--   (since migration auth_email_microsoft), so only the one old row is affected.
--
-- Table inventory (public, 137 tables):
--   * 133 have organisation_id (all tenant tables, including those without workspace_id:
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
--   * Not covered: storage.objects (see "Not in this proposal" at the end).
--
-- How a system write is told from a user write: auth.uid() is null and the JWT role isn't anon.
--   pg_cron jobs run as postgres with no JWT; edge functions using the service role send a JWT
--   with role service_role and no sub. A signed-in user always has a sub, whether they write
--   directly (current_user authenticated) or through a SECURITY DEFINER RPC (current_user is
--   the owner, but request.jwt.claims still carries their sub), so definer RPCs are covered.
--   current_user can't be used: inside a definer RPC it is postgres, the same as cron.
--   An anon caller is treated as a user (refused), not as the system.
--
-- Writes that still work when read-only
--   * System writes (cron health refresh, snapshots, metric and forecast history, report-notify,
--     stripe-webhook, resend-webhook, report-distribute): auth.uid() null, allowed.
--   * organisation_subscriptions, audit_log, user_favourites: no trigger. Billing is service
--     role; the audit log only records allowed actions (member removal etc.); favourites are a
--     personal convenience.
--   * profiles: no trigger (name, email sync, last_organisation_id).
--   * Getting under the seat count, shaped by row, not by a session setting (AGENTS.md: no
--     session setting may bypass a rule):
--       organisation_members  DELETE (remove_member); UPDATE that only sets role to viewer
--                             (change_member_role to viewer).
--       workspace_members     DELETE (cascade from organisation_members); UPDATE that only
--                             sets role to viewer (change_member_role lowers workspace roles).
--       resources             UPDATE that only clears profile_id (the ON DELETE SET NULL
--                             cascade when a member is removed).
--       organisation_invites  UPDATE that only revokes a pending invite (revoke_invite), since
--                             pending paid invites count as seats. Bounces are service role.
--   * Settings › Subscription: checkout and portal run in edge functions; the subscription row
--     is written by stripe-webhook (service role). Nothing there is refused.
--   Everything else by a signed-in user (or anon) in a read-only organisation is refused with
--   errcode P0001, hint 'org_read_only'. Examples: create/edit any record, settings
--   (organisations UPDATE), new invites, accepting an old invite (it inserts a member), raising
--   a member's role, report lifecycle RPCs (submit/approve/publish), AI drafts.
--
-- System jobs that create new user-facing work, and skip read-only organisations
--   * vpmo-scheduled-report-packs (private.create_scheduled_packs): skips them (below). It runs
--     as postgres, so the trigger alone wouldn't stop it.
--   * vpmo-report-notify only sends what's already queued; nothing new is queued for a
--     read-only organisation once packs stop and the lifecycle RPCs are refused. No change.
--   * Health refresh, snapshots, metric/forecast history, pruning: keep running (they keep
--     existing data correct). GL-6 (billing emails) will need the opposite: it runs *because*
--     an organisation is read-only.
--
-- Cost
--   * Reads: none. This is a trigger on writes, not a policy, so no SELECT path changes
--     (unlike adding the check to RLS policies, which 2.2 floated).
--   * Writes: per row, one GUC read for auth.uid() (system writes stop there), then one
--     primary-key lookup on organisation_subscriptions. To be measured after approval on the
--     local Postgres and on live (signed in, as docs/perf.md), on a single update and on a
--     500-row insert (the project CSV import's maximum), and written up in docs/perf.md.
--
-- Additive only: new functions, triggers, a constraint and a backfill. Nothing is dropped or
-- deleted. create_scheduled_packs and organisation_is_writable are replaced in place with the
-- same signatures.

-- =============================================================================================
-- Migration (supabase/migrations/<timestamp>_gl_4_read_only.sql)
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

-- 2. Backfill the trial row with no end date, then forbid it.
--    Proposed: give it a fresh 14 days from today, so applying this migration doesn't flip an
--    organisation to read-only without warning. Alternative: created_at + 14 days (the
--    Outsider test org would become read-only at once; it's only used as an outsider in RLS
--    tests, which don't write as it). Tell me which.
update public.organisation_subscriptions
set trial_ends_at = now() + interval '14 days'
where plan = 'trial' and trial_ends_at is null;

alter table public.organisation_subscriptions
  add constraint organisation_subscriptions_trial_end_check
  check (plan <> 'trial' or trial_ends_at is not null) not valid;
alter table public.organisation_subscriptions
  validate constraint organisation_subscriptions_trial_end_check;
-- create_organisation already inserts trial_ends_at = now() + interval '14 days'; with the
-- constraint, nothing can create a trial without one again. No change to create_organisation.

-- 3. The assertion. Callable from other private code (e.g. a future RPC that wants to fail
--    early with the same message); not exposed to clients.
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

-- 5. Row changes allowed while read-only (all of them reduce seats or access; see header).
--    Compares whole rows minus the columns the change may touch, so any other edit in the
--    same statement is still refused.
create or replace function private.read_only_write_allowed(p_table text, p_op text, p_old jsonb, p_new jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select case
    when p_table in ('organisation_members', 'workspace_members') and p_op = 'DELETE' then true
    when p_table in ('organisation_members', 'workspace_members') and p_op = 'UPDATE' then
      p_new ->> 'role' = 'viewer'
      and (p_old - 'role' - 'updated_at') = (p_new - 'role' - 'updated_at')
    -- team_list is a generated column: NULL in NEW inside a BEFORE trigger, so it's left out.
    when p_table = 'resources' and p_op = 'UPDATE' then
      p_new -> 'profile_id' = 'null'::jsonb
      and (p_old - 'profile_id' - 'updated_at' - 'team_list') = (p_new - 'profile_id' - 'updated_at' - 'team_list')
    when p_table = 'organisation_invites' and p_op = 'UPDATE' then
      p_old -> 'revoked_at' = 'null'::jsonb and p_new -> 'revoked_at' <> 'null'::jsonb
      and (p_old - 'revoked_at' - 'revoked_by' - 'updated_at')
        = (p_new - 'revoked_at' - 'revoked_by' - 'updated_at')
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

-- 7. Attach it. Every public table with an organisation_id column, except the three exempt
--    ones. supabase/tests/read_only_mode.sql fails if a later table with organisation_id has
--    neither the trigger nor a place on this list, and AGENTS.md gains a rule to add it.
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

-- =============================================================================================
-- Not in this proposal (say if you want them)
-- =============================================================================================
-- * Storage uploads (attachments, evidence, documents, org-assets buckets). The metadata rows
--   (work_item_attachments, documents) are refused, so an upload can't be attached to anything,
--   but the object itself would still be stored. Closing that means `alter policy
--   vpmo_objects_insert / vpmo_objects_update ... with check (... and
--   private.organisation_is_writable(<org from path>))` — additive, but it changes live storage
--   policies, so I'd rather do it as a small follow-up.
-- * Viewer invites while read-only (free seats). Refused for now with everything else; easy to
--   allow later in read_only_write_allowed if you want admins to add viewers to a lapsed org.
-- * Declining join requests while read-only: refused for now.
