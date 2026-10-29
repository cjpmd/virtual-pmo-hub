-- Work package 2.1: member invites, seats and same-domain join requests.
-- PROPOSAL, not applied. After approval it becomes one migration (2_1_invites_seats), then
-- src/integrations/supabase/types.ts is regenerated.
--
-- No destructive statements: no drop, delete or truncate in the migration. Everything is new
-- tables, new columns, create or replace of existing helpers (bodies shown in full), alter policy
-- (expressions shown in full), and grant / revoke. The RPCs remove_member and remove_join_domain
-- delete rows at run time; that is the feature, not a migration step.
--
-- ROLES AND SEATS
--   The five app_role values stay. The UI shows three tiers:
--     admin  = organisation role admin
--     member = organisation role contributor / manager / pmo, OR an organisation viewer who holds
--              contributor or above in any workspace (the 1.6 "workspace member" pattern, which
--              the e2e fixture docs/sql/1-6-e2e-workspace.sql relies on)
--     viewer = organisation viewer with no workspace role above viewer
--   Admins and members use a paid seat (private.is_paid_member). Viewers are free.
--   Seats used = paid members + open, unexpired invites for a paid role (private.seats_used).
--   Seat limit (private.seat_limit):
--     demo plan                      -> seats_total
--     live Stripe subscription       -> least(seats_total, scheduled_seats): once a reduction is
--                                       scheduled, nobody can fill the seats that are going away
--     no Stripe subscription (trial) -> trial_seat_allowance (10)
--     ended subscription             -> 0 (paid roles can't be granted; existing members stay;
--                                       read-only mode is 2.2)
--   Enforcement: a SECURITY DEFINER BEFORE trigger on organisation_members and workspace_members
--   refuses any insert or role change that makes someone newly paid when no seat is free, so it
--   holds whichever path writes the row (RPC, the 1.6 workspace UI, SQL editor). Concurrency:
--   every path that can add a paid seat first takes FOR UPDATE on the organisation's
--   organisation_subscriptions row (private.lock_seats), then counts. Under READ COMMITTED each
--   statement after the lock sees the other transaction's committed rows, so two simultaneous
--   invites, accepts or role changes are serialised and can't both take the last seat. The same
--   lock serialises the last-admin check for change_member_role / remove_member.
--   Direct insert/update/delete on organisation_members is revoked from authenticated: all
--   organisation membership changes go through the RPCs below (the old Settings › Users role
--   select is replaced by the Members page). workspace_members keeps its 1.6 direct writes;
--   the seat trigger covers them.
--
-- INVITES
--   Token: 32 random bytes made in the send-invite edge function, never seen by the browser or
--   stored in plain text. Only sha256(token) is stored (organisation_invites.token_hash, not
--   selectable by authenticated). Flow: the edge function calls create_invites / resend_invite
--   with the admin's JWT (all checks run here), then with the service role calls
--   issue_invite_token (stores the hash, returns what the email needs), sends through Resend,
--   then mark_invite_sent. A resend issues a new token, so older links stop working. The hash
--   is kept after acceptance or revocation so the link can say "already used" / "withdrawn".
--   Accepting compares auth.users.email (never profiles.email), case-insensitive, and requires
--   auth.users.email_confirmed_at. Invites last 7 days. Limits: 20 addresses per request,
--   50 invitation emails per organisation per 24 hours, 3 emails per invitation per 24 hours.
--
-- JOIN REQUESTS
--   Off by default (organisation_join_settings). Admins can add only what they've proven:
--     email_domain  = the domain of the admin's own confirmed auth.users email, exact match only;
--                     personal domains (gmail.com, outlook.com, ...) are refused.
--     entra_tenant  = the tid of the admin's own Microsoft sign-in
--                     (auth.identities.identity_data -> custom_claims -> tid, or from iss);
--                     the personal Microsoft account tenant 9188040d-... is refused.
--   A user with no matching membership sees matching organisations (find_joinable_organisations)
--   and can request to join. Admins approve with a role and workspaces (seat-checked) or decline.
--   Limits: one pending request per organisation, 7-day wait after a decline, 5 requests per
--   user per 24 hours. Admins are emailed once per request (claim_join_request_notification).
--   DNS TXT verification for other domains is a possible later addition (docs only).
--
-- STRIPE (columns only here; edge functions are planned separately)
--   Seat reductions use a subscription schedule: phase 1 = now until period end at the current
--   quantity, phase 2 = the lower quantity, end_behavior release. The webhook copies the pending
--   phase into scheduled_* and clears it when the schedule completes, is released or cancelled.
--   The customer portal can't update or cancel a subscription while a schedule is attached, so
--   monthly <-> annual switching moves in-app (same schedule, phase 2 carries the new price) and
--   the app offers "Cancel scheduled change" (schedule release). See docs/invites-and-seats.md.
--
-- AUDIT
--   Explicit rows in the existing audit_log (organisation-level, read by organisation admins and
--   PMO under the existing policy): invite.created, invite.sent, invite.send_failed,
--   invite.revoked, invite.accepted, member.role_changed, member.removed, join_request.*,
--   join_domain.*, join_settings.changed, seats.changed / seats.change_scheduled /
--   seats.scheduled_change_cleared (trigger on organisation_subscriptions; actor null when
--   Stripe's webhook made the change) and billing.* (requests recorded by the edge functions as
--   the admin). The existing row trigger on organisation_members keeps logging raw changes too.
--
-- VIEWERS ARE READ-ONLY
--   Record writes already need contributor in the workspace. The paths that let a viewer write
--   without a role are closed by requiring a paid member (private.is_paid_member):
--     forum chair (meetings, recording decisions), decision maker (record / defer / reverse),
--     programme manager (office note), request author / requester (business case), task offer
--     recipient (accept / decline), own leave (resource_leave), and creating or updating a
--     *shared* dashboard or saved view. Viewers keep their own personal dashboards, saved
--     views, favourites and profile. join_demo_organisation() loses execute for everyone.

-- =================================================================================================
-- 1. Subscription columns
-- =================================================================================================

alter table public.organisation_subscriptions
  add column if not exists trial_seat_allowance integer not null default 10,
  add column if not exists scheduled_seats      integer,
  add column if not exists scheduled_price_id   text,
  add column if not exists scheduled_interval   text,
  add column if not exists scheduled_change_at  timestamptz,
  add column if not exists stripe_schedule_id   text;

alter table public.organisation_subscriptions
  add constraint organisation_subscriptions_trial_seat_allowance_check check (trial_seat_allowance > 0),
  add constraint organisation_subscriptions_scheduled_seats_check check (scheduled_seats is null or scheduled_seats >= 1),
  add constraint organisation_subscriptions_scheduled_interval_check
    check (scheduled_interval is null or scheduled_interval in ('month', 'year'));

create unique index if not exists organisation_subscriptions_stripe_schedule_uidx
  on public.organisation_subscriptions (stripe_schedule_id) where stripe_schedule_id is not null;

comment on column public.organisation_subscriptions.trial_seat_allowance is
  'Paid seats allowed while there is no Stripe subscription (free trial). Default 10.';
comment on column public.organisation_subscriptions.scheduled_seats is
  'Seat quantity of the next subscription-schedule phase (a reduction at renewal). Written by stripe-webhook.';
comment on column public.organisation_subscriptions.scheduled_change_at is
  'When the scheduled phase starts (the current period end). Written by stripe-webhook.';
comment on column public.organisation_subscriptions.stripe_schedule_id is
  'Attached Stripe subscription schedule, if any. While set, the customer portal cannot update or cancel.';

