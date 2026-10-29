-- Work package 2.1: ROLLBACK REFERENCE for migration 2_1_invites_seats. Do not run unless the
-- migration has to be undone. Contains destructive statements (drop), so run it by hand in the SQL
-- editor, never through the Supabase tool. The migration changes no existing rows, so undoing it
-- means restoring the definitions below and dropping what it added.
-- Definitions captured from live on 29/10/2026, immediately before the migration was applied.

begin;

-- 1. Restore replaced functions (live bodies before 2.1) ---------------------------------------
create or replace function private.is_forum_chair(p_forum_id uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select exists (
    select 1 from public.forums f
    join public.resources r on r.id = f.chair_resource_id and r.organisation_id = f.organisation_id
    where f.id = p_forum_id and f.active and r.profile_id = (select auth.uid())
      and private.workspace_is_active(f.workspace_id)
  );
$$;

create or replace function private.can_edit_programme_note(p_programme uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce((
    select p.archived_at is null
       and (p.workspace_id = any (private.my_workspace_ids('pmo'))
            or (p.manager_id = any (private.my_resource_ids())
                and p.workspace_id = any (private.my_workspace_ids())
                and private.workspace_is_active(p.workspace_id)))
    from public.programmes p
    where p.id = p_programme
  ), false);
$$;

create or replace function private.paid_seat_count(p_org uuid)
returns integer language sql stable security definer set search_path to '' as $$
  select count(*)::integer
  from public.organisation_members m
  where m.organisation_id = p_org
    and m.role <> 'viewer'::public.app_role;
$$;

-- 2. Restore altered policies --------------------------------------------------------------------
alter policy work_item_offers_update on public.work_item_offers
  using ((response is null) and (select private.workspace_is_active(work_item_offers.workspace_id))
         and ((issued_to = any ((select private.my_resource_ids())::uuid[]))
              or (issued_by = any ((select private.my_resource_ids())::uuid[]))
              or (workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]))))
  with check ((select private.workspace_is_active(work_item_offers.workspace_id))
              and ((issued_to = any ((select private.my_resource_ids())::uuid[]))
                   or (issued_by = any ((select private.my_resource_ids())::uuid[]))
                   or (workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]))));

alter policy dashboards_insert on public.dashboards
  with check ((owner_id = (select auth.uid()))
              and case when workspace_id is null
                       then organisation_id = any ((select private.my_org_ids())::uuid[])
                       else workspace_id = any ((select private.my_workspace_ids())::uuid[]) end);
alter policy dashboards_update on public.dashboards
  using ((owner_id = (select auth.uid()))
         or (is_shared and case when workspace_id is null
                                then organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[])
                                else workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]) end))
  with check ((owner_id = (select auth.uid()))
              or (is_shared and case when workspace_id is null
                                     then organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[])
                                     else workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]) end));

alter policy saved_views_insert on public.saved_views
  with check ((owner_id = (select auth.uid()))
              and case when workspace_id is null
                       then organisation_id = any ((select private.my_org_ids())::uuid[])
                       else workspace_id = any ((select private.my_workspace_ids())::uuid[]) end
              and ((not (is_shared and is_default))
                   or case when workspace_id is null
                           then organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[])
                           else workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]) end));
alter policy saved_views_update on public.saved_views
  using (((owner_id = (select auth.uid())) and (not (is_shared and is_default)))
         or (is_shared and case when workspace_id is null
                                then organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[])
                                else workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]) end))
  with check (((owner_id = (select auth.uid())) or is_shared)
              and (((not is_shared) and (owner_id = (select auth.uid())))
                   or ((not is_default) and (owner_id = (select auth.uid())))
                   or case when workspace_id is null
                           then organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[])
                           else workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]) end));

-- 3. Restore privileges (before 2.1: authenticated had insert/select/update/delete on
--    organisation_members, anon none; join_demo_organisation executable by authenticated) -------
grant insert, update, delete on public.organisation_members to authenticated;
grant execute on function public.join_demo_organisation() to authenticated;

-- 4. Drop what 2.1 added (destructive) -----------------------------------------------------------
drop trigger if exists organisation_members_seat_limit on public.organisation_members;
drop trigger if exists workspace_members_seat_limit on public.workspace_members;
drop trigger if exists organisation_subscriptions_audit_seats on public.organisation_subscriptions;

drop function if exists
  public.get_seat_usage(uuid), public.list_organisation_members(uuid),
  public.change_member_role(uuid, uuid, public.app_role), public.remove_member(uuid, uuid),
  public.create_invites(uuid, jsonb, uuid[]), public.resend_invite(uuid), public.revoke_invite(uuid),
  public.get_invite_preview(text), public.accept_invite(text),
  public.issue_invite_token(uuid, bytea, uuid), public.mark_invite_sent(uuid, uuid, text),
  public.set_join_requests_enabled(uuid, boolean), public.add_join_domain(uuid, text),
  public.remove_join_domain(uuid), public.find_joinable_organisations(),
  public.request_to_join(uuid, text), public.withdraw_join_request(uuid),
  public.decide_join_request(uuid, boolean, public.app_role, uuid[]),
  public.claim_join_request_notification(uuid, uuid), public.record_billing_request(uuid, text, jsonb);

drop table if exists public.organisation_invite_workspaces, public.organisation_invites,
  public.organisation_join_requests, public.organisation_join_domains, public.organisation_join_settings;

drop function if exists
  private.my_writable_resource_ids(), private.audit_seat_change(),
  private.add_member(uuid, uuid, public.app_role, uuid[], uuid),
  private.assert_join_workspaces(uuid, uuid[], public.app_role), private.invite_emails_last_day(uuid),
  private.is_consumer_entra_tenant(text), private.is_personal_email_domain(text), private.email_domain(text),
  private.auth_entra_tenant(), private.auth_email(), private.write_audit(uuid, text, text, uuid, jsonb, uuid),
  private.assert_org_admin(uuid), private.enforce_paid_seat(), private.assert_seats_for(uuid, integer),
  private.lock_seats(uuid), private.seat_limit(uuid), private.seats_used(uuid), private.is_paid_member(uuid, uuid);

drop index if exists public.organisation_subscriptions_stripe_schedule_uidx;
alter table public.organisation_subscriptions
  drop constraint if exists organisation_subscriptions_trial_seat_allowance_check,
  drop constraint if exists organisation_subscriptions_scheduled_seats_check,
  drop constraint if exists organisation_subscriptions_scheduled_interval_check,
  drop column if exists trial_seat_allowance,
  drop column if exists scheduled_seats,
  drop column if exists scheduled_price_id,
  drop column if exists scheduled_interval,
  drop column if exists scheduled_change_at,
  drop column if exists stripe_schedule_id;

delete from supabase_migrations.schema_migrations where name = '2_1_invites_seats';

commit;
