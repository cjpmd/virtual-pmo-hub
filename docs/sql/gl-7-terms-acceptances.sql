-- GL-7 follow-up: terms_acceptances. Proposal (not applied to production). Applied locally as
-- supabase/migrations/20261116100000_gl_7_terms_acceptances.sql; this file is the same SQL.
-- No destructive statements.

-- GL-7 follow-up: a record of who accepted which version of the Terms of service (and the DPA they
-- incorporate), for which organisation, when and how. Proposal: docs/sql/gl-7-terms-acceptances.sql.
--
-- * public.terms_acceptances: one row per (organisation, person, terms version). Organisation-
--   scoped (it describes the person's relationship with the organisation's contract, not work in
--   a workspace), so organisation_id only, like organisation_members (AGENTS.md exception list).
-- * Written only by public.accept_terms (SECURITY DEFINER). Nobody can insert, update or delete
--   through the API; a trigger refuses updates and deletes except during an organisation purge
--   (private.in_purge(), GL-11).
-- * Readable by the person (own rows) and by the organisation's admins (all of its rows).
-- * No read-only trigger: an admin of a lapsed organisation must still be able to accept the
--   terms to get past the prompt and subscribe (like audit_log).
-- * Account closure keeps the rows: profile_id then points at the "Former member" tombstone, and
--   the table holds no name or email, so the record is anonymised but still shows that a member
--   accepted version V on date D. Organisation purge deletes them with everything else.

create table public.terms_acceptances (
  id              uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  profile_id      uuid not null references public.profiles (id),
  terms_version   text not null,
  accepted_at     timestamptz not null default now(),
  method          text not null,
  recorded_at     timestamptz not null default now(),
  constraint terms_acceptances_version_check check (terms_version ~ '^\d{4}-\d{2}-\d{2}$'),
  constraint terms_acceptances_method_check check (method in ('organisation_setup', 'signup_form', 'sign_in_prompt')),
  constraint terms_acceptances_accepted_check check (accepted_at <= recorded_at),
  constraint terms_acceptances_unique unique (organisation_id, profile_id, terms_version)
);
comment on table public.terms_acceptances is
  'GL-7: who accepted which Terms (and DPA) version for which organisation, when and how. Written only by public.accept_terms; rows are never edited; kept (anonymised through the tombstone profile) when an account closes; deleted only by the organisation purge.';
comment on column public.terms_acceptances.method is
  'organisation_setup: ticked when creating the organisation (/signup/setup). signup_form: accepted on the email sign-up form (auth user metadata terms_version), carried into an organisation the person joined. sign_in_prompt: accepted on the prompt shown at sign-in.';
comment on column public.terms_acceptances.accepted_at is
  'When the person accepted: now() for the setup and prompt methods; the sign-up form''s terms_accepted_at for signup_form.';
create index terms_acceptances_profile_idx on public.terms_acceptances (profile_id);

alter table public.terms_acceptances enable row level security;
revoke all on public.terms_acceptances from anon, authenticated;
grant select on public.terms_acceptances to authenticated;
create policy terms_acceptances_select on public.terms_acceptances for select to authenticated
  using ((profile_id = (select auth.uid()) and organisation_id = any ((select private.my_org_ids())::uuid[]))
         or organisation_id = any ((select private.my_org_ids('admin'))::uuid[]));

-- Rows are evidence: never edited, and deleted only by the organisation purge.
create function private.terms_acceptances_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.in_purge() then return case when tg_op = 'DELETE' then old else new end; end if;  -- GL-11
  raise exception 'Terms acceptance records can''t be changed or removed.' using errcode = '42501', hint = 'terms_acceptance_immutable';
end;
$$;
revoke execute on function private.terms_acceptances_immutable() from public, anon;
create trigger terms_acceptances_immutable before update or delete on public.terms_acceptances
  for each row execute function private.terms_acceptances_immutable();

-- The only writer. Returns when the person accepted (the existing record's time if they already
-- accepted this version for this organisation).
create function public.accept_terms(p_organisation_id uuid, p_terms_version text, p_method text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_meta jsonb;
  v_at timestamptz := now();
  v_existing timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501', hint = 'not_signed_in';
  end if;
  if p_terms_version is null or p_terms_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Unknown terms version.' using errcode = '22023', hint = 'bad_terms_version';
  end if;
  if p_method is null or p_method not in ('organisation_setup', 'signup_form', 'sign_in_prompt') then
    raise exception 'Unknown acceptance method.' using errcode = '22023', hint = 'bad_method';
  end if;
  if not private.is_org_member(p_organisation_id) then
    raise exception 'You''re not a member of this organisation.' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.closed_at is not null) then
    raise exception 'This account is closed.' using errcode = '42501', hint = 'account_closed';
  end if;
  if p_method = 'organisation_setup' and not private.has_org_role(p_organisation_id, 'admin') then
    raise exception 'Only the organisation''s admin accepts the terms at setup.' using errcode = '42501';
  end if;
  if p_method = 'signup_form' then
    -- The version and time the sign-up form recorded in the auth user's metadata.
    select u.raw_user_meta_data into v_meta from auth.users u where u.id = v_uid;
    if v_meta ->> 'terms_version' is distinct from p_terms_version then
      raise exception 'The sign-up form recorded a different terms version.' using errcode = '22023', hint = 'terms_version_mismatch';
    end if;
    begin
      v_at := least(coalesce((v_meta ->> 'terms_accepted_at')::timestamptz, now()), now());
    exception when others then
      v_at := now();
    end;
  end if;

  insert into public.terms_acceptances (organisation_id, profile_id, terms_version, accepted_at, method)
  values (p_organisation_id, v_uid, p_terms_version, v_at, p_method)
  on conflict (organisation_id, profile_id, terms_version) do nothing;
  if not found then
    select t.accepted_at into v_existing from public.terms_acceptances t
    where t.organisation_id = p_organisation_id and t.profile_id = v_uid and t.terms_version = p_terms_version;
    return v_existing;
  end if;
  return v_at;
end;
$$;
revoke execute on function public.accept_terms(uuid, text, text) from public, anon;
grant execute on function public.accept_terms(uuid, text, text) to authenticated;
