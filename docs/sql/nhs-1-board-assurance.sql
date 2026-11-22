-- NHS-1 part 1: Board assurance (docs/nhs-module-plan.md § NHS-1, docs/sql/nhs-1-board-assurance.sql).
-- Written by an unattended run on 22/11/2026: tested on the local Postgres only, NOT applied to
-- production. Nothing here is destructive (no drop, delete or truncate); one function is replaced
-- (private.seed_module_defaults) with its previous body kept and one branch added.
--
-- Design
-- - The strategic risk register (the BAF) is organisation-scoped like governance_role_holders: it
--   describes the organisation itself and is read by every member, whichever workspaces they
--   belong to. strategic_risks, strategic_risk_actions and strategic_risk_scores have
--   organisation_id only (added to the AGENTS.md exception list, pending Chris's approval).
-- - Reads: every organisation member, whether the module is on or off (switching off hides the
--   screens and keeps the data). Writes: organisation PMO and admins, and only while the
--   'assurance' module is on (private.module_enabled in the policies). An action's owner can
--   update their own action.
-- - Scores use public.risk_matrices. Each strategic risk keeps the matrix it was created with
--   (risk_matrix_id, stamped on insert), so changing the organisation's choice later never
--   rescores an existing entry. The choice for new entries is settings.assurance.matrixKey (the
--   NHS pack sets 'nhs_5x5', the existing system NHS 5×5), else the organisation default matrix.
-- - Project and programme risks still score from the organisation settings (RB-13a guard): the
--   NHS 5×5 isn't made the register default here. See "Decisions for Chris" (NHS-1 / D1).
-- - Assurance ratings use public.rating_schemes (is_assurance). The existing system scheme
--   'nhs_assurance' (Substantial / Reasonable / Limited / No assurance) is reused, not duplicated.
-- - Current-score history (strategic_risk_scores) is written by a trigger on every change of the
--   current likelihood or consequence; v_strategic_risks reads it for the trend arrow.
-- - Programme and project risks link to a strategic risk through record_links
--   (from_type 'risk', to_type 'strategic_risk', link_type 'contributes_to_baf'); a trigger checks
--   both ends are in the same organisation and the module is on.

-- ---------------------------------------------------------------------------------------------
-- 1. Settings shape and defaults
-- ---------------------------------------------------------------------------------------------

alter table public.organisations
  add constraint organisations_settings_assurance_check
  check (settings -> 'assurance' is null or jsonb_typeof(settings -> 'assurance') = 'object')
  not valid;
alter table public.organisations validate constraint organisations_settings_assurance_check;

-- The matrix new strategic risks are scored on: settings.assurance.matrixKey (the organisation's
-- own row first, then the system row), else the organisation default.
create function private.assurance_matrix(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select to_jsonb(m) from public.organisations o
       join public.risk_matrices m on m.key = o.settings -> 'assurance' ->> 'matrixKey'
        and (m.organisation_id = o.id or m.organisation_id is null)
     where o.id = p_org
     order by m.organisation_id nulls last limit 1),
    private.org_risk_matrix(p_org));
$$;
revoke execute on function private.assurance_matrix(uuid) from public, anon;
grant execute on function private.assurance_matrix(uuid) to authenticated, service_role;

-- The assurance rating scheme: settings.assurance.ratingSchemeKey, else the organisation's own
-- assurance scheme, else the system 'nhs_assurance'.
create function private.assurance_rating_scheme(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select to_jsonb(s) from public.organisations o
       join public.rating_schemes s on s.key = o.settings -> 'assurance' ->> 'ratingSchemeKey'
        and (s.organisation_id = o.id or s.organisation_id is null)
     where o.id = p_org
     order by s.organisation_id nulls last limit 1),
    (select to_jsonb(s) from public.rating_schemes s
     where s.organisation_id = p_org and s.is_assurance order by s.created_at, s.key limit 1),
    (select to_jsonb(s) from public.rating_schemes s where s.organisation_id is null and s.key = 'nhs_assurance'));
