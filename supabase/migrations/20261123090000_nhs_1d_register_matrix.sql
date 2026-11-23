-- NHS-1 part 4: the risk register scores from risk_matrices, and the risk re-scoring tool
-- (docs/nhs-module-plan.md § NHS-0 "Enabling on an existing organisation" rule 2 and § NHS-1
-- item 0; report-builder debt RB-42; docs/sql/nhs-1d-register-matrix.sql).
-- Written by an unattended run on 23/11/2026: tested on the local Postgres only, NOT applied to
-- production. Apply after 20261122210000_nhs_1c_programme_assurance. Nothing here is destructive:
-- one function replaced (private.risk_matrix_default_guard, the RB-13a guard, relaxed), new
-- private helpers, three triggers and three public RPCs.
--
-- Design
-- - The register keeps its 5×5 shape: risks.probability and risks.impact are 1–5 and risks.score
--   is the generated product. So an organisation's own matrix may now be its default (the
--   "register matrix") when it has five likelihood and five consequence levels and scores by
--   product. Any other matrix can still be chosen on a forum or template, as before.
-- - One source of truth: when an organisation has its own default matrix, settings.risk (matrix
--   size, axis labels and bands, which the heat maps and the health red threshold read) is copied
--   from the matrix and kept in step: an AFTER trigger on risk_matrices copies it when the default
--   changes, and a BEFORE trigger on organisations re-applies it whenever settings.risk is written
--   (Settings › Risk, Reset all settings). The appetite threshold stays the organisation's own.
--   Organisations without their own default (every organisation today) behave exactly as before.
-- - public.set_register_risk_matrix(org, key) (admins) changes the register matrix. A system
--   matrix (e.g. the NHS 5×5) is copied into the organisation first, because a system row can't be
--   one organisation's default; choosing the system 'default' matrix removes the organisation's
--   own default. Existing risks that followed the old default (risk_matrix_id null) are stamped
--   with the old matrix first, so their scores, bands and report history don't change (NHS-0
--   rule 2): new risks follow the new matrix.
-- - The re-scoring tool: public.risk_rescore_candidates(org) lists open risks still on another
--   matrix with a proposed likelihood and consequence on the register matrix (scaled by level;
--   identical between 5×5 matrices, so only the band can change); public.rescore_risks(org, items)
--   accepts them (workspace PMO and admins, per risk or in bulk), checking each risk's updated_at
--   so a stale proposal is refused. Accepted risks follow the register matrix again. Every risk
--   update is already audited row by row (risks_audit); each acceptance also writes an
--   'risk.rescored' audit entry naming the two matrices. Never runs automatically.

-- ---------------------------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------------------------

-- A matrix the register can score on: five likelihood and five consequence levels, product.
create function private.matrix_register_compatible(p_matrix jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_array_length(p_matrix -> 'likelihood_levels') = 5
     and jsonb_array_length(p_matrix -> 'consequence_levels') = 5
     and coalesce(p_matrix ->> 'score_method', 'product') = 'product', false);
$$;
revoke execute on function private.matrix_register_compatible(jsonb) from public, anon;
-- The guard trigger runs as the caller, so authenticated needs it.
grant execute on function private.matrix_register_compatible(jsonb) to authenticated, service_role;

-- settings.risk fields (Settings › Risk shape) taken from a matrix.
create function private.register_risk_settings(p_matrix jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'matrixSize', jsonb_array_length(p_matrix -> 'likelihood_levels'),
    'probabilityLabels', (select coalesce(jsonb_agg(l ->> 'label' order by (l ->> 'value')::integer), '[]'::jsonb)
                          from jsonb_array_elements(p_matrix -> 'likelihood_levels') l),
    'impactLabels', (select coalesce(jsonb_agg(l ->> 'label' order by (l ->> 'value')::integer), '[]'::jsonb)
                     from jsonb_array_elements(p_matrix -> 'consequence_levels') l),
    'bands', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', 'band-' || coalesce(b ->> 'key', ord::text),
                'label', b ->> 'label',
                'minScore', (b ->> 'min')::integer,
                'colour', coalesce(b ->> 'colour', '#64748b')) order by (b ->> 'min')::integer), '[]'::jsonb)
              from jsonb_array_elements(p_matrix -> 'bands') with ordinality as x(b, ord)),
    'matrixKey', p_matrix ->> 'key');
