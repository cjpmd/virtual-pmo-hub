-- Report builder, Phase 2: programme / portfolio packs and exception selection
-- (docs/report-builder-spec.md §5.4, §6.3–6.4, §7, §8, §14, §15). Additive only.

-- ====================================================================== 1. Escalations
alter table public.risks
  add column escalated_to_forum_id uuid,
  add column escalated_at timestamptz,
  add constraint risks_escalated_forum_fkey foreign key (escalated_to_forum_id, organisation_id)
    references public.forums (id, organisation_id) on delete set null (escalated_to_forum_id);
alter table public.issues
  add column escalated_to_forum_id uuid,
  add column escalated_at timestamptz,
  add constraint issues_escalated_forum_fkey foreign key (escalated_to_forum_id, organisation_id)
    references public.forums (id, organisation_id) on delete set null (escalated_to_forum_id);
create index risks_escalated_forum_idx on public.risks (escalated_to_forum_id, organisation_id);
create index issues_escalated_forum_idx on public.issues (escalated_to_forum_id, organisation_id);

-- escalated_at follows the forum: set when it is first escalated (or moved), cleared with it.
create function private.escalation_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.escalated_to_forum_id is null then
    new.escalated_at := null;
  elsif tg_op = 'INSERT' or new.escalated_to_forum_id is distinct from old.escalated_to_forum_id then
    new.escalated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.escalation_stamp() from public, anon;
create trigger risks_07_escalation before insert or update on public.risks
  for each row execute function private.escalation_stamp();
create trigger issues_07_escalation before insert or update on public.issues
  for each row execute function private.escalation_stamp();

-- ===================================================================== 2. Forum actions
create table public.forum_actions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid,
  forum_id uuid not null,
  meeting_id uuid,
  report_id uuid,
  project_id uuid,
  title text not null check (length(btrim(title)) > 0),
  owner_id uuid,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (forum_id, organisation_id) references public.forums (id, organisation_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (meeting_id, organisation_id) references public.meetings (id, organisation_id) on delete set null (meeting_id),
  foreign key (report_id, organisation_id) references public.reports (id, organisation_id) on delete set null (report_id),
  foreign key (owner_id, organisation_id) references public.resources (id, organisation_id) on delete set null (owner_id),
  check ((status = 'open') = (closed_at is null))
);
create index forum_actions_forum_idx on public.forum_actions (forum_id, organisation_id);
create index forum_actions_ws_idx on public.forum_actions (workspace_id, organisation_id);
create index forum_actions_meeting_idx on public.forum_actions (meeting_id, organisation_id);
create index forum_actions_report_idx on public.forum_actions (report_id, organisation_id);
create index forum_actions_owner_idx on public.forum_actions (owner_id, organisation_id);
create index forum_actions_project_idx on public.forum_actions (project_id);
create index forum_actions_created_by_idx on public.forum_actions (created_by);
create trigger forum_actions_00_tenant_guard before insert or update on public.forum_actions
  for each row execute function private.tenant_guard('forum_id', 'forums');
create trigger forum_actions_updated_at before update on public.forum_actions
  for each row execute function private.set_updated_at();
create trigger forum_actions_audit after insert or update or delete on public.forum_actions
  for each row execute function private.audit_row_change();

-- A project, when given, must be one of the forum's organisation's projects.
create function private.forum_action_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.project_id is not null and not exists (
      select 1 from public.projects p where p.id = new.project_id and p.organisation_id = new.organisation_id) then
    raise exception 'The project must belong to the forum''s organisation.' using errcode = '23514';
  end if;
  if new.status <> 'open' and new.closed_at is null then new.closed_at := now(); end if;
  if new.status = 'open' then new.closed_at := null; end if;
  return new;
end;
$$;
revoke all on function private.forum_action_rules() from public, anon;
create trigger forum_actions_10_rules before insert or update on public.forum_actions
  for each row execute function private.forum_action_rules();

-- Who writes forum actions: forum managers, the chair and secretary; owners update their own.
create function private.can_write_forum_action(p_forum uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.can_manage_forum(f.organisation_id, f.workspace_id)
      or private.forum_role_of(f.id) in ('chair', 'secretary')
    from public.forums f where f.id = p_forum), false);
$$;
revoke all on function private.can_write_forum_action(uuid) from public, anon;
grant execute on function private.can_write_forum_action(uuid) to authenticated, service_role;

alter table public.forum_actions enable row level security;
revoke all on public.forum_actions from anon, authenticated;
grant select, insert, update on public.forum_actions to authenticated;
create policy forum_actions_select on public.forum_actions for select to authenticated
  using (organisation_id = any ((select private.my_org_ids())::uuid[]));
create policy forum_actions_insert on public.forum_actions for insert to authenticated
  with check ((select private.can_write_forum_action(forum_id)));
create policy forum_actions_update on public.forum_actions for update to authenticated
  using ((select private.can_write_forum_action(forum_id)) or owner_id = any ((select private.my_resource_ids())::uuid[]))
  with check ((select private.can_write_forum_action(forum_id)) or owner_id = any ((select private.my_resource_ids())::uuid[]));

-- ======================================================================= 3. Config
-- NHS assurance levels. Evidenced RAG maps green → substantial, amber → reasonable,
-- red → limited; "no assurance" is declared only (§8).
insert into public.rating_schemes (organisation_id, key, name, levels, is_assurance) values
  (null, 'nhs_assurance', 'NHS assurance levels', '[
    {"key":"substantial","label":"Substantial assurance","colour":"#2e7d52","rank":1,"rag":"green"},
    {"key":"reasonable","label":"Reasonable assurance","colour":"#ca8a04","rank":2,"rag":"amber"},
    {"key":"limited","label":"Limited assurance","colour":"#c2410c","rank":3,"rag":"red"},
    {"key":"no_assurance","label":"No assurance","colour":"#7f1d1d","rank":4,"rag":null},
    {"key":"not_reported","label":"Not reported","colour":"#6b7280","rank":5,"rag":"not_set"}]', true);