$$;
revoke execute on function private.assurance_rating_scheme(uuid) from public, anon;
grant execute on function private.assurance_rating_scheme(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. Strategic risks (the Board Assurance Framework)
-- ---------------------------------------------------------------------------------------------

create table public.strategic_risks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  ref text not null,
  title text not null check (length(btrim(title)) between 1 and 300),
  description text check (description is null or length(description) <= 10000),
  strategic_objective_id uuid references public.strategic_objectives (id) on delete set null,
  executive_lead_id uuid,
  lead_forum_id uuid,
  risk_matrix_id uuid references public.risk_matrices (id) on delete restrict,
  -- A value from the organisation's 'risk_appetite' list, and the score it tolerates.
  risk_appetite text check (risk_appetite is null or risk_appetite ~ '^[a-z][a-z0-9_]{1,59}$'),
  appetite_score smallint check (appetite_score is null or appetite_score between 1 and 100),
  initial_likelihood smallint check (initial_likelihood between 1 and 10),
  initial_consequence smallint check (initial_consequence between 1 and 10),
  current_likelihood smallint not null check (current_likelihood between 1 and 10),
  current_consequence smallint not null check (current_consequence between 1 and 10),
  target_likelihood smallint check (target_likelihood between 1 and 10),
  target_consequence smallint check (target_consequence between 1 and 10),
  key_controls text check (key_controls is null or length(key_controls) <= 10000),
  assurance_first_line text check (assurance_first_line is null or length(assurance_first_line) <= 10000),
  assurance_second_line text check (assurance_second_line is null or length(assurance_second_line) <= 10000),
  assurance_third_line text check (assurance_third_line is null or length(assurance_third_line) <= 10000),
  gaps_in_control text check (gaps_in_control is null or length(gaps_in_control) <= 10000),
  gaps_in_assurance text check (gaps_in_assurance is null or length(gaps_in_assurance) <= 10000),
  rating_scheme_id uuid references public.rating_schemes (id) on delete restrict,
  assurance_rating text check (assurance_rating is null or assurance_rating ~ '^[a-z0-9_]{1,40}$'),
  review_date date,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  unique (organisation_id, ref),
  check ((initial_likelihood is null) = (initial_consequence is null)),
  check ((target_likelihood is null) = (target_consequence is null)),
  foreign key (executive_lead_id, organisation_id) references public.resources (id, organisation_id)
    on delete set null (executive_lead_id),
  foreign key (lead_forum_id, organisation_id) references public.forums (id, organisation_id)
    on delete set null (lead_forum_id)
);
create index strategic_risks_org_idx on public.strategic_risks (organisation_id, status);
create index strategic_risks_objective_idx on public.strategic_risks (strategic_objective_id);
create index strategic_risks_lead_idx on public.strategic_risks (executive_lead_id, organisation_id);
create index strategic_risks_forum_idx on public.strategic_risks (lead_forum_id, organisation_id);
create index strategic_risks_matrix_idx on public.strategic_risks (risk_matrix_id);
create index strategic_risks_scheme_idx on public.strategic_risks (rating_scheme_id);
create index strategic_risks_created_by_idx on public.strategic_risks (created_by);

comment on table public.strategic_risks is
  'NHS-1: the organisation''s strategic risk register (Board Assurance Framework). Organisation-scoped.';

-- Stamps the matrix and scheme, checks scores fit the matrix, the objective, matrix and scheme
-- belong to the organisation (or the system), and the rating is one of the scheme's levels.
create function private.strategic_risks_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matrix jsonb;
  v_scheme jsonb;
  v_l integer;
  v_c integer;