-- =================================================================================================
-- 2. Tables
-- =================================================================================================

create table public.organisation_invites (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  email           text not null,
  role            public.app_role not null,
  token_hash      bytea unique,
  expires_at      timestamptz not null default now() + interval '7 days',
  last_sent_at    timestamptz,
  send_count      integer not null default 0,
  invited_by      uuid references public.profiles (id) on delete set null,
  accepted_at     timestamptz,
  accepted_by     uuid references public.profiles (id) on delete set null,
  revoked_at      timestamptz,
  revoked_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint organisation_invites_id_org_key unique (id, organisation_id),
  constraint organisation_invites_email_check
    check (email = lower(btrim(email)) and length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint organisation_invites_token_hash_check check (token_hash is null or octet_length(token_hash) = 32),
  constraint organisation_invites_state_check check (accepted_at is null or revoked_at is null)
);
comment on table public.organisation_invites is
  'Invitations to join an organisation. token_hash = sha256 of the emailed token; the token itself is never stored. Writes only through RPCs.';

create unique index organisation_invites_open_email_uidx
  on public.organisation_invites (organisation_id, email) where accepted_at is null and revoked_at is null;
create index organisation_invites_invited_by_idx on public.organisation_invites (invited_by);
create index organisation_invites_accepted_by_idx on public.organisation_invites (accepted_by);
create index organisation_invites_revoked_by_idx on public.organisation_invites (revoked_by);

create trigger organisation_invites_updated_at
  before update on public.organisation_invites
  for each row execute function private.set_updated_at();

create table public.organisation_invite_workspaces (
  invite_id       uuid not null,
  organisation_id uuid not null,
  workspace_id    uuid not null,
  primary key (invite_id, workspace_id),
  foreign key (invite_id, organisation_id)
    references public.organisation_invites (id, organisation_id) on delete cascade,
  foreign key (workspace_id, organisation_id)
    references public.workspaces (id, organisation_id) on delete cascade
);
comment on table public.organisation_invite_workspaces is
  'Workspaces an invitee joins on acceptance, with the invite role.';
create index organisation_invite_workspaces_invite_org_idx
  on public.organisation_invite_workspaces (invite_id, organisation_id);
create index organisation_invite_workspaces_workspace_org_idx
  on public.organisation_invite_workspaces (workspace_id, organisation_id);

create table public.organisation_join_settings (
  organisation_id  uuid primary key references public.organisations (id) on delete cascade,
  requests_enabled boolean not null default false,
  updated_by       uuid references public.profiles (id) on delete set null,
  updated_at       timestamptz not null default now()
);
comment on table public.organisation_join_settings is
  '"People with these email domains can request to join". Off unless a row says otherwise.';
create index organisation_join_settings_updated_by_idx on public.organisation_join_settings (updated_by);

create table public.organisation_join_domains (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  kind            text not null,
  value           text not null,
  verified_by     uuid references public.profiles (id) on delete set null,
  verified_via    text not null,
  created_at      timestamptz not null default now(),
  constraint organisation_join_domains_kind_check check (kind in ('email_domain', 'entra_tenant')),
  constraint organisation_join_domains_via_check check (verified_via in ('admin_email', 'admin_microsoft_sign_in')),
  constraint organisation_join_domains_value_check check (
    case kind
      when 'email_domain' then value ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
      else value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    end),
  constraint organisation_join_domains_unique unique (organisation_id, kind, value)
);
comment on table public.organisation_join_domains is
  'Email domains / Entra tenants whose users may request to join. Each one proven by the admin who added it.';
create index organisation_join_domains_lookup_idx on public.organisation_join_domains (kind, value);
create index organisation_join_domains_verified_by_idx on public.organisation_join_domains (verified_by);

create table public.organisation_join_requests (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  email           text not null,
  matched_by      text not null,
  message         text,
  status          text not null default 'pending',
  decided_role    public.app_role,
  decided_by      uuid references public.profiles (id) on delete set null,
  decided_at      timestamptz,
  notified_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint organisation_join_requests_matched_by_check check (matched_by in ('email_domain', 'entra_tenant')),
  constraint organisation_join_requests_status_check check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  constraint organisation_join_requests_message_check check (message is null or length(message) <= 500)
);
comment on table public.organisation_join_requests is
  'Requests to join from users matching a join domain or tenant. Never auto-approved.';
create unique index organisation_join_requests_pending_uidx
  on public.organisation_join_requests (organisation_id, profile_id) where status = 'pending';
create index organisation_join_requests_org_status_idx on public.organisation_join_requests (organisation_id, status);
create index organisation_join_requests_profile_idx on public.organisation_join_requests (profile_id, created_at desc);
create index organisation_join_requests_decided_by_idx on public.organisation_join_requests (decided_by);

create trigger organisation_join_requests_updated_at
  before update on public.organisation_join_requests
  for each row execute function private.set_updated_at();

-- RLS: reads only; every write is an RPC.
alter table public.organisation_invites enable row level security;
alter table public.organisation_invite_workspaces enable row level security;
alter table public.organisation_join_settings enable row level security;
alter table public.organisation_join_domains enable row level security;
alter table public.organisation_join_requests enable row level security;

revoke all on public.organisation_invites, public.organisation_invite_workspaces,
  public.organisation_join_settings, public.organisation_join_domains,
  public.organisation_join_requests from anon, authenticated;

grant select (id, organisation_id, email, role, expires_at, last_sent_at, send_count, invited_by,
              accepted_at, accepted_by, revoked_at, revoked_by, created_at, updated_at)
  on public.organisation_invites to authenticated;
grant select on public.organisation_invite_workspaces, public.organisation_join_settings,
  public.organisation_join_domains, public.organisation_join_requests to authenticated;

create policy organisation_invites_select on public.organisation_invites for select to authenticated
  using (organisation_id = any ((select private.my_org_ids('admin'))::uuid[]));
create policy organisation_invite_workspaces_select on public.organisation_invite_workspaces for select to authenticated
  using (organisation_id = any ((select private.my_org_ids('admin'))::uuid[]));
create policy organisation_join_settings_select on public.organisation_join_settings for select to authenticated
  using (organisation_id = any ((select private.my_org_ids('admin'))::uuid[]));
create policy organisation_join_domains_select on public.organisation_join_domains for select to authenticated
  using (organisation_id = any ((select private.my_org_ids('admin'))::uuid[]));
create policy organisation_join_requests_select on public.organisation_join_requests for select to authenticated
  using (organisation_id = any ((select private.my_org_ids('admin'))::uuid[])
         or profile_id = (select auth.uid()));

-- =================================================================================================
-- 3. Seat helpers
-- =================================================================================================

create function private.is_paid_member(p_org uuid, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organisation_members m
    where m.organisation_id = p_org and m.profile_id = p_profile and m.role >= 'contributor'
  ) or exists (
    select 1 from public.workspace_members wm
    where wm.organisation_id = p_org and wm.profile_id = p_profile and wm.role >= 'contributor'
  );
$$;

create function private.seats_used(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.organisation_members m
     where m.organisation_id = p_org and private.is_paid_member(p_org, m.profile_id))::integer
    +
    (select count(*) from public.organisation_invites i
     where i.organisation_id = p_org and i.accepted_at is null and i.revoked_at is null
       and i.expires_at > now() and i.role >= 'contributor')::integer;
$$;

create function private.seat_limit(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when s.plan = 'demo' then s.seats_total
      when s.stripe_subscription_id is not null
           and s.status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')
        then least(s.seats_total, coalesce(s.scheduled_seats, s.seats_total))
      when s.stripe_subscription_id is null then s.trial_seat_allowance
      else 0
    end
    from public.organisation_subscriptions s
    where s.organisation_id = p_org
  ), 0);