-- Default tolerances per forum type (§7.3): portfolio-level forums are looser on minor slips.
create function private.default_tolerances(p_forum_type text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_forum_type
    when 'project_board' then '{"divergence_days":{"op":">","value":14},"max_milestone_slip_days":{"op":">","value":7},"budget_variance_pct":{"op":">","value":5},"days_to_next_gate":{"op":"<=","value":30}}'
    when 'portfolio_board' then '{"divergence_days":{"op":">","value":14},"max_milestone_slip_days":{"op":">","value":30},"budget_variance_pct":{"op":">","value":10},"days_to_next_gate":{"op":"<=","value":30}}'
    when 'committee' then '{"divergence_days":{"op":">","value":14},"max_milestone_slip_days":{"op":">","value":30},"budget_variance_pct":{"op":">","value":10},"days_to_next_gate":{"op":"<=","value":30}}'
    else '{"divergence_days":{"op":">","value":14},"max_milestone_slip_days":{"op":">","value":14},"budget_variance_pct":{"op":">","value":5},"days_to_next_gate":{"op":"<=","value":30}}'
  end::jsonb;
$$;
revoke all on function private.default_tolerances(text) from public, anon;
grant execute on function private.default_tolerances(text) to authenticated, service_role;

-- New forums get a type from their level and the type's default tolerances.
create function private.forum_report_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.forum_type := coalesce(new.forum_type, case new.level when 'project' then 'project_board'
    when 'programme' then 'programme_board' when 'portfolio' then 'portfolio_board' else 'committee' end);
  if new.tolerances is null or new.tolerances = '{}'::jsonb then
    new.tolerances := private.default_tolerances(new.forum_type);
  end if;
  return new;
end;
$$;
revoke all on function private.forum_report_defaults() from public, anon;
create trigger forums_08_report_defaults before insert on public.forums
  for each row execute function private.forum_report_defaults();
update public.forums set tolerances = private.default_tolerances(forum_type) where tolerances = '{}'::jsonb;

-- ======================================================================= 4. Metrics
-- escalations_for_forum: open risks and issues escalated to the forum; at_risk_dependencies
-- counts milestone-level receivers too. The Phase 1 function becomes the private core and the
-- public one adds these on top (callers keep the same signature).
alter function public.project_metrics(uuid[], date, uuid, uuid) rename to project_metrics_v1;
alter function public.project_metrics_v1(uuid[], date, uuid, uuid) set schema private;
revoke all on function private.project_metrics_v1(uuid[], date, uuid, uuid) from public, anon;
grant execute on function private.project_metrics_v1(uuid[], date, uuid, uuid) to authenticated, service_role;
create function public.project_metrics(p_project_ids uuid[], p_as_at date, p_forum_id uuid default null,
  p_previous_report_id uuid default null)
returns table (project_id uuid, metrics jsonb)
language sql
stable
set search_path = ''
as $$
  with base as (
    select pm.project_id, pm.metrics from private.project_metrics_v1(p_project_ids, p_as_at, p_forum_id, p_previous_report_id) pm
  ),
  esc as (
    select x.project_id, count(*) as n from (
      select r.project_id from public.risks r where r.status = 'open' and r.escalated_to_forum_id = p_forum_id and r.project_id = any (p_project_ids)
      union all
      select i.project_id from public.issues i where i.status = 'open' and i.escalated_to_forum_id = p_forum_id and i.project_id = any (p_project_ids)
    ) x where p_forum_id is not null group by x.project_id
  ),
  deps as (
    select coalesce(d.receiver_project_id, rm.project_id) as project_id, count(*) as n
    from public.dependencies d
    join public.v_dependency_health dh on dh.dependency_id = d.id
    left join public.milestones rm on rm.id = d.receiver_milestone_id
    where dh.health in ('amber', 'red') and d.validation not in ('closed')
      and coalesce(d.receiver_project_id, rm.project_id) = any (p_project_ids)
    group by 1
  )
  select b.project_id, b.metrics || jsonb_build_object('escalations_for_forum', coalesce(e.n, 0), 'at_risk_dependencies', coalesce(d.n, 0))
  from base b left join esc e on e.project_id = b.project_id left join deps d on d.project_id = b.project_id;
$$;
revoke all on function public.project_metrics(uuid[], date, uuid, uuid) from public, anon;
grant execute on function public.project_metrics(uuid[], date, uuid, uuid) to authenticated, service_role;

-- ================================================================ 5. Phase 2 blocks
-- Same contract as Phase 1: private.rb_<key>(ctx, cfg) → jsonb, security invoker.

create function private.rb_rating_distribution(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with m as (
    select pm.metrics from public.project_metrics(private.rb_projects(ctx), (ctx ->> 'as_at')::date) pm
  )
  select jsonb_build_object('total', (select count(*) from m),
    'declared', (select jsonb_object_agg(k, n) from (select coalesce(metrics ->> 'declared_rating', 'not_set') k, count(*) n from m group by 1) x),
    'evidenced', (select jsonb_object_agg(k, n) from (select coalesce(metrics ->> 'evidenced_rating', 'not_set') k, count(*) n from m group by 1) x));
$$;

create function private.rb_divergence_list(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(x) order by x.divergence_days desc, x.name), '[]')) from (
    select p.id, p.code, p.name, pm.metrics ->> 'declared_rating' as declared, pm.metrics ->> 'evidenced_rating' as evidenced,
      (pm.metrics ->> 'divergence_days')::int as divergence_days, h.justified, h.justification, h.last_report_date
    from public.project_metrics(private.rb_projects(ctx), (ctx ->> 'as_at')::date) pm
    join public.projects p on p.id = pm.project_id
    left join public.project_health_current h on h.project_id = p.id
    where (pm.metrics ->> 'rating_rank_delta')::int > 0
      and (pm.metrics ->> 'divergence_days')::int >= coalesce((cfg ->> 'min_days')::int, 0)) x;
