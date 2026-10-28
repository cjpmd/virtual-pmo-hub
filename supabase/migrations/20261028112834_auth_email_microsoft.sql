-- Auth: email + password and Microsoft sign-in (docs/sql/auth-email-microsoft.sql).

-- 1 ---------------------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, email)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'New user'
    ),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

-- 2 ---------------------------------------------------------------------------------------
create function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = coalesce(new.email, '')
  where id = new.id and email is distinct from coalesce(new.email, '');
  return new;
end;
$$;
revoke execute on function private.sync_profile_email() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.sync_profile_email();

-- 3 ---------------------------------------------------------------------------------------
alter table public.organisation_subscriptions
  add column trial_ends_at timestamptz;

comment on column public.organisation_subscriptions.trial_ends_at is
  'End of the free trial (set by create_organisation for trial plans). Not enforced until 2.2.';

-- Same body as live, except the organisation_subscriptions insert, which now sets
-- trial_ends_at. Grants are kept by create or replace (authenticated only; no public/anon).
create or replace function public.create_organisation(
  p_name text,
  p_slug text default null,
  p_region text default 'uk',
  p_currency text default 'GBP',
  p_fy_start_month integer default 8,
  p_workspace_name text default 'Main workspace'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org uuid;
  v_ws uuid;
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Sign in to create an organisation' using errcode = '42501';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Organisation name is required' using errcode = '22023';
  end if;
  if p_fy_start_month not between 1 and 12 then
    raise exception 'Financial year start month must be 1-12' using errcode = '22023';
  end if;
  v_slug := coalesce(nullif(btrim(p_slug), ''), trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g')));
  v_slug := left(v_slug, 50);
  if exists (select 1 from public.organisations o where o.slug = v_slug) then
    v_slug := left(v_slug, 44) || '-' || substr(md5(random()::text), 1, 5);
  end if;

  insert into public.organisations (name, short_name, slug, region, settings, created_by)
  values (btrim(p_name), btrim(p_name), v_slug, p_region,
          jsonb_set(jsonb_set(private.default_org_settings(), '{regional,baseCurrency}', to_jsonb(upper(p_currency))),
                    '{regional,financialYearStartMonth}', to_jsonb(p_fy_start_month)),
          v_uid)
  returning id into v_org;
  insert into public.organisation_subscriptions (organisation_id, plan, trial_ends_at)
  values (v_org, 'trial', now() + interval '14 days');
  insert into public.organisation_members (organisation_id, profile_id, role, created_by) values (v_org, v_uid, 'admin', v_uid);
  insert into public.workspaces (organisation_id, name, created_by) values (v_org, coalesce(nullif(btrim(p_workspace_name), ''), 'Main workspace'), v_uid)
  returning id into v_ws;
  insert into public.workspace_members (workspace_id, profile_id, organisation_id, role, created_by) values (v_ws, v_uid, v_org, 'admin', v_uid);
  perform private.seed_org_defaults(v_org);
  update public.profiles set last_organisation_id = v_org where id = v_uid;
  return v_org;
end;
$$;
revoke execute on function public.create_organisation(text, text, text, text, integer, text) from public, anon;
grant execute on function public.create_organisation(text, text, text, text, integer, text) to authenticated;