$$;

-- Same signature as 2.3; now counts workspace-level paid roles too.
create or replace function private.paid_seat_count(p_org uuid)
returns integer
language sql
stable
security definer
set search_path to ''
as $$
  select count(*)::integer
  from public.organisation_members m
  where m.organisation_id = p_org and private.is_paid_member(p_org, m.profile_id);
$$;

-- Serialises everything that can add a paid seat or remove an admin in one organisation.
create function private.lock_seats(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.organisation_subscriptions s where s.organisation_id = p_org for update;
  if not found then
    raise exception 'This organisation has no subscription record' using errcode = 'P0002';
  end if;
end;
$$;

-- Call after lock_seats. p_extra = paid seats the caller is about to add.
create function private.assert_seats_for(p_org uuid, p_extra integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer := private.seats_used(p_org);
  v_limit integer := private.seat_limit(p_org);
begin
  if p_extra > 0 and v_used + p_extra > v_limit then
    raise exception 'Not enough paid seats: % of % in use, and this needs % more.', v_used, v_limit, p_extra
      using errcode = 'P0001', hint = 'no_seats';
  end if;
end;
$$;

create function private.enforce_paid_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role < 'contributor' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.role >= 'contributor' then
    return new;
  end if;
  if (select auth.uid()) is null and current_setting('vpmo.seeding', true) = 'on' then
    return new;
  end if;
  perform private.lock_seats(new.organisation_id);
  if private.is_paid_member(new.organisation_id, new.profile_id) then
    return new;
  end if;
  perform private.assert_seats_for(new.organisation_id, 1);
  return new;
end;
$$;

create trigger organisation_members_seat_limit
  before insert or update of role on public.organisation_members
  for each row execute function private.enforce_paid_seat();

-- Runs after workspace_members_fill_org (triggers fire in name order), so organisation_id is set.
create trigger workspace_members_seat_limit
  before insert or update of role on public.workspace_members
  for each row execute function private.enforce_paid_seat();

-- =================================================================================================
-- 4. Shared private helpers
-- =================================================================================================

create function private.assert_org_admin(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_org, 'admin') then
    raise exception 'Only an organisation admin can do this' using errcode = '42501';
  end if;
end;
$$;

create function private.write_audit(p_org uuid, p_action text, p_table text, p_entity uuid, p_detail jsonb,
                                    p_actor uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (organisation_id, actor_id, action, entity_table, entity_id, detail)
  values (p_org, coalesce(p_actor, (select auth.uid())), p_action, p_table, p_entity, coalesce(p_detail, '{}'::jsonb));
$$;

-- The signed-in user's address from auth.users (never profiles.email).
create function private.auth_email()
returns table (email text, confirmed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email), u.email_confirmed_at is not null
  from auth.users u
  where u.id = (select auth.uid());
$$;

-- Entra tenant of the signed-in user's Microsoft identity, from the validated ID token claims.
create function private.auth_entra_tenant()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(
    i.identity_data -> 'custom_claims' ->> 'tid',
    substring(i.identity_data ->> 'iss' from 'login\.microsoftonline\.com/([0-9A-Fa-f-]{36})/')
  ))
  from auth.identities i
  where i.user_id = (select auth.uid()) and i.provider = 'azure'
  order by i.last_sign_in_at desc nulls last
  limit 1;
$$;

create function private.email_domain(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(lower(split_part(coalesce(p_email, ''), '@', 2)), '');
$$;

create function private.is_personal_email_domain(p_domain text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_domain, '')) = any (array[
    'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.co.uk', 'hotmail.com', 'hotmail.co.uk',
    'live.com', 'live.co.uk', 'msn.com', 'passport.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com',
    'rocketmail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'aol.co.uk', 'proton.me',
    'protonmail.com', 'pm.me', 'gmx.com', 'gmx.co.uk', 'gmx.de', 'mail.com', 'zoho.com',
    'yandex.com', 'tutanota.com', 'fastmail.com', 'hey.com', 'btinternet.com', 'sky.com',
    'virginmedia.com', 'talktalk.net', 'ntlworld.com', 'blueyonder.co.uk', 'tiscali.co.uk'
  ]);
$$;

-- Personal Microsoft accounts (outlook.com, hotmail ...) all sign in from this tenant.
create function private.is_consumer_entra_tenant(p_tid text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_tid, '')) = '9188040d-6c67-4c5b-b112-36a304b66dad';
$$;

create function private.invite_emails_last_day(p_org uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.audit_log a
  where a.organisation_id = p_org and a.action = 'invite.sent' and a.created_at > now() - interval '1 day';
$$;

-- Workspaces must be active and in the organisation; at least one unless the role is pmo/admin
-- (who act in every workspace anyway).
create function private.assert_join_workspaces(p_org uuid, p_workspaces uuid[], p_role public.app_role)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_role < 'pmo' and cardinality(coalesce(p_workspaces, '{}')) = 0 then
    raise exception 'Pick at least one workspace' using errcode = '22023', hint = 'workspace_required';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_workspaces, '{}')) w(id)
    where not exists (
      select 1 from public.workspaces x
      where x.id = w.id and x.organisation_id = p_org and x.archived_at is null
    )
  ) then
    raise exception 'Pick active workspaces in this organisation' using errcode = '22023';
  end if;
end;
$$;