$$;

create function private.rb_milestone_timeline(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with w as (
    select ((ctx ->> 'as_at')::date - interval '1 month')::date as from_date,
      ((ctx ->> 'as_at')::date + make_interval(months => coalesce((cfg ->> 'window_months')::int, 6)))::date as to_date
  )
  select jsonb_build_object('from', w.from_date, 'to', w.to_date, 'as_at', ctx ->> 'as_at',
    'multi', cardinality(private.rb_projects(ctx)) > 1,
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.project_code, coalesce(x.actual_date, x.forecast_date)) from (
      select m.id, m.title, m.type::text as type, p.code as project_code, m.baseline_date, m.forecast_date, m.actual_date, m.slip_days
      from public.v_milestones m join public.projects p on p.id = m.project_id
      where m.project_id = any (private.rb_projects(ctx))
        and coalesce(m.actual_date, m.forecast_date) between w.from_date and w.to_date
        and (cfg -> 'types' is null or jsonb_array_length(cfg -> 'types') = 0 or cfg -> 'types' ? m.type::text)
      limit 200) x), '[]'))
  from w;
$$;

create function private.rb_roadmap(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with w as (
    select ((ctx ->> 'as_at')::date - interval '3 month')::date as from_date,
      ((ctx ->> 'as_at')::date + make_interval(months => coalesce((cfg ->> 'window_months')::int, 12)))::date as to_date
  )
  select jsonb_build_object('from', w.from_date, 'to', w.to_date, 'as_at', ctx ->> 'as_at',
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.programme, x.start_date nulls last, x.name) from (
      select p.id, p.code, p.name, coalesce(g.name, 'No programme') as programme, p.start_date,
        coalesce(h.forecast_finish_date, p.finish_date) as finish_date, p.baseline_finish_date, h.overall::text as rating,
        lp.name as phase,
        (select coalesce(jsonb_agg(jsonb_build_object('title', m.title, 'date', coalesce(m.actual_date, m.forecast_date), 'type', m.type, 'done', m.actual_date is not null)
           order by coalesce(m.actual_date, m.forecast_date)), '[]')
         from public.milestones m where m.project_id = p.id and (m.type = 'gate' or m.report_to_committee)
           and coalesce(m.actual_date, m.forecast_date) between w.from_date and w.to_date) as key_dates
      from public.projects p
      left join public.programmes g on g.id = p.programme_id
      left join public.project_health_current h on h.project_id = p.id
      left join public.lifecycle_phases lp on lp.id = p.phase_id
      where p.id = any (private.rb_projects(ctx))) x), '[]'))
  from w;
$$;

-- RB-22: completion of work items (story points when any are set, else counts) by month, and a
-- straight-line projection from the last three months' rate.
create function private.rb_burnup_forecast(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with items as (
    select w.created_at::date as created, w.done_at::date as done,
      case when exists (select 1 from public.v_work_items x where x.project_id = private.rb_single_project(ctx) and x.story_points is not null and x.deleted_at is null)
        then coalesce(w.story_points, 0) else 1 end as size
    from public.v_work_items w
    where w.project_id = private.rb_single_project(ctx) and w.deleted_at is null and w.status <> 'cancelled'
  ),
  months as (
    select (date_trunc('month', (ctx ->> 'as_at')::date) - make_interval(months => n) + interval '1 month - 1 day')::date as month_end
    from generate_series(0, coalesce((cfg ->> 'months')::int, 6) - 1) n
  ),
  series as (
    select m.month_end,
      (select coalesce(sum(size), 0) from items where created <= m.month_end) as scope,
      (select coalesce(sum(size), 0) from items where done <= m.month_end) as done
    from months m
  ),
  rate as (
    select (max(done) - min(done)) / greatest(count(*) - 1, 1) as per_month, max(scope) - max(done) as remaining
    from (select * from series order by month_end desc limit 3) s
  )
  select jsonb_build_object('unit', case when exists (select 1 from items where size <> 1) then 'points' else 'items' end,
    'series', coalesce((select jsonb_agg(jsonb_build_object('month', to_char(month_end, 'YYYY-MM'), 'scope', scope, 'done', done) order by month_end) from series), '[]'),
    'rate_per_month', round((select per_month from rate), 1),
    'remaining', (select remaining from rate),
    'forecast_month', case when (select per_month from rate) > 0
      then to_char((date_trunc('month', (ctx ->> 'as_at')::date) + make_interval(months => ceil((select remaining from rate) / (select per_month from rate))::int))::date, 'YYYY-MM') end)
  where private.rb_single_project(ctx) is not null;
$$;

create function private.rb_stage_gates(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(x) order by x.due nulls last), '[]')) from (
    select 'milestone' as source, g.milestone_id as id, p.code as project_code, coalesce(g.gate_name, g.title) as name, g.gate_phase_name as phase,
      g.forecast_date as due, g.forecast_date - (ctx ->> 'as_at')::date as days_to, case when g.not_passed then 'overdue' else 'upcoming' end as status,
      (select count(*) from public.gate_checklist_ticks t where t.milestone_id = g.milestone_id) as ticked,
      (select count(*) from public.gate_criteria c where c.phase_id = g.phase_id and p.tier = any (c.tiers)) as criteria
    from public.v_project_gates g join public.projects p on p.id = g.project_id
    where g.project_id = any (private.rb_projects(ctx)) and g.actual_date is null
      and g.forecast_date <= (ctx ->> 'as_at')::date + coalesce((cfg ->> 'window_days')::int, 90)
    union all
    select 'approval_gate', a.id, p.code, a.name, null, a.due_date, a.due_date - (ctx ->> 'as_at')::date, a.status,
      (select count(*) from public.approval_steps s where s.gate_id = a.id and s.decision = 'approved'),
      (select count(*) from public.approval_steps s where s.gate_id = a.id)
    from public.approval_gates a join public.projects p on p.id = a.project_id
    where a.project_id = any (private.rb_projects(ctx)) and a.gate_type = 'stage_gate' and a.status = 'pending'
  ) x;