begin
  if tg_op = 'UPDATE' and new.organisation_id is distinct from old.organisation_id then
    raise exception 'organisation_id is immutable' using errcode = '42501';
  end if;

  if new.risk_matrix_id is null then
    new.risk_matrix_id := (private.assurance_matrix(new.organisation_id) ->> 'id')::uuid;
  end if;
  select to_jsonb(m) into v_matrix from public.risk_matrices m
   where m.id = new.risk_matrix_id and (m.organisation_id is null or m.organisation_id = new.organisation_id);
  if v_matrix is null then
    raise exception 'risk_matrices % not found or not visible', new.risk_matrix_id using errcode = '23503';
  end if;
  v_l := jsonb_array_length(v_matrix -> 'likelihood_levels');
  v_c := jsonb_array_length(v_matrix -> 'consequence_levels');
  if new.current_likelihood > v_l or new.initial_likelihood > v_l or new.target_likelihood > v_l
     or new.current_consequence > v_c or new.initial_consequence > v_c or new.target_consequence > v_c then
    raise exception 'Likelihood and consequence must be on the % matrix (1–% by 1–%).', v_matrix ->> 'name', v_l, v_c
      using errcode = '23514';
  end if;

  if new.rating_scheme_id is null then
    new.rating_scheme_id := (private.assurance_rating_scheme(new.organisation_id) ->> 'id')::uuid;
  end if;
  select to_jsonb(s) into v_scheme from public.rating_schemes s
   where s.id = new.rating_scheme_id and (s.organisation_id is null or s.organisation_id = new.organisation_id);
  if v_scheme is null then
    raise exception 'rating_schemes % not found or not visible', new.rating_scheme_id using errcode = '23503';
  end if;
  if new.assurance_rating is not null
     and not exists (select 1 from jsonb_array_elements(v_scheme -> 'levels') l where l ->> 'key' = new.assurance_rating) then
    raise exception 'Choose one of the % levels.', v_scheme ->> 'name' using errcode = '23514';
  end if;

  if new.strategic_objective_id is not null
     and not exists (select 1 from public.strategic_objectives o
                     where o.id = new.strategic_objective_id and o.organisation_id = new.organisation_id) then
    raise exception 'strategic_objectives % not found or not visible', new.strategic_objective_id using errcode = '23503';
  end if;

  if new.status = 'closed' and (tg_op = 'INSERT' or old.status <> 'closed') then
    new.closed_at := coalesce(new.closed_at, now());
  elsif new.status = 'open' then
    new.closed_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.strategic_risks_check() from public, anon, authenticated;

create trigger strategic_risks_00_check before insert or update on public.strategic_risks
  for each row execute function private.strategic_risks_check();
create trigger strategic_risks_ref before insert on public.strategic_risks
  for each row execute function private.assign_ref('BAF', 'organisation');
create trigger strategic_risks_updated_at before update on public.strategic_risks
  for each row execute function private.set_updated_at();
create trigger strategic_risks_audit after insert or update or delete on public.strategic_risks
  for each row execute function private.audit_row_change();
create trigger zz_org_read_only before insert or update or delete on public.strategic_risks
  for each row execute function private.enforce_org_writable();

alter table public.strategic_risks enable row level security;
revoke all on public.strategic_risks from anon, authenticated;
-- No delete: an entry is closed, never removed (the organisation purge removes it).
grant select, insert, update on public.strategic_risks to authenticated;
create policy strategic_risks_select on public.strategic_risks for select to authenticated
  using (organisation_id = any ((select private.my_org_ids())::uuid[]));
create policy strategic_risks_insert on public.strategic_risks for insert to authenticated
  with check (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
              and private.module_enabled(organisation_id, 'assurance'));
create policy strategic_risks_update on public.strategic_risks for update to authenticated
  using (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[]))
  with check (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
              and private.module_enabled(organisation_id, 'assurance'));

-- ---------------------------------------------------------------------------------------------
-- 3. Score history (written only by the trigger; read by every member)
-- ---------------------------------------------------------------------------------------------

create table public.strategic_risk_scores (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  strategic_risk_id uuid not null,
  likelihood smallint not null,
  consequence smallint not null,
  score integer,
  risk_matrix_id uuid references public.risk_matrices (id) on delete set null,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (strategic_risk_id, organisation_id) references public.strategic_risks (id, organisation_id)
    on delete cascade
);
create index strategic_risk_scores_risk_idx on public.strategic_risk_scores (strategic_risk_id, recorded_at desc);
create index strategic_risk_scores_org_idx on public.strategic_risk_scores (organisation_id);
create index strategic_risk_scores_matrix_idx on public.strategic_risk_scores (risk_matrix_id);
create index strategic_risk_scores_recorded_by_idx on public.strategic_risk_scores (recorded_by);
create trigger zz_org_read_only before insert or update or delete on public.strategic_risk_scores
  for each row execute function private.enforce_org_writable();