-- Adds a person to the organisation and workspaces. The seat trigger checks seats.
create function private.add_member(p_org uuid, p_profile uuid, p_role public.app_role, p_workspaces uuid[],
                                   p_created_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organisation_members (organisation_id, profile_id, role, created_by)
  values (p_org, p_profile, p_role, p_created_by);
  insert into public.workspace_members (workspace_id, organisation_id, profile_id, role, created_by)
  select w.id, p_org, p_profile, p_role, p_created_by
  from public.workspaces w
  where w.id = any (coalesce(p_workspaces, '{}')) and w.organisation_id = p_org and w.archived_at is null
  on conflict (workspace_id, profile_id) do nothing;
end;
$$;

-- =================================================================================================
-- 5. Members and seats RPCs (authenticated)
-- =================================================================================================

create function public.get_seat_usage(p_organisation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_organisation_id = any (private.my_org_ids()) then (
    select jsonb_build_object(
      'used', private.seats_used(p_organisation_id),
      'limit', private.seat_limit(p_organisation_id),
      'paid_members', private.paid_seat_count(p_organisation_id),
      'pending_paid_invites', (
        select count(*) from public.organisation_invites i
        where i.organisation_id = p_organisation_id and i.accepted_at is null and i.revoked_at is null
          and i.expires_at > now() and i.role >= 'contributor'),
      'viewers', (
        select count(*) from public.organisation_members m
        where m.organisation_id = p_organisation_id
          and not private.is_paid_member(p_organisation_id, m.profile_id)),
      'on_trial', s.stripe_subscription_id is null and s.plan <> 'demo',
      'trial_seat_allowance', s.trial_seat_allowance,
      'seats_total', s.seats_total,
      'scheduled_seats', s.scheduled_seats,
      'scheduled_interval', s.scheduled_interval,
      'scheduled_change_at', s.scheduled_change_at)
    from public.organisation_subscriptions s
    where s.organisation_id = p_organisation_id
  ) end;
$$;

-- Every member can see the list; last sign-in is shown to admins only.
create function public.list_organisation_members(p_organisation_id uuid)
returns table (
  profile_id uuid, display_name text, email text, role public.app_role, tier text,
  providers text[], joined_at timestamptz, last_sign_in_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.profile_id,
         p.display_name,
         coalesce(u.email, p.email),
         m.role,
         case when m.role = 'admin' then 'admin'
              when private.is_paid_member(m.organisation_id, m.profile_id) then 'member'
              else 'viewer' end,
         array(select jsonb_array_elements_text(coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb))),
         m.created_at,
         case when private.has_org_role(p_organisation_id, 'admin') then u.last_sign_in_at end
  from public.organisation_members m
  join public.profiles p on p.id = m.profile_id
  left join auth.users u on u.id = m.profile_id
  where m.organisation_id = p_organisation_id
    and p_organisation_id = any (private.my_org_ids())
  order by lower(p.display_name);
$$;

create function public.change_member_role(p_organisation_id uuid, p_profile_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.app_role;
  v_was_paid boolean;
  v_workspace_rows integer := 0;
begin
  perform private.assert_org_admin(p_organisation_id);
  perform private.lock_seats(p_organisation_id);
  select m.role into v_old from public.organisation_members m
  where m.organisation_id = p_organisation_id and m.profile_id = p_profile_id
  for update;
  if not found then
    raise exception 'That person is not a member of this organisation' using errcode = 'P0002';
  end if;
  v_was_paid := private.is_paid_member(p_organisation_id, p_profile_id);
  -- guard_last_admin and the seat trigger run on this update.
  update public.organisation_members m set role = p_role
  where m.organisation_id = p_organisation_id and m.profile_id = p_profile_id and m.role <> p_role;
  if p_role = 'viewer' then
    -- A viewer is free and read-only everywhere, including someone who was a member only
    -- through a workspace role (organisation role already viewer).
    update public.workspace_members wm set role = 'viewer'
    where wm.organisation_id = p_organisation_id and wm.profile_id = p_profile_id and wm.role > 'viewer';
    get diagnostics v_workspace_rows = row_count;
  elsif v_old = 'viewer' then
    -- Promoted from viewer: their workspace access rises with them.
    update public.workspace_members wm set role = p_role
    where wm.organisation_id = p_organisation_id and wm.profile_id = p_profile_id and wm.role < p_role;
  end if;
  if v_old <> p_role or v_workspace_rows > 0 then
    perform private.write_audit(p_organisation_id, 'member.role_changed', 'organisation_members', p_profile_id,
                                jsonb_build_object('from', v_old, 'to', p_role, 'was_paid', v_was_paid,
                                                   'workspace_roles_lowered', v_workspace_rows));
  end if;
end;
$$;

create function public.remove_member(p_organisation_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_email text;
begin
  perform private.assert_org_admin(p_organisation_id);
  perform private.lock_seats(p_organisation_id);
  select m.role, p.email into v_role, v_email
  from public.organisation_members m join public.profiles p on p.id = m.profile_id
  where m.organisation_id = p_organisation_id and m.profile_id = p_profile_id
  for update of m;
  if not found then
    raise exception 'That person is not a member of this organisation' using errcode = 'P0002';
  end if;
  -- guard_last_admin refuses removing the last admin; workspace_members cascade.
  delete from public.organisation_members m
  where m.organisation_id = p_organisation_id and m.profile_id = p_profile_id;
  update public.profiles p set last_organisation_id = null
  where p.id = p_profile_id and p.last_organisation_id = p_organisation_id;
  perform private.write_audit(p_organisation_id, 'member.removed', 'organisation_members', p_profile_id,
                              jsonb_build_object('email', v_email, 'role', v_role));
end;
$$;

-- =================================================================================================
-- 6. Invite RPCs
-- =================================================================================================

-- p_invites: [{"email": "...", "role": "contributor"}, ...]. Returns one result per address:
-- {"email", "outcome": created | invalid_email | duplicate | already_member | already_invited, "invite_id"}.
-- All or nothing on seats: if the paid invites don't fit, nothing is created.
create function public.create_invites(p_organisation_id uuid, p_invites jsonb, p_workspace_ids uuid[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item jsonb;
  v_email text;
  v_role public.app_role;
  v_id uuid;
  v_seen text[] := '{}';
  v_out jsonb := '[]'::jsonb;
  v_new_paid integer := 0;
  v_used integer;
  v_limit integer;
begin
  perform private.assert_org_admin(p_organisation_id);
  if exists (select 1 from public.organisations o where o.id = p_organisation_id and o.is_demo) then
    raise exception 'The demo organisation can''t send invitations' using errcode = '42501';
  end if;
  if jsonb_typeof(p_invites) is distinct from 'array' or jsonb_array_length(p_invites) not between 1 and 20 then
    raise exception 'Invite between 1 and 20 people at a time' using errcode = '22023';
  end if;

  perform private.lock_seats(p_organisation_id);
  v_used := private.seats_used(p_organisation_id);
  v_limit := private.seat_limit(p_organisation_id);
  if private.invite_emails_last_day(p_organisation_id) + jsonb_array_length(p_invites) > 50 then
    raise exception 'This organisation can send 50 invitations a day. Try again tomorrow.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  for v_item in select value from jsonb_array_elements(p_invites) loop
    v_email := lower(btrim(coalesce(v_item ->> 'email', '')));
    if coalesce(v_item ->> 'role', '') not in ('viewer', 'contributor', 'manager', 'pmo', 'admin') then
      raise exception 'Choose a role for %', v_email using errcode = '22023';
    end if;
    v_role := (v_item ->> 'role')::public.app_role;
    perform private.assert_join_workspaces(p_organisation_id, p_workspace_ids, v_role);

    if length(v_email) > 320 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_out := v_out || jsonb_build_object('email', v_email, 'outcome', 'invalid_email');
      continue;
    end if;
    if v_email = any (v_seen) then
      v_out := v_out || jsonb_build_object('email', v_email, 'outcome', 'duplicate');
      continue;
    end if;
    v_seen := v_seen || v_email;
    if exists (
      select 1 from public.organisation_members m join auth.users u on u.id = m.profile_id
      where m.organisation_id = p_organisation_id and lower(u.email) = v_email
    ) then
      v_out := v_out || jsonb_build_object('email', v_email, 'outcome', 'already_member');
      continue;
    end if;
    if exists (
      select 1 from public.organisation_invites i
      where i.organisation_id = p_organisation_id and i.email = v_email
        and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    ) then
      v_out := v_out || jsonb_build_object('email', v_email, 'outcome', 'already_invited');
      continue;
    end if;
    -- An expired invitation for the same address is replaced.
    update public.organisation_invites i set revoked_at = now(), revoked_by = v_uid
    where i.organisation_id = p_organisation_id and i.email = v_email
      and i.accepted_at is null and i.revoked_at is null;

    insert into public.organisation_invites (organisation_id, email, role, invited_by)
    values (p_organisation_id, v_email, v_role, v_uid)
    returning id into v_id;
    insert into public.organisation_invite_workspaces (invite_id, organisation_id, workspace_id)
    select distinct v_id, p_organisation_id, w from unnest(coalesce(p_workspace_ids, '{}')) w;
    if v_role >= 'contributor' then
      v_new_paid := v_new_paid + 1;
    end if;
    perform private.write_audit(p_organisation_id, 'invite.created', 'organisation_invites', v_id,
                                jsonb_build_object('email', v_email, 'role', v_role,
                                                   'workspace_ids', to_jsonb(coalesce(p_workspace_ids, '{}'))));
    v_out := v_out || jsonb_build_object('email', v_email, 'outcome', 'created', 'invite_id', v_id);
  end loop;

  if v_new_paid > 0 and v_used + v_new_paid > v_limit then
    raise exception 'Not enough paid seats: % of % in use, and these invitations need % more.',
      v_used, v_limit, v_new_paid
      using errcode = 'P0001', hint = 'no_seats';
  end if;
  return v_out;
end;
$$;

-- Extends the invitation by 7 days and clears the token; send-invite then issues a new one.
create function public.resend_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.organisation_invites;
begin
  select * into v_inv from public.organisation_invites i where i.id = p_invite_id;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  perform private.assert_org_admin(v_inv.organisation_id);
  perform private.lock_seats(v_inv.organisation_id);
  select * into v_inv from public.organisation_invites i where i.id = p_invite_id for update;
  if v_inv.accepted_at is not null then
    raise exception 'This invitation has already been accepted' using errcode = 'P0001', hint = 'invite_used';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'This invitation was revoked' using errcode = 'P0001', hint = 'invite_revoked';
  end if;
  if private.invite_emails_last_day(v_inv.organisation_id) >= 50 then
    raise exception 'This organisation can send 50 invitations a day. Try again tomorrow.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if (select count(*) from public.audit_log a
      where a.organisation_id = v_inv.organisation_id and a.entity_table = 'organisation_invites'
        and a.entity_id = p_invite_id and a.action = 'invite.sent'
        and a.created_at > now() - interval '1 day') >= 3 then
    raise exception 'This invitation has been emailed 3 times today. Try again tomorrow.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  -- An expired paid invitation isn't holding a seat; renewing it takes one again.
  if v_inv.expires_at <= now() and v_inv.role >= 'contributor' then
    perform private.assert_seats_for(v_inv.organisation_id, 1);
  end if;
  update public.organisation_invites i
  set expires_at = now() + interval '7 days', token_hash = null
  where i.id = p_invite_id;
end;
$$;

create function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.organisation_invites;
begin
  select * into v_inv from public.organisation_invites i where i.id = p_invite_id;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  perform private.assert_org_admin(v_inv.organisation_id);
  update public.organisation_invites i set revoked_at = now(), revoked_by = (select auth.uid())
  where i.id = p_invite_id and i.accepted_at is null and i.revoked_at is null;
  if not found then
    raise exception 'This invitation is no longer pending' using errcode = 'P0001', hint = 'invite_not_pending';
  end if;
  perform private.write_audit(v_inv.organisation_id, 'invite.revoked', 'organisation_invites', p_invite_id,
                              jsonb_build_object('email', v_inv.email, 'role', v_inv.role));
end;
$$;

-- What the /invite page shows before and after sign-in. Callable signed out (anon): it only
-- reveals the organisation name, role, inviter name and a masked address to the link holder.
create function public.get_invite_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.organisation_invites;
  v_org text;
  v_inviter text;
  v_my_email text;
  v_confirmed boolean;
begin
  if p_token is null or length(p_token) not between 32 and 128 then
    return jsonb_build_object('status', 'not_found');
  end if;
  select * into v_inv from public.organisation_invites i
  where i.token_hash = sha256(convert_to(p_token, 'UTF8'));
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  select o.name into v_org from public.organisations o where o.id = v_inv.organisation_id;
  select p.display_name into v_inviter from public.profiles p where p.id = v_inv.invited_by;
  select e.email, e.confirmed into v_my_email, v_confirmed from private.auth_email() e;
  return jsonb_build_object(
    'status', case
      when v_inv.accepted_at is not null then 'accepted'
      when v_inv.revoked_at is not null then 'revoked'
      when v_inv.expires_at <= now() then 'expired'
      else 'valid' end,
    'organisation_name', v_org,
    'role', v_inv.role,
    'inviter_name', v_inviter,
    'email_hint', left(v_inv.email, 1) || '•••@' || private.email_domain(v_inv.email),
    'expires_at', v_inv.expires_at,
    'accepted_by_me', v_inv.accepted_by is not null and v_inv.accepted_by = (select auth.uid()),
    'email_matches', case when v_my_email is null then null else v_my_email = v_inv.email end,
    'email_confirmed', v_confirmed);
end;
$$;

create function public.accept_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_org uuid;
  v_inv public.organisation_invites;
  v_email text;
  v_confirmed boolean;
  v_status text := 'joined';
begin
  if v_uid is null then
    raise exception 'Sign in to accept this invitation' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) not between 32 and 128 then
    raise exception 'This invitation link isn''t valid' using errcode = 'P0002', hint = 'invite_not_found';
  end if;
  select i.id, i.organisation_id into v_id, v_org from public.organisation_invites i
  where i.token_hash = sha256(convert_to(p_token, 'UTF8'));
  if not found then
    raise exception 'This invitation link isn''t valid any more. If you were sent a newer invitation, use the link in that email.'
      using errcode = 'P0002', hint = 'invite_not_found';
  end if;

  perform private.lock_seats(v_org);
  select * into v_inv from public.organisation_invites i where i.id = v_id for update;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = v_uid then
      return jsonb_build_object('organisation_id', v_org, 'status', 'already_member');
    end if;
    raise exception 'This invitation has already been used' using errcode = 'P0001', hint = 'invite_used';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'This invitation was withdrawn by an admin' using errcode = 'P0001', hint = 'invite_revoked';
  end if;
  if v_inv.expires_at <= now() then
    raise exception 'This invitation expired on %. Ask an admin to send a new one.',
      to_char(v_inv.expires_at at time zone 'Europe/London', 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'invite_expired';
  end if;
  select e.email, e.confirmed into v_email, v_confirmed from private.auth_email() e;
  if not coalesce(v_confirmed, false) then
    raise exception 'Confirm your email address before accepting this invitation'
      using errcode = 'P0001', hint = 'email_unconfirmed';
  end if;
  if v_email is distinct from v_inv.email then
    raise exception 'This invitation was sent to a different email address (%). You are signed in as %.',
      left(v_inv.email, 1) || '•••@' || private.email_domain(v_inv.email), v_email
      using errcode = 'P0001', hint = 'invite_wrong_email';
  end if;

  -- Mark accepted first so the pending invitation stops counting as a seat before the member
  -- row is counted.
  update public.organisation_invites i set accepted_at = now(), accepted_by = v_uid where i.id = v_id;
  if exists (select 1 from public.organisation_members m where m.organisation_id = v_org and m.profile_id = v_uid) then
    v_status := 'already_member';
  else
    perform private.add_member(v_org, v_uid, v_inv.role,
      array(select w.workspace_id from public.organisation_invite_workspaces w where w.invite_id = v_id),
      v_inv.invited_by);
  end if;
  update public.organisation_join_requests r set status = 'withdrawn'
  where r.organisation_id = v_org and r.profile_id = v_uid and r.status = 'pending';
  update public.profiles p set last_organisation_id = v_org where p.id = v_uid;
  perform private.write_audit(v_org, 'invite.accepted', 'organisation_invites', v_id,
                              jsonb_build_object('email', v_inv.email, 'role', v_inv.role, 'result', v_status));
  return jsonb_build_object('organisation_id', v_org, 'status', v_status);
end;
$$;

-- =================================================================================================
-- 7. Invite email RPCs (service role only; called by the send-invite edge function)
-- =================================================================================================

-- Stores the new token hash for an open invitation and returns what the email needs.
create function public.issue_invite_token(p_invite_id uuid, p_token_hash bytea, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.organisation_invites;
begin
  if octet_length(p_token_hash) is distinct from 32 then
    raise exception 'Token hash must be 32 bytes' using errcode = '22023';
  end if;
  update public.organisation_invites i set token_hash = p_token_hash
  where i.id = p_invite_id and i.accepted_at is null and i.revoked_at is null
    and i.expires_at > now() and i.token_hash is null
  returning * into v_inv;
  if not found then
    raise exception 'This invitation can''t be sent' using errcode = 'P0001', hint = 'invite_not_sendable';
  end if;
  return jsonb_build_object(
    'email', v_inv.email,
    'role', v_inv.role,
    'expires_at', v_inv.expires_at,
    'organisation_id', v_inv.organisation_id,
    'organisation_name', (select o.name from public.organisations o where o.id = v_inv.organisation_id),
    'inviter_name', (select p.display_name from public.profiles p where p.id = coalesce(p_actor, v_inv.invited_by)));
end;
$$;

-- Records the result of the email. On failure the token is cleared so Resend can try again.
create function public.mark_invite_sent(p_invite_id uuid, p_actor uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.organisation_invites;
begin
  if p_error is null then
    update public.organisation_invites i
    set last_sent_at = now(), send_count = i.send_count + 1
    where i.id = p_invite_id
    returning * into v_inv;
  else
    update public.organisation_invites i set token_hash = null
    where i.id = p_invite_id
    returning * into v_inv;
  end if;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  perform private.write_audit(
    v_inv.organisation_id,
    case when p_error is null then 'invite.sent' else 'invite.send_failed' end,
    'organisation_invites', p_invite_id,
    jsonb_build_object('email', v_inv.email, 'role', v_inv.role, 'send_count', v_inv.send_count)
      || case when p_error is null then '{}'::jsonb else jsonb_build_object('error', left(p_error, 300)) end,
    p_actor);
end;
$$;

-- =================================================================================================
-- 8. Join domains and join requests
-- =================================================================================================

create function public.set_join_requests_enabled(p_organisation_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_org_admin(p_organisation_id);
  if exists (select 1 from public.organisations o where o.id = p_organisation_id and o.is_demo) then
    raise exception 'The demo organisation can''t take join requests' using errcode = '42501';
  end if;
  insert into public.organisation_join_settings (organisation_id, requests_enabled, updated_by, updated_at)
  values (p_organisation_id, p_enabled, (select auth.uid()), now())
  on conflict (organisation_id) do update
    set requests_enabled = excluded.requests_enabled, updated_by = excluded.updated_by, updated_at = now();
  perform private.write_audit(p_organisation_id, 'join_settings.changed', 'organisation_join_settings',
                              p_organisation_id, jsonb_build_object('requests_enabled', p_enabled));
end;
$$;

-- p_kind 'email_domain': adds the domain of the admin's own confirmed email.
-- p_kind 'entra_tenant': adds the tenant of the admin's own Microsoft sign-in.
-- Nothing else can be added (DNS verification is a possible later option).
create function public.add_join_domain(p_organisation_id uuid, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_confirmed boolean;
  v_value text;
  v_via text;
  v_id uuid;
begin
  perform private.assert_org_admin(p_organisation_id);
  if exists (select 1 from public.organisations o where o.id = p_organisation_id and o.is_demo) then
    raise exception 'The demo organisation can''t take join requests' using errcode = '42501';
  end if;
  if p_kind = 'email_domain' then
    select e.email, e.confirmed into v_email, v_confirmed from private.auth_email() e;
    if not coalesce(v_confirmed, false) then
      raise exception 'Confirm your email address first' using errcode = 'P0001', hint = 'email_unconfirmed';
    end if;
    v_value := private.email_domain(v_email);
    if v_value is null or private.is_personal_email_domain(v_value) then
      raise exception 'Personal email domains such as % can''t be used', coalesce(v_value, 'this')
        using errcode = 'P0001', hint = 'personal_domain';
    end if;
    v_via := 'admin_email';
  elsif p_kind = 'entra_tenant' then
    v_value := private.auth_entra_tenant();
    if v_value is null then
      raise exception 'Sign in with Microsoft from your organisation''s account first'
        using errcode = 'P0001', hint = 'no_entra_tenant';
    end if;
    if private.is_consumer_entra_tenant(v_value) then
      raise exception 'Personal Microsoft accounts can''t be used' using errcode = 'P0001', hint = 'personal_domain';
    end if;
    v_via := 'admin_microsoft_sign_in';
  else
    raise exception 'Unknown kind %', p_kind using errcode = '22023';
  end if;

  insert into public.organisation_join_domains (organisation_id, kind, value, verified_by, verified_via)
  values (p_organisation_id, p_kind, v_value, (select auth.uid()), v_via)
  on conflict (organisation_id, kind, value) do nothing
  returning id into v_id;
  if v_id is null then
    select d.id into v_id from public.organisation_join_domains d
    where d.organisation_id = p_organisation_id and d.kind = p_kind and d.value = v_value;
  else
    perform private.write_audit(p_organisation_id, 'join_domain.added', 'organisation_join_domains', v_id,
                                jsonb_build_object('kind', p_kind, 'value', v_value));
  end if;
  return v_id;
end;
$$;

create function public.remove_join_domain(p_domain_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.organisation_join_domains;
begin
  select * into v_row from public.organisation_join_domains d where d.id = p_domain_id;
  if not found then
    raise exception 'Domain not found' using errcode = 'P0002';
  end if;
  perform private.assert_org_admin(v_row.organisation_id);
  delete from public.organisation_join_domains d where d.id = p_domain_id;
  perform private.write_audit(v_row.organisation_id, 'join_domain.removed', 'organisation_join_domains', p_domain_id,
                              jsonb_build_object('kind', v_row.kind, 'value', v_row.value));
end;
$$;

-- Organisations the signed-in user may ask to join (exact confirmed email domain, or Entra tenant).
create function public.find_joinable_organisations()
returns table (organisation_id uuid, organisation_name text, matched_by text, request_status text,
               requested_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select e.email, e.confirmed, private.email_domain(e.email) as domain, private.auth_entra_tenant() as tid
    from private.auth_email() e
  )
  select distinct on (o.id) o.id, o.name, d.kind, r.status, r.created_at
  from me
  join public.organisation_join_domains d
    on (d.kind = 'email_domain' and me.confirmed and d.value = me.domain
        and not private.is_personal_email_domain(me.domain))
    or (d.kind = 'entra_tenant' and me.tid is not null and d.value = me.tid
        and not private.is_consumer_entra_tenant(me.tid))
  join public.organisation_join_settings js on js.organisation_id = d.organisation_id and js.requests_enabled
  join public.organisations o on o.id = d.organisation_id and not o.is_demo
  left join lateral (
    select r.status, r.created_at from public.organisation_join_requests r
    where r.organisation_id = o.id and r.profile_id = (select auth.uid())
    order by r.created_at desc limit 1
  ) r on true
  where not exists (
    select 1 from public.organisation_members m
    where m.organisation_id = o.id and m.profile_id = (select auth.uid())
  )
  order by o.id, (d.kind = 'entra_tenant') desc;
$$;

create function public.request_to_join(p_organisation_id uuid, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_matched text;
  v_email text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select f.matched_by into v_matched from public.find_joinable_organisations() f
  where f.organisation_id = p_organisation_id;
  if v_matched is null then
    raise exception 'You can''t request to join this organisation' using errcode = '42501';
  end if;
  if exists (select 1 from public.organisation_join_requests r
             where r.organisation_id = p_organisation_id and r.profile_id = v_uid and r.status = 'pending') then
    raise exception 'Your request is already waiting for an admin' using errcode = 'P0001', hint = 'join_request_pending';
  end if;
  if exists (select 1 from public.organisation_join_requests r
             where r.organisation_id = p_organisation_id and r.profile_id = v_uid and r.status = 'declined'
               and r.decided_at > now() - interval '7 days') then
    raise exception 'Your last request was declined. You can ask again 7 days after that.'
      using errcode = 'P0001', hint = 'join_request_cooldown';
  end if;
  if (select count(*) from public.organisation_join_requests r
      where r.profile_id = v_uid and r.created_at > now() - interval '1 day') >= 5 then
    raise exception 'You can send 5 join requests a day. Try again tomorrow.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  if length(p_message) > 500 then
    raise exception 'Keep the message under 500 characters' using errcode = '22023';
  end if;
  select e.email into v_email from private.auth_email() e;
  insert into public.organisation_join_requests (organisation_id, profile_id, email, matched_by, message)
  values (p_organisation_id, v_uid, v_email, v_matched, nullif(btrim(p_message), ''))
  returning id into v_id;
  perform private.write_audit(p_organisation_id, 'join_request.created', 'organisation_join_requests', v_id,
                              jsonb_build_object('email', v_email, 'matched_by', v_matched));
  return v_id;
end;
$$;

create function public.withdraw_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  update public.organisation_join_requests r set status = 'withdrawn'
  where r.id = p_request_id and r.profile_id = (select auth.uid()) and r.status = 'pending'
  returning r.organisation_id into v_org;
  if not found then
    raise exception 'No pending request to withdraw' using errcode = 'P0002';
  end if;
  perform private.write_audit(v_org, 'join_request.withdrawn', 'organisation_join_requests', p_request_id, '{}'::jsonb);
end;
$$;

create function public.decide_join_request(p_request_id uuid, p_approve boolean,
                                           p_role public.app_role default 'viewer',
                                           p_workspace_ids uuid[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.organisation_join_requests;
begin
  select * into v_req from public.organisation_join_requests r where r.id = p_request_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  perform private.assert_org_admin(v_req.organisation_id);
  perform private.lock_seats(v_req.organisation_id);
  select * into v_req from public.organisation_join_requests r where r.id = p_request_id for update;
  if v_req.status <> 'pending' then
    raise exception 'This request has already been dealt with' using errcode = 'P0001', hint = 'join_request_decided';
  end if;

  if not p_approve then
    update public.organisation_join_requests r
    set status = 'declined', decided_by = v_uid, decided_at = now()
    where r.id = p_request_id;
    perform private.write_audit(v_req.organisation_id, 'join_request.declined', 'organisation_join_requests',
                                p_request_id, jsonb_build_object('email', v_req.email));
    return;
  end if;

  perform private.assert_join_workspaces(v_req.organisation_id, p_workspace_ids, p_role);
  if not exists (select 1 from public.organisation_members m
                 where m.organisation_id = v_req.organisation_id and m.profile_id = v_req.profile_id) then
    perform private.add_member(v_req.organisation_id, v_req.profile_id, p_role, p_workspace_ids, v_uid);
  end if;
  update public.organisation_join_requests r
  set status = 'approved', decided_role = p_role, decided_by = v_uid, decided_at = now()
  where r.id = p_request_id;
  update public.profiles p set last_organisation_id = v_req.organisation_id
  where p.id = v_req.profile_id and p.last_organisation_id is null;
  perform private.write_audit(v_req.organisation_id, 'join_request.approved', 'organisation_join_requests',
                              p_request_id, jsonb_build_object('email', v_req.email, 'role', p_role));
end;
$$;

-- Service role only (notify-join-request edge function): claims the one notification for a
-- pending request made by p_requester and returns what the admin email needs. Null if already sent.
create function public.claim_join_request_notification(p_request_id uuid, p_requester uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.organisation_join_requests;
begin
  update public.organisation_join_requests r set notified_at = now()
  where r.id = p_request_id and r.profile_id = p_requester and r.status = 'pending' and r.notified_at is null
  returning * into v_req;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'organisation_id', v_req.organisation_id,
    'organisation_name', (select o.name from public.organisations o where o.id = v_req.organisation_id),
    'requester_name', (select p.display_name from public.profiles p where p.id = v_req.profile_id),
    'requester_email', v_req.email,
    'matched_by', v_req.matched_by,
    'message', v_req.message,
    'admin_emails', coalesce((
      select jsonb_agg(u.email order by u.email)
      from public.organisation_members m join auth.users u on u.id = m.profile_id
      where m.organisation_id = v_req.organisation_id and m.role = 'admin' and u.email_confirmed_at is not null
    ), '[]'::jsonb));
end;
$$;

-- =================================================================================================
-- 9. Billing audit
-- =================================================================================================

-- Called by the seat / plan edge functions with the admin's JWT, so the audit row has the admin
-- as actor. What Stripe actually applied is recorded by the trigger below.
create function public.record_billing_request(p_organisation_id uuid, p_action text, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_org_admin(p_organisation_id);
  if p_action not in ('billing.seats_added', 'billing.seat_reduction_scheduled', 'billing.scheduled_change_cancelled',
                      'billing.interval_switch_scheduled') then
    raise exception 'Unknown billing action %', p_action using errcode = '22023';
  end if;
  perform private.write_audit(p_organisation_id, p_action, 'organisation_subscriptions', p_organisation_id,
                              coalesce(p_detail, '{}'::jsonb));
end;
$$;

create function private.audit_seat_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text := case when (select auth.uid()) is null then 'stripe' else 'app' end;
begin
  if new.seats_total is distinct from old.seats_total then
    perform private.write_audit(new.organisation_id, 'seats.changed', 'organisation_subscriptions', new.organisation_id,
                                jsonb_build_object('from', old.seats_total, 'to', new.seats_total, 'source', v_source));
  end if;
  if (new.scheduled_seats, new.scheduled_interval, new.scheduled_change_at)
     is distinct from (old.scheduled_seats, old.scheduled_interval, old.scheduled_change_at) then
    perform private.write_audit(
      new.organisation_id,
      case when new.scheduled_change_at is null then 'seats.scheduled_change_cleared' else 'seats.change_scheduled' end,
      'organisation_subscriptions', new.organisation_id,
      jsonb_build_object('seats', new.scheduled_seats, 'interval', new.scheduled_interval,
                         'at', new.scheduled_change_at, 'source', v_source));
  end if;
  return null;
end;
$$;

create trigger organisation_subscriptions_audit_seats
  after update on public.organisation_subscriptions
  for each row execute function private.audit_seat_change();

-- =================================================================================================
-- 10. Viewers are read-only: close the role-free write paths
-- =================================================================================================

-- Resources linked to me in organisations where I hold a paid seat. Replaces my_resource_ids()
-- in write checks only (my_resource_ids itself is unchanged).
create function private.my_writable_resource_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.id), '{}')
  from public.resources r
  where r.profile_id = (select auth.uid())
    and private.is_paid_member(r.organisation_id, (select auth.uid()));
$$;

-- Was: chair of an active forum. Now also a paid member of the forum's organisation.
create or replace function private.is_forum_chair(p_forum_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.forums f
    join public.resources r on r.id = f.chair_resource_id and r.organisation_id = f.organisation_id
    where f.id = p_forum_id and f.active and r.profile_id = (select auth.uid())
      and private.workspace_is_active(f.workspace_id)
      and private.is_paid_member(f.organisation_id, (select auth.uid()))
  );
$$;

-- Was: workspace PMO, or (any workspace role and decision maker / chair). The decision-maker
-- branch now also needs a paid seat.
create or replace function private.can_record_decision(p_decision public.decisions)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select p_decision.workspace_id = any (private.my_workspace_ids('pmo'))
    or (
      p_decision.workspace_id = any (private.my_workspace_ids())
      and private.workspace_is_active(p_decision.workspace_id)
      and private.is_paid_member(p_decision.organisation_id, (select auth.uid()))
      and (
        exists (
          select 1 from public.resources r
          where r.id = p_decision.decision_maker_id and r.profile_id = (select auth.uid())
        )
        or private.is_forum_chair(p_decision.forum_id)
      )
    );
$$;

-- Was: my_resource_ids(). Now my_writable_resource_ids().
create or replace function private.can_edit_programme_note(p_programme uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce((
    select p.archived_at is null
       and (p.workspace_id = any (private.my_workspace_ids('pmo'))
            or (p.manager_id = any (private.my_writable_resource_ids())
                and p.workspace_id = any (private.my_workspace_ids())
                and private.workspace_is_active(p.workspace_id)))
    from public.programmes p
    where p.id = p_programme
  ), false);
$$;

-- Was: created by me or requested by my resource. Now also a paid member of the request's org.
create or replace function private.my_authored_request_ids()
returns uuid[]
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(array_agg(r.id), '{}')
  from public.project_requests r
  where (r.created_by = (select auth.uid()) or r.requester_id = any (private.my_resource_ids()))
    and private.workspace_is_active(r.workspace_id)
    and private.is_paid_member(r.organisation_id, (select auth.uid()));
$$;

alter policy resource_leave_insert on public.resource_leave
  with check ((organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[]))
              or (resource_id = any ((select private.my_writable_resource_ids())::uuid[])));
alter policy resource_leave_update on public.resource_leave
  using ((organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[]))
         or (resource_id = any ((select private.my_writable_resource_ids())::uuid[])))
  with check ((organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[]))
              or (resource_id = any ((select private.my_writable_resource_ids())::uuid[])));
alter policy resource_leave_delete on public.resource_leave
  using ((organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[]))
         or (resource_id = any ((select private.my_writable_resource_ids())::uuid[])));

alter policy work_item_offers_update on public.work_item_offers
  using ((response is null)
         and (select private.workspace_is_active(work_item_offers.workspace_id))
         and ((issued_to = any ((select private.my_writable_resource_ids())::uuid[]))
              or (issued_by = any ((select private.my_writable_resource_ids())::uuid[]))
              or (workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]))))
  with check ((select private.workspace_is_active(work_item_offers.workspace_id))
              and ((issued_to = any ((select private.my_writable_resource_ids())::uuid[]))
                   or (issued_by = any ((select private.my_writable_resource_ids())::uuid[]))
                   or (workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]))));

-- Dashboards and saved views: unchanged, plus "shared needs a paid seat".
alter policy dashboards_insert on public.dashboards
  with check ((owner_id = (select auth.uid()))
              and case when workspace_id is null
                       then organisation_id = any ((select private.my_org_ids())::uuid[])
                       else workspace_id = any ((select private.my_workspace_ids())::uuid[]) end
              and (not is_shared or (select private.is_paid_member(dashboards.organisation_id, (select auth.uid())))));
alter policy dashboards_update on public.dashboards
  using ((owner_id = (select auth.uid()))
         or (is_shared and case when workspace_id is null
                                then organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[])
                                else workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]) end))
  with check (((owner_id = (select auth.uid()))
               or (is_shared and case when workspace_id is null
                                      then organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[])
                                      else workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]) end))
              and (not is_shared or (select private.is_paid_member(dashboards.organisation_id, (select auth.uid())))));