$$;

create function private.rb_spend_profile(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with months as (
    select (date_trunc('month', (ctx ->> 'as_at')::date) + make_interval(months => n))::date as month
    from generate_series(-coalesce((cfg ->> 'months_back')::int, 6), coalesce((cfg ->> 'months_ahead')::int, 6)) n
  ),
  cut as (select private.financial_cutoff((ctx ->> 'organisation_id')::uuid) as through),
  v as (
    select fv.period_month as month, fv.kind, sum(fv.amount) as amount
    from public.financial_values fv where fv.project_id = any (private.rb_projects(ctx)) group by 1, 2
  )
  select jsonb_build_object('currency', ctx ->> 'currency', 'actuals_through', (select through from cut),
    'rows', coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM'),
      'budget', coalesce((select amount from v where v.month = m.month and kind = 'budget'), 0),
      'actual', case when m.month <= coalesce((select through from cut), m.month) then coalesce((select amount from v where v.month = m.month and kind = 'actual'), 0) end,
      'forecast', coalesce((select amount from v where v.month = m.month and kind = 'forecast'), 0)) order by m.month), '[]'))
  from months m;
$$;

create function private.rb_budget_movers(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with rows as (
    select p.id, p.code, p.name, (pm.metrics ->> 'budget')::numeric as budget, (pm.metrics ->> 'eac')::numeric as eac,
      (pm.metrics ->> 'budget_variance_abs')::numeric as variance, (pm.metrics ->> 'budget_variance_pct')::numeric as variance_pct,
      (pm.metrics ->> 'budget_change_period')::numeric as change_period
    from public.project_metrics(private.rb_projects(ctx), (ctx ->> 'as_at')::date) pm join public.projects p on p.id = pm.project_id
  )
  select jsonb_build_object('currency', ctx ->> 'currency',
    'overspend', coalesce((select jsonb_agg(to_jsonb(r) order by r.variance desc) from (select * from rows where variance > 0 order by variance desc limit coalesce((cfg ->> 'limit')::int, 5)) r), '[]'),
    'movers', coalesce((select jsonb_agg(to_jsonb(r) order by abs(r.change_period) desc) from (select * from rows where coalesce(change_period, 0) <> 0 order by abs(change_period) desc limit coalesce((cfg ->> 'limit')::int, 5)) r), '[]'));
$$;

create function private.rb_resource_summary(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with a as (
    select ra.resource_id, ra.project_id, ra.role, ra.hours_per_week
    from public.resource_assignments ra
    where ra.project_id = any (private.rb_projects(ctx))
      and ra.start_date <= (ctx ->> 'as_at')::date + 28 and ra.finish_date >= (ctx ->> 'as_at')::date
  ),
  people as (
    select r.id, r.name, r.job_title, r.is_placeholder, r.needs_staffing, r.placeholder_role, coalesce(r.contracted_hours_per_week, 37.5) * (1 - coalesce(r.bau_percentage, 0) / 100.0) as capacity,
      (select sum(x.hours_per_week) from public.resource_assignments x where x.resource_id = r.id
         and x.start_date <= (ctx ->> 'as_at')::date + 28 and x.finish_date >= (ctx ->> 'as_at')::date) as booked_all,
      (select sum(a.hours_per_week) from a where a.resource_id = r.id) as booked_here,
      (select string_agg(distinct p.code, ', ') from a join public.projects p on p.id = a.project_id where a.resource_id = r.id) as projects
    from public.resources r where r.id in (select resource_id from a)
  )
  select jsonb_build_object(
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', case when is_placeholder then coalesce(placeholder_role, name) else name end,
       'role', job_title, 'projects', projects, 'booked_here', round(booked_here, 1), 'booked_all', round(booked_all, 1),
       'capacity', round(capacity, 1), 'over', booked_all > capacity, 'unfilled', is_placeholder or needs_staffing)
       order by (booked_all > capacity) desc, name) from people), '[]'),
    'over_allocated', (select count(*) from people where booked_all > capacity and not is_placeholder),
    'unfilled', (select count(*) from people where is_placeholder or needs_staffing),
    'team_size', (select count(*) from public.project_team_members t where t.project_id = any (private.rb_projects(ctx))));
$$;

-- Since the forum's previous meeting (else 31 days before as-at).
create function private.rb_since(ctx jsonb)
returns date
language sql
stable
set search_path = ''
as $$
  select coalesce((select max(m.meeting_date) from public.meetings m
    where m.forum_id = nullif(ctx ->> 'forum_id', '')::uuid and m.meeting_date < coalesce((ctx -> 'meeting' ->> 'meeting_date')::date, (ctx ->> 'as_at')::date)
      and m.status <> 'cancelled'), (ctx ->> 'as_at')::date - 31);
$$;