alter table public.strategic_risk_scores enable row level security;
revoke all on public.strategic_risk_scores from anon, authenticated;
grant select on public.strategic_risk_scores to authenticated;
create policy strategic_risk_scores_select on public.strategic_risk_scores for select to authenticated
  using (organisation_id = any ((select private.my_org_ids())::uuid[]));

create function private.record_strategic_risk_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.current_likelihood, new.current_consequence, new.risk_matrix_id)
         is not distinct from (old.current_likelihood, old.current_consequence, old.risk_matrix_id) then
    return null;
  end if;
  insert into public.strategic_risk_scores (organisation_id, strategic_risk_id, likelihood, consequence, score, risk_matrix_id)
  values (new.organisation_id, new.id, new.current_likelihood, new.current_consequence,
          private.matrix_score((select to_jsonb(m) from public.risk_matrices m where m.id = new.risk_matrix_id),
                               new.current_likelihood, new.current_consequence),
          new.risk_matrix_id);
  return null;
end;
$$;
revoke execute on function private.record_strategic_risk_score() from public, anon, authenticated;

create trigger strategic_risks_20_score_history after insert or update on public.strategic_risks
  for each row execute function private.record_strategic_risk_score();

-- ---------------------------------------------------------------------------------------------
-- 4. Actions to close gaps
-- ---------------------------------------------------------------------------------------------

create table public.strategic_risk_actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  strategic_risk_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 500),
  owner_id uuid,
  due_date date,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'complete', 'cancelled')),
  completed_at timestamptz,
  notes text check (notes is null or length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  foreign key (strategic_risk_id, organisation_id) references public.strategic_risks (id, organisation_id)
    on delete cascade,
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id)
    on delete set null (owner_id)
);
create index strategic_risk_actions_risk_idx on public.strategic_risk_actions (strategic_risk_id, organisation_id);
create index strategic_risk_actions_org_idx on public.strategic_risk_actions (organisation_id);
create index strategic_risk_actions_owner_idx on public.strategic_risk_actions (owner_id, organisation_id);
create index strategic_risk_actions_created_by_idx on public.strategic_risk_actions (created_by);

create function private.strategic_risk_actions_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.organisation_id, new.strategic_risk_id) is distinct from (old.organisation_id, old.strategic_risk_id) then
    raise exception 'An action stays with its strategic risk.' using errcode = '42501';
  end if;
  if new.status = 'complete' and (tg_op = 'INSERT' or old.status <> 'complete') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'complete' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
revoke execute on function private.strategic_risk_actions_check() from public, anon, authenticated;

create trigger strategic_risk_actions_00_check before insert or update on public.strategic_risk_actions
  for each row execute function private.strategic_risk_actions_check();
create trigger strategic_risk_actions_updated_at before update on public.strategic_risk_actions
  for each row execute function private.set_updated_at();
create trigger strategic_risk_actions_audit after insert or update or delete on public.strategic_risk_actions
  for each row execute function private.audit_row_change();
create trigger zz_org_read_only before insert or update or delete on public.strategic_risk_actions
  for each row execute function private.enforce_org_writable();

alter table public.strategic_risk_actions enable row level security;
revoke all on public.strategic_risk_actions from anon, authenticated;
grant select, insert, update, delete on public.strategic_risk_actions to authenticated;
create policy strategic_risk_actions_select on public.strategic_risk_actions for select to authenticated
  using (organisation_id = any ((select private.my_org_ids())::uuid[]));
create policy strategic_risk_actions_insert on public.strategic_risk_actions for insert to authenticated
  with check (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
              and private.module_enabled(organisation_id, 'assurance'));
-- PMO / admin, or the action's owner (contributor or above: a free viewer stays read-only).
create policy strategic_risk_actions_update on public.strategic_risk_actions for update to authenticated
  using (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
         or (owner_id = any ((select private.my_resource_ids())::uuid[])
             and organisation_id = any ((select private.my_org_ids('contributor'))::uuid[])))
  with check ((organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
               or (owner_id = any ((select private.my_resource_ids())::uuid[])
                   and organisation_id = any ((select private.my_org_ids('contributor'))::uuid[])))
              and private.module_enabled(organisation_id, 'assurance'));