$$;
revoke execute on function private.register_risk_settings(jsonb) from public, anon;

-- The organisation's own default matrix, or null.
create function private.org_own_default_matrix(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(m) from public.risk_matrices m where m.organisation_id = p_org and m.is_default limit 1;
$$;
revoke execute on function private.org_own_default_matrix(uuid) from public, anon, authenticated;

-- Copies the register matrix (the organisation's own default, else the system default) into
-- settings.risk. Called when the organisation's default changes.
create function private.sync_register_risk_settings(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matrix jsonb := private.org_risk_matrix(p_org);
begin
  if private.in_purge() or v_matrix is null then
    return;
  end if;
  update public.organisations o
     set settings = jsonb_set(o.settings, '{risk}',
                              coalesce(o.settings -> 'risk', '{}'::jsonb) || private.register_risk_settings(v_matrix))
   where o.id = p_org
     and (o.settings -> 'risk') is distinct from
         (coalesce(o.settings -> 'risk', '{}'::jsonb) || private.register_risk_settings(v_matrix));
end;
$$;
revoke execute on function private.sync_register_risk_settings(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. The RB-13a guard, relaxed: an organisation default must suit the register.
-- ---------------------------------------------------------------------------------------------

create or replace function private.risk_matrix_default_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organisation_id is not null and new.is_default
     and not private.matrix_register_compatible(to_jsonb(new)) then
    raise exception 'The risk register scores likelihood × consequence on a 5 × 5 grid, so only a 5 × 5 matrix scored by product can be the organisation''s default. Choose this matrix on a forum or template instead.'
      using errcode = '23514', hint = 'org_matrix_default';
  end if;
  return new;
end;
$$;

-- After an organisation's default changes (set, unset, edited or deleted), settings.risk follows.
create function private.risk_matrices_sync_register()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.organisation_id, old.organisation_id);
begin
  if v_org is null then
    return null;
  end if;
  if tg_op = 'INSERT' and not new.is_default then
    return null;
  end if;
  if tg_op = 'DELETE' and not old.is_default then
    return null;
  end if;
  if tg_op = 'UPDATE' and not (old.is_default or new.is_default) then
    return null;
  end if;
  perform private.sync_register_risk_settings(v_org);
  return null;
end;
$$;
revoke execute on function private.risk_matrices_sync_register() from public, anon, authenticated;
create trigger risk_matrices_20_sync_register after insert or update or delete on public.risk_matrices
  for each row execute function private.risk_matrices_sync_register();

-- Whenever settings.risk is written while the organisation has its own default matrix, the
-- matrix's size, labels and bands win (the appetite threshold and anything else are kept).
create function private.organisations_register_risk()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matrix jsonb;
begin
  if private.in_purge() then
    return new;
  end if;
  v_matrix := private.org_own_default_matrix(new.id);
  if v_matrix is not null then
    new.settings := jsonb_set(new.settings, '{risk}',
                              coalesce(new.settings -> 'risk', '{}'::jsonb) || private.register_risk_settings(v_matrix));
  end if;
  return new;
end;
$$;
revoke execute on function private.organisations_register_risk() from public, anon, authenticated;
create trigger organisations_10_register_risk before update of settings on public.organisations
  for each row when (old.settings -> 'risk' is distinct from new.settings -> 'risk')
  execute function private.organisations_register_risk();

-- ---------------------------------------------------------------------------------------------
-- 3. Changing the register matrix
-- ---------------------------------------------------------------------------------------------

create function public.set_register_risk_matrix(p_org uuid, p_matrix_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_target public.risk_matrices;
  v_stamped integer := 0;
  v_new_id uuid;
begin
  if p_org is null or not (p_org = any (private.my_org_ids('admin'))) then
    raise exception 'Only organisation admins can change the risk register''s matrix.' using errcode = '42501';
  end if;
  select * into v_target from public.risk_matrices m
   where m.key = p_matrix_key and (m.organisation_id = p_org or m.organisation_id is null)
   order by m.organisation_id nulls last limit 1;
  if v_target.id is null then
    raise exception 'Risk matrix % not found', p_matrix_key using errcode = '23503';
  end if;
  if not private.matrix_register_compatible(to_jsonb(v_target)) then
    raise exception 'The risk register scores likelihood × consequence on a 5 × 5 grid, so only a 5 × 5 matrix scored by product can be its matrix.'
      using errcode = '23514', hint = 'org_matrix_default';
  end if;

  v_old := private.org_risk_matrix(p_org);
  if (v_old ->> 'key') = p_matrix_key then
    return jsonb_build_object('matrix_key', p_matrix_key, 'changed', false, 'stamped', 0);
  end if;

  -- Existing risks keep the matrix they were scored on.
  update public.risks r set risk_matrix_id = (v_old ->> 'id')::uuid
   where r.organisation_id = p_org and r.risk_matrix_id is null;
  get diagnostics v_stamped = row_count;

  -- The organisation's own defaults stop being default (the sync trigger runs on each change).
  update public.risk_matrices m set is_default = false where m.organisation_id = p_org and m.is_default;

  if v_target.organisation_id is null and v_target.is_default then
    v_new_id := v_target.id; -- the system default: no organisation default needed
  else
    if v_target.organisation_id is null then
      insert into public.risk_matrices (organisation_id, key, name, likelihood_levels, consequence_levels,
                                        score_method, score_lookup, bands, is_default)
      values (p_org, v_target.key, v_target.name, v_target.likelihood_levels, v_target.consequence_levels,
              v_target.score_method, v_target.score_lookup, v_target.bands, true)
      on conflict (organisation_id, key) do update set is_default = true
      returning id into v_new_id;
    else
      update public.risk_matrices m set is_default = true where m.id = v_target.id;
      v_new_id := v_target.id;
    end if;
  end if;
  perform private.sync_register_risk_settings(p_org);

  perform private.write_audit(p_org, 'update', 'organisations', p_org, jsonb_build_object(
    'event', 'risk.register_matrix_changed', 'from_key', v_old ->> 'key', 'from_id', v_old ->> 'id',
    'to_key', p_matrix_key, 'to_id', v_new_id, 'stamped_risks', v_stamped));
  return jsonb_build_object('matrix_key', p_matrix_key, 'matrix_id', v_new_id, 'changed', true, 'stamped', v_stamped);
end;
$$;
revoke execute on function public.set_register_risk_matrix(uuid, text) from public, anon;
grant execute on function public.set_register_risk_matrix(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. The re-scoring tool
-- ---------------------------------------------------------------------------------------------

-- A level on one scale mapped to another, keeping its relative position (1 → 1, top → top).
create function private.map_matrix_level(p_value integer, p_from integer, p_to integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_value is null or p_from is null or p_to is null or p_from < 1 or p_to < 1 then null
              when p_from = 1 or p_to = 1 then least(p_value, p_to)
              else greatest(1, least(p_to, round(1 + (p_value - 1)::numeric * (p_to - 1) / (p_from - 1))::integer)) end;
$$;
revoke execute on function private.map_matrix_level(integer, integer, integer) from public, anon;
grant execute on function private.map_matrix_level(integer, integer, integer) to authenticated, service_role;

-- Open risks the caller can see that are still scored on another matrix than the register's,
-- with the proposed likelihood, consequence, score and band on the register matrix. Security
-- invoker: RLS decides which risks are listed.
create function public.risk_rescore_candidates(p_org uuid)
returns table (
  risk_id uuid,
  ref text,
  title text,
  workspace_id uuid,
  project_id uuid,
  programme_id uuid,
  portfolio_id uuid,
  updated_at timestamptz,
  from_matrix_key text,
  from_matrix_name text,
  probability integer,
  impact integer,
  score integer,
  band_label text,
  band_colour text,
  to_matrix_key text,
  to_matrix_name text,
  proposed_probability integer,
  proposed_impact integer,
  proposed_score integer,
  proposed_band_label text,
  proposed_band_colour text,
  band_changes boolean
)
language sql
stable
set search_path = ''
as $$
  with reg as (select private.org_risk_matrix(p_org) as m),
  cand as (
    select r.*, to_jsonb(x) as fm, reg.m as tm
    from public.risks r
    join public.risk_matrices x on x.id = r.risk_matrix_id
    cross join reg
    where r.organisation_id = p_org and r.status = 'open'
      and reg.m is not null and x.id <> (reg.m ->> 'id')::uuid
  ),
  prop as (
    select c.*,
      private.map_matrix_level(c.probability, jsonb_array_length(c.fm -> 'likelihood_levels'),
                               jsonb_array_length(c.tm -> 'likelihood_levels')) as pp,
      private.map_matrix_level(c.impact, jsonb_array_length(c.fm -> 'consequence_levels'),
                               jsonb_array_length(c.tm -> 'consequence_levels')) as pi
    from cand c
  ),
  scored as (
    select p.*,
      private.matrix_score(p.fm, p.probability, p.impact) as s_old,
      private.matrix_score(p.tm, p.pp, p.pi) as s_new
    from prop p
  )
  select s.id, s.ref, s.title, s.workspace_id, s.project_id, s.programme_id, s.portfolio_id, s.updated_at,
    s.fm ->> 'key', s.fm ->> 'name', s.probability::integer, s.impact::integer, s.s_old,
    private.matrix_band(s.fm, s.s_old) ->> 'label', private.matrix_band(s.fm, s.s_old) ->> 'colour',
    s.tm ->> 'key', s.tm ->> 'name', s.pp, s.pi, s.s_new,
    private.matrix_band(s.tm, s.s_new) ->> 'label', private.matrix_band(s.tm, s.s_new) ->> 'colour',
    (private.matrix_band(s.fm, s.s_old) ->> 'label') is distinct from (private.matrix_band(s.tm, s.s_new) ->> 'label')
  from scored s
  order by s.s_new desc nulls last, s.ref;
$$;
revoke execute on function public.risk_rescore_candidates(uuid) from public, anon;
grant execute on function public.risk_rescore_candidates(uuid) to authenticated;

-- Accepts re-scores: p_items is [{id, probability, impact, updated_at}] (at most 500). Each risk
-- must belong to the organisation, be open, sit in a workspace where the caller is PMO or admin,
-- and be unchanged since it was proposed. All or nothing.
create function public.rescore_risks(p_org uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_risk public.risks;
  v_reg jsonb := private.org_risk_matrix(p_org);
  v_from jsonb;
  v_ws uuid[] := private.my_workspace_ids('pmo');
  v_p integer;
  v_i integer;
  v_n integer := 0;
begin
  if p_org is null or not (p_org = any (private.my_org_ids())) then
    raise exception 'Not a member of this organisation' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one risk to re-score.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'Re-score at most 500 risks at a time.' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_risk from public.risks r
     where r.id = (v_item ->> 'id')::uuid and r.organisation_id = p_org
     for update;
    if v_risk.id is null or not (v_risk.workspace_id = any (v_ws)) then
      raise exception 'Only PMO members and admins of the risk''s workspace can re-score it.' using errcode = '42501';
    end if;
    if v_risk.status <> 'open' then
      raise exception 'Risk % is closed, so it keeps its score.', v_risk.ref using errcode = '22023';
    end if;
    if v_item ? 'updated_at' and v_risk.updated_at <> (v_item ->> 'updated_at')::timestamptz then
      raise exception 'Risk % changed since the proposal was made. Refresh the list and try again.', v_risk.ref
        using errcode = '40001';
    end if;
    v_p := (v_item ->> 'probability')::integer;
    v_i := (v_item ->> 'impact')::integer;
    if v_p is null or v_i is null or v_p not between 1 and 5 or v_i not between 1 and 5 then
      raise exception 'Likelihood and consequence must each be 1 to 5.' using errcode = '23514';
    end if;
    v_from := (select to_jsonb(m) from public.risk_matrices m where m.id = v_risk.risk_matrix_id);
    update public.risks r set probability = v_p, impact = v_i, risk_matrix_id = null where r.id = v_risk.id;
    perform private.write_audit(p_org, 'update', 'risks', v_risk.id, jsonb_build_object(
      'event', 'risk.rescored', 'from_matrix', coalesce(v_from ->> 'key', v_reg ->> 'key'), 'to_matrix', v_reg ->> 'key',
      'from', jsonb_build_object('probability', v_risk.probability, 'impact', v_risk.impact, 'score', v_risk.score),
      'to', jsonb_build_object('probability', v_p, 'impact', v_i, 'score', v_p * v_i)));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.rescore_risks(uuid, jsonb) from public, anon;
grant execute on function public.rescore_risks(uuid, jsonb) to authenticated;