create function private.rb_decisions_taken(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('since', private.rb_since(ctx), 'rows', coalesce(jsonb_agg(to_jsonb(x) order by x.decision_date desc, x.ref), '[]')) from (
    select d.id, d.ref, d.title, d.decision_date, d.rationale, o.title as chosen_option, p.code as project_code,
      d.decided_meeting_id, d.report_id
    from public.decisions d
    left join public.decision_options o on o.id = d.chosen_option_id
    left join public.projects p on p.id = d.project_id
    where d.status = 'made' and d.decision_date > private.rb_since(ctx)
      and ((nullif(ctx ->> 'forum_id', '') is not null and coalesce(d.decided_by_forum_id, d.forum_id) = (ctx ->> 'forum_id')::uuid
            and (d.project_id is null or d.project_id = any (private.rb_projects(ctx)) or nullif(ctx ->> 'entity_id', '') is null))
        or (nullif(ctx ->> 'forum_id', '') is null and d.project_id = any (private.rb_projects(ctx))))) x;
$$;

create function private.rb_risk_heatmap(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with r as (
    select r.probability::int as l, r.impact::int as c from public.risks r
    where r.project_id = any (private.rb_projects(ctx)) and r.status = 'open'
  ),
  cells as (
    select l, c, private.matrix_score(ctx -> 'matrix', l, c) as score from generate_series(1, 5) l cross join generate_series(1, 5) c
  )
  select jsonb_build_object('matrix', jsonb_build_object('name', ctx -> 'matrix' ->> 'name', 'bands', ctx -> 'matrix' -> 'bands',
      'likelihood', ctx -> 'matrix' -> 'likelihood_levels', 'consequence', ctx -> 'matrix' -> 'consequence_levels'),
    'cells', jsonb_agg(jsonb_build_object('l', cells.l, 'c', cells.c, 'score', cells.score,
      'band', private.matrix_band(ctx -> 'matrix', cells.score) ->> 'key', 'colour', private.matrix_band(ctx -> 'matrix', cells.score) ->> 'colour',
      'count', (select count(*) from r where r.l = cells.l and r.c = cells.c)) order by cells.l desc, cells.c),
    'total', (select count(*) from r))
  from cells;
$$;

create function private.rb_escalations(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(x) order by x.escalated_at desc nulls last), '[]')) from (
    select 'risk' as kind, r.id, r.ref, r.title, p.code as project_code, r.escalated_at,
      private.matrix_score(ctx -> 'matrix', r.probability, r.impact) as score,
      private.matrix_band(ctx -> 'matrix', private.matrix_score(ctx -> 'matrix', r.probability, r.impact)) ->> 'label' as rating
    from public.risks r left join public.projects p on p.id = r.project_id
    where r.status = 'open' and r.escalated_to_forum_id = nullif(ctx ->> 'forum_id', '')::uuid
    union all
    select 'issue', i.id, i.ref, i.title, p.code, i.escalated_at, null, initcap(i.severity::text) || ' severity'
    from public.issues i left join public.projects p on p.id = i.project_id
    where i.status = 'open' and i.escalated_to_forum_id = nullif(ctx ->> 'forum_id', '')::uuid
    union all
    select 'decision', d.id, d.ref, d.title, p.code, d.created_at, null, 'Needed by ' || to_char(d.needed_by_date, 'DD/MM/YYYY')
    from public.decisions d left join public.projects p on p.id = d.project_id
    where d.status = 'pending' and d.forum_id = nullif(ctx ->> 'forum_id', '')::uuid
      and coalesce((cfg ->> 'include_decisions')::boolean, true)
      and (d.project_id is null or not (d.project_id = any (private.rb_projects(ctx))))
  ) x;
$$;

create function private.rb_dependencies(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with d as (
    select d.*, coalesce(d.giver_project_id, gm.project_id) as giver_pid, coalesce(d.receiver_project_id, rm.project_id) as receiver_pid,
      gm.forecast_date as giver_forecast, dh.health::text as health
    from public.dependencies d
    left join public.milestones gm on gm.id = d.giver_milestone_id
    left join public.milestones rm on rm.id = d.receiver_milestone_id
    left join public.v_dependency_health dh on dh.dependency_id = d.id
    where d.validation <> 'closed'
  )
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(x) order by x.at_risk desc, x.need_by nulls last), '[]')) from (
    select d.id, d.ref, d.description, d.type::text as type, d.criticality::text as criticality, d.required_by_date as need_by,
      d.giver_forecast as forecast, d.health, d.health in ('amber', 'red') as at_risk,
      case when d.receiver_pid = any (private.rb_projects(ctx)) and d.giver_pid = any (private.rb_projects(ctx)) then 'internal'
           when d.receiver_pid = any (private.rb_projects(ctx)) then 'in' else 'out' end as direction,
      coalesce(gp.code, gpg.name, d.giver_external_name) as giver, coalesce(rp.code, rpg.name, d.receiver_external_name) as receiver,
      (d.giver_external_name is not null or d.receiver_external_name is not null) as external
    from d
    left join public.projects gp on gp.id = d.giver_pid left join public.programmes gpg on gpg.id = d.giver_programme_id
    left join public.projects rp on rp.id = d.receiver_pid left join public.programmes rpg on rpg.id = d.receiver_programme_id
    where (d.giver_pid = any (private.rb_projects(ctx)) or d.receiver_pid = any (private.rb_projects(ctx)))
      and (not coalesce((cfg ->> 'external_only')::boolean, false) or d.giver_external_name is not null or d.receiver_external_name is not null)
      and (not coalesce((cfg ->> 'at_risk_only')::boolean, false) or d.health in ('amber', 'red'))
    limit coalesce((cfg ->> 'limit')::int, 25)) x;
$$;