create policy strategic_risk_actions_delete on public.strategic_risk_actions for delete to authenticated
  using (organisation_id = any ((select private.my_org_ids('pmo'))::uuid[])
         and private.module_enabled(organisation_id, 'assurance'));

-- ---------------------------------------------------------------------------------------------
-- 5. Register view: scores and bands on each entry's own matrix, appetite, trend, rating, links
-- ---------------------------------------------------------------------------------------------

create view public.v_strategic_risks with (security_invoker = true) as
  select s.id, s.organisation_id, s.ref, s.title, s.description, s.strategic_objective_id, s.executive_lead_id,
    s.lead_forum_id, s.risk_matrix_id, m.mx ->> 'key' as risk_matrix_key, m.mx ->> 'name' as risk_matrix_name,
    s.risk_appetite, s.appetite_score,
    s.initial_likelihood, s.initial_consequence, private.matrix_score(m.mx, s.initial_likelihood, s.initial_consequence) as initial_score,
    s.current_likelihood, s.current_consequence, cur.score as current_score,
    private.matrix_band(m.mx, cur.score) as current_band,
    s.target_likelihood, s.target_consequence, private.matrix_score(m.mx, s.target_likelihood, s.target_consequence) as target_score,
    (s.appetite_score is not null and cur.score > s.appetite_score) as above_appetite,
    prev.score as previous_score,
    case when prev.score is null then 'new'
         when cur.score > prev.score then 'up'
         when cur.score < prev.score then 'down'
         else 'same' end as trend,
    s.key_controls, s.assurance_first_line, s.assurance_second_line, s.assurance_third_line,
    s.gaps_in_control, s.gaps_in_assurance,
    s.rating_scheme_id, s.assurance_rating, lvl.value ->> 'label' as assurance_label, lvl.value ->> 'colour' as assurance_colour,
    (lvl.value ->> 'rank')::integer as assurance_rank,
    s.review_date, (s.status = 'open' and s.review_date < current_date) as review_overdue,
    s.status, s.closed_at, s.is_sample, s.created_at, s.updated_at,
    (select count(*) from public.record_links l
      where l.to_type = 'strategic_risk' and l.to_id = s.id and l.link_type = 'contributes_to_baf')::integer as linked_risk_count,
    (select count(*) from public.strategic_risk_actions a
      where a.strategic_risk_id = s.id and a.status in ('not_started', 'in_progress'))::integer as open_action_count,
    (select count(*) from public.strategic_risk_actions a
      where a.strategic_risk_id = s.id and a.status in ('not_started', 'in_progress') and a.due_date < current_date)::integer as overdue_action_count
  from public.strategic_risks s
  cross join lateral (select to_jsonb(x) as mx from public.risk_matrices x where x.id = s.risk_matrix_id) m
  cross join lateral (select private.matrix_score(m.mx, s.current_likelihood, s.current_consequence) as score) cur
  left join lateral (select h.score from public.strategic_risk_scores h where h.strategic_risk_id = s.id
                     order by h.recorded_at desc, h.id offset 1 limit 1) prev on true
  left join public.rating_schemes rs on rs.id = s.rating_scheme_id
  left join lateral (select l.value from jsonb_array_elements(rs.levels) l where l.value ->> 'key' = s.assurance_rating) lvl on true;
grant select on public.v_strategic_risks to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Linking programme and project risks to a strategic risk (record_links)
-- ---------------------------------------------------------------------------------------------

create function private.record_links_baf_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.to_type = 'strategic_risk' or new.link_type = 'contributes_to_baf' then
    if new.link_type <> 'contributes_to_baf' or new.to_type <> 'strategic_risk' or new.from_type <> 'risk' then
      raise exception 'Only a risk can contribute to a strategic risk.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.strategic_risks s where s.id = new.to_id and s.organisation_id = new.organisation_id) then
      raise exception 'strategic_risks % not found or not visible', new.to_id using errcode = '23503';
    end if;
    if not exists (select 1 from public.risks r where r.id = new.from_id and r.workspace_id = new.workspace_id) then
      raise exception 'risks % not found or not visible', new.from_id using errcode = '23503';
    end if;
    perform private.assert_module_enabled(new.organisation_id, 'assurance');
  end if;
  return new;