alter policy saved_views_insert on public.saved_views
  with check ((owner_id = (select auth.uid()))
              and case when workspace_id is null
                       then organisation_id = any ((select private.my_org_ids())::uuid[])
                       else workspace_id = any ((select private.my_workspace_ids())::uuid[]) end
              and ((not (is_shared and is_default))
                   or case when workspace_id is null
                           then organisation_id = any ((select private.my_org_ids('pmo'::public.app_role))::uuid[])
                           else workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]) end)
              and (not is_shared or (select private.is_paid_member(saved_views.organisation_id, (select auth.uid())))));
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
                           else workspace_id = any ((select private.my_workspace_ids('pmo'::public.app_role))::uuid[]) end)
              and (not is_shared or (select private.is_paid_member(saved_views.organisation_id, (select auth.uid())))));

-- =================================================================================================
-- 11. Privileges
-- =================================================================================================

-- Organisation membership changes only through the RPCs (seat lock, last-admin lock, audit).
revoke insert, update, delete on public.organisation_members from anon, authenticated;

-- Invites replace the old demo-admin join (0.6 note). Dropped later by hand.
revoke execute on function public.join_demo_organisation() from public, anon, authenticated;

-- Private helpers: nobody but their definer-owned callers ...
revoke execute on function
  private.seats_used(uuid), private.seat_limit(uuid), private.lock_seats(uuid),
  private.assert_seats_for(uuid, integer), private.enforce_paid_seat(), private.assert_org_admin(uuid),
  private.write_audit(uuid, text, text, uuid, jsonb, uuid), private.auth_email(), private.auth_entra_tenant(),
  private.email_domain(text), private.is_personal_email_domain(text), private.is_consumer_entra_tenant(text),
  private.invite_emails_last_day(uuid), private.assert_join_workspaces(uuid, uuid[], public.app_role),
  private.add_member(uuid, uuid, public.app_role, uuid[], uuid), private.audit_seat_change()
  from public, anon, authenticated;