create function private.rb_benefits_summary(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with b as (
    select distinct b.id, b.ref, b.title, coalesce(lv.label, b.category_list) as category, b.planned_total_value, b.status::text as status,
      br.realised_value, br.realised_percent, br.behind_profile, br.health::text as health
    from public.benefits b
    left join public.lookup_values lv on lv.id = b.category_id
    left join public.v_benefit_realisation br on br.benefit_id = b.id
    where (b.id in (select bp.benefit_id from public.benefit_projects bp where bp.project_id = any (private.rb_projects(ctx)))
        or (nullif(ctx ->> 'entity_id', '') is null and b.programme_id in (select p.programme_id from public.projects p where p.id = any (private.rb_projects(ctx)))))
      and (cfg -> 'categories' is null or jsonb_array_length(cfg -> 'categories') = 0 or cfg -> 'categories' ? coalesce(lv.label, b.category_list))
  ),
  progs as (select distinct p.programme_id from public.projects p where p.id = any (private.rb_projects(ctx)) and p.programme_id is not null)
  select jsonb_build_object('currency', ctx ->> 'currency',
    'rows', coalesce((select jsonb_agg(to_jsonb(b) order by b.planned_total_value desc nulls last) from b), '[]'),
    'planned', (select sum(planned_total_value) from b), 'realised', (select sum(realised_value) from b),
    'capabilities', (select jsonb_object_agg(rag, n) from (select coalesce(c.rag::text, 'not_set') rag, count(*) n from public.v_capability_health c
       where c.programme_id in (select programme_id from progs) group by 1) x),
    'outcomes', (select jsonb_object_agg(rag, n) from (select coalesce(o.rag::text, 'not_set') rag, count(*) n from public.v_outcome_health o
       where o.programme_id in (select programme_id from progs) group by 1) x));
$$;

create function private.rb_requests_pipeline(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('currency', ctx ->> 'currency', 'rows', coalesce(jsonb_agg(to_jsonb(x) order by x.priority_rank desc, x.created_at), '[]')) from (
    select r.id, r.ref, r.title, r.status::text as status, r.estimated_cost, r.estimated_benefit, r.priority::text as priority,
      array_position(enum_range(null::public.priority), r.priority) as priority_rank, r.created_at, sp.name as sponsor
    from public.project_requests r left join public.resources sp on sp.id = r.sponsor_id
    where r.organisation_id = (ctx ->> 'organisation_id')::uuid and r.status in ('new', 'in_review', 'on_hold')
      and (ctx ->> 'scope_type' <> 'portfolio' or r.portfolio_id = (ctx ->> 'scope_entity_id')::uuid)
    limit coalesce((cfg ->> 'limit')::int, 20)) x;
$$;

create function private.rb_actions_log(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with acts as (
    select 'forum' as source, a.id, a.title, a.due_date, a.status, a.closed_at, res.name as owner, p.code as project_code, m.meeting_date
    from public.forum_actions a left join public.resources res on res.id = a.owner_id
    left join public.projects p on p.id = a.project_id left join public.meetings m on m.id = a.meeting_id
    where a.forum_id = nullif(ctx ->> 'forum_id', '')::uuid
    union all
    select 'decision', da.id, da.description || ' (' || d.ref || ')', da.due_date, case da.status when 'done' then 'done' else 'open' end,
      case when da.status = 'done' then da.updated_at end, res.name, p.code, d.decision_date
    from public.decision_actions da join public.decisions d on d.id = da.decision_id
    left join public.resources res on res.id = da.owner_id left join public.projects p on p.id = d.project_id
    where coalesce(d.decided_by_forum_id, d.forum_id) = nullif(ctx ->> 'forum_id', '')::uuid
       or (nullif(ctx ->> 'forum_id', '') is null and d.project_id = any (private.rb_projects(ctx)))
  )
  select jsonb_build_object('since', private.rb_since(ctx),
    'open', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('overdue', a.due_date < (ctx ->> 'as_at')::date) order by a.due_date nulls last) from acts a where a.status = 'open'), '[]'),
    'closed', coalesce((select jsonb_agg(to_jsonb(a) order by a.closed_at desc) from acts a where a.status <> 'open' and a.closed_at::date > private.rb_since(ctx)), '[]'),
    'overdue_count', (select count(*) from acts a where a.status = 'open' and a.due_date < (ctx ->> 'as_at')::date));
$$;