end;
$$;
revoke execute on function private.record_links_baf_check() from public, anon, authenticated;

create trigger record_links_10_baf_check before insert or update on public.record_links
  for each row execute function private.record_links_baf_check();

-- ---------------------------------------------------------------------------------------------
-- 7. Module defaults: the 'assurance' branch. Previous body (NHS-0) unchanged; one branch added.
--    Seeds the 'risk_appetite' list and, for the NHS pack, sets settings.assurance.matrixKey to the
--    system NHS 5×5 when the organisation hasn't chosen one. Never changes existing risks.
-- ---------------------------------------------------------------------------------------------

create function private.risk_appetite_levels()
returns table (value text, label text, sort_order integer)
language sql
immutable
set search_path = ''
as $$
  select v.value, v.label, v.sort_order
  from (values
    ('avoid', 'Avoid', 1),
    ('minimal', 'Minimal', 2),
    ('cautious', 'Cautious', 3),
    ('open', 'Open', 4),
    ('seek', 'Seek', 5),
    ('significant', 'Significant', 6)
  ) as v(value, label, sort_order);
$$;
revoke execute on function private.risk_appetite_levels() from public, anon;

create or replace function private.seed_module_defaults(p_org uuid, p_module text, p_pack text default 'general',
                                                        p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_more jsonb;
begin
  if p_module <> 'core' and not (p_module = any (private.module_keys())) then
    raise exception 'Unknown module %', p_module using errcode = '22023';
  end if;

  if p_module = 'core' then
    select coalesce(jsonb_agg(jsonb_build_object('list', 'governance_role', 'value', r.value, 'label', r.label)
                              order by r.sort_order), '[]'::jsonb)
      into v_items
    from private.pack_governance_roles(p_pack) r
    where not exists (select 1 from public.lookup_values l
                      where l.organisation_id = p_org and l.list_key = 'governance_role' and l.value = r.value);
    if p_apply then
      insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
      select p_org, 'governance_role', r.value, r.label,
             r.sort_order + coalesce((select max(l.sort_order) from public.lookup_values l
                                      where l.organisation_id = p_org and l.list_key = 'governance_role'), 0)
      from private.pack_governance_roles(p_pack) r
      on conflict (organisation_id, list_key, value) do nothing;
    end if;
  end if;

  -- NHS-1: board assurance.
  if p_module = 'assurance' then
    select coalesce(jsonb_agg(jsonb_build_object('list', 'risk_appetite', 'value', r.value, 'label', r.label)
                              order by r.sort_order), '[]'::jsonb)
      into v_more
    from private.risk_appetite_levels() r
    where not exists (select 1 from public.lookup_values l
                      where l.organisation_id = p_org and l.list_key = 'risk_appetite' and l.value = r.value);
    v_items := v_items || v_more;
    if p_apply then
      insert into public.lookup_values (organisation_id, list_key, value, label, sort_order)
      select p_org, 'risk_appetite', r.value, r.label,
             r.sort_order + coalesce((select max(l.sort_order) from public.lookup_values l
                                      where l.organisation_id = p_org and l.list_key = 'risk_appetite'), 0)
      from private.risk_appetite_levels() r
      on conflict (organisation_id, list_key, value) do nothing;
    end if;

    if p_pack = 'nhs' and not exists (select 1 from public.organisations o
                                      where o.id = p_org and coalesce(o.settings -> 'assurance' ->> 'matrixKey', '') <> '') then
      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'setting', 'assurance.matrixKey', 'value', 'nhs_5x5', 'label', 'NHS 5×5 matrix for new strategic risks'));
      if p_apply then
        update public.organisations o
           set settings = jsonb_set(o.settings, '{assurance}',
                                    coalesce(o.settings -> 'assurance', '{}'::jsonb) || '{"matrixKey":"nhs_5x5"}'::jsonb)
         where o.id = p_org;
      end if;
    end if;
  end if;

  return v_items;
end;
$$;
revoke execute on function private.seed_module_defaults(uuid, text, text, boolean) from public, anon, authenticated;