-- ... except the two that RLS policies call as the signed-in user (same pattern as my_org_ids).
revoke execute on function private.is_paid_member(uuid, uuid), private.my_writable_resource_ids() from public, anon;
grant execute on function private.is_paid_member(uuid, uuid), private.my_writable_resource_ids() to authenticated;

-- Signed-in RPCs.
revoke execute on function
  public.get_seat_usage(uuid), public.list_organisation_members(uuid),
  public.change_member_role(uuid, uuid, public.app_role), public.remove_member(uuid, uuid),
  public.create_invites(uuid, jsonb, uuid[]), public.resend_invite(uuid), public.revoke_invite(uuid),
  public.accept_invite(text), public.set_join_requests_enabled(uuid, boolean),
  public.add_join_domain(uuid, text), public.remove_join_domain(uuid), public.find_joinable_organisations(),
  public.request_to_join(uuid, text), public.withdraw_join_request(uuid),
  public.decide_join_request(uuid, boolean, public.app_role, uuid[]),
  public.record_billing_request(uuid, text, jsonb)
  from public, anon;
grant execute on function
  public.get_seat_usage(uuid), public.list_organisation_members(uuid),
  public.change_member_role(uuid, uuid, public.app_role), public.remove_member(uuid, uuid),
  public.create_invites(uuid, jsonb, uuid[]), public.resend_invite(uuid), public.revoke_invite(uuid),
  public.accept_invite(text), public.set_join_requests_enabled(uuid, boolean),
  public.add_join_domain(uuid, text), public.remove_join_domain(uuid), public.find_joinable_organisations(),
  public.request_to_join(uuid, text), public.withdraw_join_request(uuid),
  public.decide_join_request(uuid, boolean, public.app_role, uuid[]),
  public.record_billing_request(uuid, text, jsonb)
  to authenticated;

-- The invite page works signed out.
revoke execute on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated;

-- Edge functions only.
revoke execute on function
  public.issue_invite_token(uuid, bytea, uuid), public.mark_invite_sent(uuid, uuid, text),
  public.claim_join_request_notification(uuid, uuid)
  from public, anon, authenticated;
grant execute on function
  public.issue_invite_token(uuid, bytea, uuid), public.mark_invite_sent(uuid, uuid, text),
  public.claim_join_request_notification(uuid, uuid)
  to service_role;