-- Data quality (§13): no highlight report submitted in this cycle (since the previous meeting's
-- papers deadline, else 31 days), stale risks, missing forecast or baseline.
create function private.rb_data_quality(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with cycle as (
    select coalesce((select max(m.papers_deadline) from public.meetings m
      where m.forum_id = nullif(ctx ->> 'forum_id', '')::uuid and m.papers_deadline < (ctx ->> 'as_at')::date
        and m.id is distinct from nullif(ctx -> 'meeting' ->> 'id', '')::uuid and m.status <> 'cancelled'), (ctx ->> 'as_at')::date - 31) as since
  ),
  rows as (
    select p.id, p.code, p.name,
      (select max(r.reporting_date) from public.status_reports r where r.project_id = p.id and r.status = 'submitted' and r.reporting_date <= (ctx ->> 'as_at')::date) as last_report,
      not exists (select 1 from public.status_reports r, cycle where r.project_id = p.id and r.status = 'submitted'
        and r.reporting_date > cycle.since and r.reporting_date <= (ctx ->> 'as_at')::date) as missing_report,
      (select count(*) from public.risks r where r.project_id = p.id and r.status = 'open'
        and r.updated_at::date < (ctx ->> 'as_at')::date - coalesce((cfg ->> 'stale_days')::int, 30)) as stale_risks,
      not exists (select 1 from public.financial_values fv where fv.project_id = p.id and fv.kind = 'forecast'
        and fv.period_month > date_trunc('month', (ctx ->> 'as_at')::date)) as missing_forecast,
      not exists (select 1 from public.budget_baselines b where b.project_id = p.id) as missing_baseline
    from public.projects p where p.id = any (private.rb_projects(ctx))
  )
  select jsonb_build_object('since', (select since from cycle), 'stale_days', coalesce((cfg ->> 'stale_days')::int, 30),
    'rows', coalesce(jsonb_agg(to_jsonb(r) order by r.missing_report desc, r.stale_risks desc, r.name)
      filter (where r.missing_report or r.stale_risks > 0 or r.missing_forecast or r.missing_baseline), '[]'),
    'clean', count(*) filter (where not (r.missing_report or r.stale_risks > 0 or r.missing_forecast or r.missing_baseline)))
  from rows r;
$$;

create function private.rb_approvals_status(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(x) order by x.status = 'pending' desc, x.due_date nulls last), '[]')) from (
    select a.id, a.name, a.gate_type, a.status, a.due_date, p.code as project_code,
      (select jsonb_agg(jsonb_build_object('order', s.step_order, 'role', s.required_role, 'decision', s.decision, 'decided_at', s.decided_at,
         'approver', pr.display_name, 'comment', s.comment) order by s.step_order)
       from public.approval_steps s left join public.profiles pr on pr.id = s.approver_id where s.gate_id = a.id) as steps
    from public.approval_gates a join public.projects p on p.id = a.project_id
    where a.project_id = any (private.rb_projects(ctx))
      and (cfg -> 'gate_types' is null or jsonb_array_length(cfg -> 'gate_types') = 0 or cfg -> 'gate_types' ? a.gate_type)
      and (a.status = 'pending' or a.decided_at::date > (ctx ->> 'as_at')::date - 90)) x;
$$;

