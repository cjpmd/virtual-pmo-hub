create or replace function public.convert_request_to_project(
  p_request_id uuid,
  p_overrides  jsonb default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r            public.project_requests%rowtype;
  p_id         uuid;
  draft        public.request_benefit_drafts%rowtype;
  ben_id       uuid;
  phase_id     uuid;
  v_prog_id    uuid;
begin
  select * into r
  from public.project_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request % not found', p_request_id using errcode = 'P0002';
  end if;

  if not private.has_workspace_role(r.workspace_id, 'manager') then
    raise exception 'Only workspace managers and above can convert a request to a project'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.projects p where p.converted_from_request_id = p_request_id
  ) then
    raise exception 'Request % has already been converted to a project', p_request_id
      using errcode = '23505';
  end if;

  if r.status = 'rejected' then
    raise exception 'A rejected request cannot be converted to a project'
      using errcode = '22023';
  end if;

  -- Resolve and validate programme_id.
  v_prog_id := nullif(trim(p_overrides->>'programme_id'), '')::uuid;
  if v_prog_id is not null then
    if not exists (
      select 1 from public.programmes
      where id = v_prog_id
        and portfolio_id = r.portfolio_id
        and workspace_id = r.workspace_id
        and archived_at is null
    ) then
      raise exception 'Programme does not belong to this portfolio'
        using errcode = '22023';
    end if;
  end if;

  if r.status <> 'approved' then
    update public.project_requests
    set status = 'approved'
    where id = p_request_id;
  end if;

  if (p_overrides->>'phase_id') is not null then
    phase_id := (p_overrides->>'phase_id')::uuid;
  else
    select id into phase_id
    from public.lifecycle_phases
    where organisation_id = r.organisation_id
    order by sort_order
    limit 1;
  end if;

  -- projects requires exactly one of (programme_id, portfolio_id).
  insert into public.projects (
    organisation_id,
    workspace_id,
    portfolio_id,
    programme_id,
    name,
    code,
    tier,
    priority,
    state,
    start_date,
    finish_date,
    baseline_finish_date,
    manager_id,
    sponsor_id,
    phase_id,
    converted_from_request_id
  ) values (
    r.organisation_id,
    r.workspace_id,
    case when v_prog_id is not null then null else r.portfolio_id end,
    v_prog_id,
    coalesce(nullif(trim(p_overrides->>'name'), ''), r.title),
    coalesce(nullif(trim(p_overrides->>'code'), ''), ''),
    coalesce(
      (case when (p_overrides->>'tier') in ('small','medium','large')
            then (p_overrides->>'tier')::public.project_tier end),
      'medium'
    ),
    r.priority,
    'active',
    (p_overrides->>'start_date')::date,
    (p_overrides->>'finish_date')::date,
    (p_overrides->>'finish_date')::date,
    nullif(trim(p_overrides->>'manager_id'), '')::uuid,
    r.sponsor_id,
    phase_id,
    p_request_id
  )
  returning id into p_id;

  -- Benefits keep portfolio_id from the request (NOT NULL on benefits).
  -- programme_id is set when a programme was chosen.
  for draft in
    select * from public.request_benefit_drafts
    where request_id = p_request_id
    order by sort_order
  loop
    insert into public.benefits (
      organisation_id,
      workspace_id,
      portfolio_id,
      programme_id,
      title,
      classification,
      planned_total_value,
      owner_id,
      category_id
    ) values (
      r.organisation_id,
      r.workspace_id,
      r.portfolio_id,
      v_prog_id,
      draft.title,
      draft.classification,
      draft.annual_value * draft.years_counted,
      draft.owner_id,
      draft.category_id
    )
    returning id into ben_id;

    insert into public.benefit_projects (
      organisation_id,
      workspace_id,
      benefit_id,
      project_id,
      attribution_percent
    ) values (
      r.organisation_id,
      r.workspace_id,
      ben_id,
      p_id,
      100
    );

    if draft.strategic_objective_id is not null then
      insert into public.benefit_objectives (
        organisation_id,
        workspace_id,
        benefit_id,
        strategic_objective_id
      ) values (
        r.organisation_id,
        r.workspace_id,
        ben_id,
        draft.strategic_objective_id
      );
    end if;

    if draft.measure is not null and trim(draft.measure) <> '' then
      insert into public.benefit_measures (
        organisation_id,
        workspace_id,
        benefit_id,
        name,
        baseline_value,
        sort_order
      ) values (
        r.organisation_id,
        r.workspace_id,
        ben_id,
        draft.measure,
        0,
        draft.sort_order
      );
    end if;
  end loop;

  update public.business_cases
  set project_id = p_id,
      request_id = null
  where request_id = p_request_id;

  perform private.write_audit(
    r.organisation_id,
    'request.converted',
    'project_requests',
    p_request_id,
    jsonb_build_object(
      'project_id',  p_id,
      'project_code', (select code from public.projects where id = p_id)
    )
  );

  return p_id;
end;
$$;