-- ================================================================ 6. System templates
insert into public.report_templates (organisation_id, name, description, forum_type, scope_type, is_system, blocks, selection_rules)
values
(null, 'Programme Board', 'Programme pack: status of every project, exceptions as deep-dives, money, risks, decisions.',
 'programme_board', 'programme', true, '[
  {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
  {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"overall","blockKey":"overall_status","blockVersion":1,"config":{},"placement":"report"},
  {"id":"dist","blockKey":"rating_distribution","blockVersion":1,"config":{},"placement":"report"},
  {"id":"grid","blockKey":"project_status_grid","blockVersion":1,"config":{},"placement":"report"},
  {"id":"since","blockKey":"changes_since_last","blockVersion":1,"config":{},"placement":"report"},
  {"id":"roadmap","blockKey":"roadmap","blockVersion":1,"config":{},"placement":"report"},
  {"id":"budget","blockKey":"budget_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"movers","blockKey":"budget_movers","blockVersion":1,"config":{},"placement":"report"},
  {"id":"escalations","blockKey":"escalations","blockVersion":1,"config":{},"placement":"report"},
  {"id":"deps","blockKey":"dependencies","blockVersion":1,"config":{},"placement":"report"},
  {"id":"benefits","blockKey":"benefits_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"decisions","blockKey":"decisions_required","blockVersion":1,"config":{},"placement":"report"},
  {"id":"changes","blockKey":"change_requests","blockVersion":1,"config":{},"placement":"report"},
  {"id":"actions","blockKey":"actions_log","blockVersion":1,"config":{},"placement":"report"},
  {"id":"dd-heading","blockKey":"section_heading","blockVersion":1,"config":{"title":"Project deep-dives"},"placement":"report","pageBreakBefore":true},
  {"id":"dd-overall","blockKey":"overall_status","blockVersion":1,"config":{},"placement":"deep_dive"},
  {"id":"dd-health","blockKey":"health_by_dimension","blockVersion":1,"config":{},"placement":"deep_dive"},
  {"id":"dd-milestones","blockKey":"milestone_slippage","blockVersion":1,"config":{"limit":6},"placement":"deep_dive"},
  {"id":"dd-budget","blockKey":"budget_summary","blockVersion":1,"config":{},"placement":"deep_dive"},
  {"id":"dd-raid","blockKey":"top_raid","blockVersion":1,"config":{"limit":5},"placement":"deep_dive"},
  {"id":"dd-highlight","blockKey":"highlight_report_summary","blockVersion":1,"config":{},"placement":"deep_dive"}
 ]', '{"mode":"any","orderBy":"severity","rules":[
  {"id":"evidenced_red","label":"Evidenced red","metric":"evidenced_rating","op":"=","value":"red","severity":3,"enabled":true},
  {"id":"worsened","label":"Worsened since last report","metric":"rating_worsened","op":"=","value":true,"severity":2,"enabled":true},
  {"id":"divergence","label":"Report better than evidence","metric":"divergence_days","op":">","value":14,"useForumTolerance":true,"severity":2,"enabled":true},
  {"id":"slip","label":"Schedule slip beyond tolerance","metric":"max_milestone_slip_days","op":">","value":14,"useForumTolerance":true,"severity":2,"enabled":true},
  {"id":"budget","label":"Budget variance beyond tolerance","metric":"budget_variance_pct","op":">","value":5,"useForumTolerance":true,"severity":2,"enabled":true},
  {"id":"decision","label":"Decision required from this forum","metric":"open_decisions_for_forum","op":">","value":0,"severity":1,"enabled":true},
  {"id":"escalated","label":"Escalated to this forum","metric":"escalations_for_forum","op":">","value":0,"severity":3,"enabled":true},
  {"id":"gate","label":"Stage gate due","metric":"days_to_next_gate","op":"<=","value":30,"useForumTolerance":true,"severity":1,"enabled":true}]}'),
(null, 'Portfolio Board / Committee', 'Portfolio pack: exceptions only, divergence, money, benefits, pipeline and escalations.',
 'portfolio_board', 'portfolio', true, '[
  {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
  {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"dist","blockKey":"rating_distribution","blockVersion":1,"config":{},"placement":"report"},
  {"id":"grid","blockKey":"project_status_grid","blockVersion":1,"config":{"only_exceptions":true},"placement":"report"},
  {"id":"divergence","blockKey":"divergence_list","blockVersion":1,"config":{},"placement":"report"},
  {"id":"budget","blockKey":"budget_summary","blockVersion":1,"config":{"show_projects":false},"placement":"report"},
  {"id":"movers","blockKey":"budget_movers","blockVersion":1,"config":{},"placement":"report"},
  {"id":"benefits","blockKey":"benefits_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"roadmap","blockKey":"roadmap","blockVersion":1,"config":{},"placement":"report"},
  {"id":"escalations","blockKey":"escalations","blockVersion":1,"config":{},"placement":"report"},
  {"id":"pipeline","blockKey":"requests_pipeline","blockVersion":1,"config":{},"placement":"report"},
  {"id":"decisions","blockKey":"decisions_required","blockVersion":1,"config":{},"placement":"report"},
  {"id":"dq","blockKey":"data_quality","blockVersion":1,"config":{},"placement":"report"},
  {"id":"actions","blockKey":"actions_log","blockVersion":1,"config":{},"placement":"report"},
  {"id":"dd-heading","blockKey":"section_heading","blockVersion":1,"config":{"title":"Project deep-dives"},"placement":"report","pageBreakBefore":true},
  {"id":"dd-overall","blockKey":"overall_status","blockVersion":1,"config":{},"placement":"deep_dive"},
  {"id":"dd-health","blockKey":"health_by_dimension","blockVersion":1,"config":{},"placement":"deep_dive"},
  {"id":"dd-milestones","blockKey":"milestone_slippage","blockVersion":1,"config":{"limit":6},"placement":"deep_dive"},
  {"id":"dd-budget","blockKey":"budget_summary","blockVersion":1,"config":{},"placement":"deep_dive"},
  {"id":"dd-raid","blockKey":"top_raid","blockVersion":1,"config":{"limit":5},"placement":"deep_dive"}
 ]', '{"mode":"any","orderBy":"severity","maxAutoIncluded":10,"rules":[
  {"id":"evidenced_red","label":"Evidenced red","metric":"evidenced_rating","op":"=","value":"red","severity":3,"enabled":true},
  {"id":"worsened","label":"Worsened since last report","metric":"rating_worsened","op":"=","value":true,"severity":2,"enabled":true},
  {"id":"divergence","label":"Report better than evidence","metric":"divergence_days","op":">","value":14,"useForumTolerance":true,"severity":2,"enabled":true},
  {"id":"slip","label":"Schedule slip beyond tolerance","metric":"max_milestone_slip_days","op":">","value":30,"useForumTolerance":true,"severity":2,"enabled":true},
  {"id":"budget","label":"Budget variance beyond tolerance","metric":"budget_variance_pct","op":">","value":10,"useForumTolerance":true,"severity":2,"enabled":true},
  {"id":"decision","label":"Decision required from this forum","metric":"open_decisions_for_forum","op":">","value":0,"severity":1,"enabled":true},
  {"id":"escalated","label":"Escalated to this forum","metric":"escalations_for_forum","op":">","value":0,"severity":3,"enabled":true},
  {"id":"gate","label":"Stage gate due","metric":"days_to_next_gate","op":"<=","value":30,"useForumTolerance":true,"severity":1,"enabled":true}]}');

-- ========================================================================= 7. Grants
revoke all on function private.rb_rating_distribution(jsonb, jsonb), private.rb_divergence_list(jsonb, jsonb),
  private.rb_milestone_timeline(jsonb, jsonb), private.rb_roadmap(jsonb, jsonb), private.rb_burnup_forecast(jsonb, jsonb),
  private.rb_stage_gates(jsonb, jsonb), private.rb_spend_profile(jsonb, jsonb), private.rb_budget_movers(jsonb, jsonb),
  private.rb_resource_summary(jsonb, jsonb), private.rb_since(jsonb), private.rb_decisions_taken(jsonb, jsonb),
  private.rb_risk_heatmap(jsonb, jsonb), private.rb_escalations(jsonb, jsonb), private.rb_dependencies(jsonb, jsonb),
  private.rb_benefits_summary(jsonb, jsonb), private.rb_requests_pipeline(jsonb, jsonb), private.rb_actions_log(jsonb, jsonb),
  private.rb_data_quality(jsonb, jsonb), private.rb_approvals_status(jsonb, jsonb)
  from public, anon;
grant execute on function private.rb_rating_distribution(jsonb, jsonb), private.rb_divergence_list(jsonb, jsonb),
  private.rb_milestone_timeline(jsonb, jsonb), private.rb_roadmap(jsonb, jsonb), private.rb_burnup_forecast(jsonb, jsonb),
  private.rb_stage_gates(jsonb, jsonb), private.rb_spend_profile(jsonb, jsonb), private.rb_budget_movers(jsonb, jsonb),
  private.rb_resource_summary(jsonb, jsonb), private.rb_since(jsonb), private.rb_decisions_taken(jsonb, jsonb),
  private.rb_risk_heatmap(jsonb, jsonb), private.rb_escalations(jsonb, jsonb), private.rb_dependencies(jsonb, jsonb),
  private.rb_benefits_summary(jsonb, jsonb), private.rb_requests_pipeline(jsonb, jsonb), private.rb_actions_log(jsonb, jsonb),
  private.rb_data_quality(jsonb, jsonb), private.rb_approvals_status(jsonb, jsonb)
  to authenticated, service_role;
