-- NHS-1 part 2: board assurance report blocks and committee templates (docs/nhs-module-plan.md
-- § NHS-1 items 4–6, docs/sql/nhs-1b-assurance-blocks.sql). Written by an unattended run on
-- 22/11/2026: tested on the local Postgres only, NOT applied to production. Apply after
-- 20261122170000_nhs_1_board_assurance. Nothing here is destructive: three new block functions,
-- one function replaced (private.partner_unsafe_blocks, its list extended) and five new system
-- report templates (inserted only when missing).
--
-- Design
-- - Blocks follow the report builder's contract (RB-10): private.rb_<key>(ctx, cfg) shapes the
--   data, the TypeScript renderer only draws it. report_block_data runs them as the caller (RLS on
--   strategic_risks applies); publish_report runs them as the owner, so every read is filtered by
--   ctx.organisation_id (the report's own organisation).
-- - The BAF is organisation-wide, so baf_summary and baf_above_appetite ignore the report's project
--   scope. baf_linkage shows only the programme and project risks in the report's scope (config
--   in_scope_only, default true).
-- - Dates use the report's as-at date, so a published pack keeps the overdue state it had.
-- - The heat map uses the organisation's assurance matrix (private.assurance_matrix, NHS 5×5 for
--   the NHS pack) and counts only entries scored on that matrix; others are counted separately.
-- - All three are partner-unsafe (strategic risks are internal to the organisation), so they are
--   added to private.partner_unsafe_blocks (the registry marks them partnerSafe: false).
-- - The committee templates are system rows like "Funding committee" (one global row each). The
--   app hides a template while a block in it belongs to a module that is off (lib/modules.ts
--   reportBlocks), so organisations without board assurance never see them. They use the
--   'nhs_assurance' rating scheme; they set no risk matrix, so project risks in the pack keep the
--   organisation's register matrix (RB-13a: report and register scoring must not disagree).

-- ---------------------------------------------------------------------------------------------
-- 1. Blocks
-- ---------------------------------------------------------------------------------------------

-- Open strategic risks of the report's organisation, with names, scores and as-at flags.
create function private.rb_baf_rows(ctx jsonb)
returns table (
  id uuid, ref text, title text, lead text, forum text, objective text, matrix_id uuid,
  current_likelihood smallint, current_consequence smallint, current_score integer, band jsonb,
  target_score integer, appetite text, appetite_score smallint, above_appetite boolean, trend text,
  assurance_rating text, assurance_label text, assurance_colour text, assurance_rank integer,
  review_date date, review_overdue boolean, open_actions integer, overdue_actions integer,
  linked_risks integer, gaps_in_control text, gaps_in_assurance text, is_sample boolean)
language sql
stable
set search_path = ''
as $$
  select v.id, v.ref, v.title, ro.name, f.name, o.title, v.risk_matrix_id,
    v.current_likelihood, v.current_consequence, v.current_score, v.current_band,
    v.target_score, coalesce(lv.label, v.risk_appetite), v.appetite_score, v.above_appetite, v.trend,
    v.assurance_rating, v.assurance_label, v.assurance_colour, v.assurance_rank,
    v.review_date, v.review_date < (ctx ->> 'as_at')::date,
    (select count(*) from public.strategic_risk_actions a
      where a.strategic_risk_id = v.id and a.status in ('not_started', 'in_progress'))::integer,
    (select count(*) from public.strategic_risk_actions a
      where a.strategic_risk_id = v.id and a.status in ('not_started', 'in_progress')
        and a.due_date < (ctx ->> 'as_at')::date)::integer,
    v.linked_risk_count, v.gaps_in_control, v.gaps_in_assurance, v.is_sample
  from public.v_strategic_risks v
  left join public.resources ro on ro.id = v.executive_lead_id
  left join public.forums f on f.id = v.lead_forum_id
  left join public.strategic_objectives o on o.id = v.strategic_objective_id
  left join public.lookup_values lv on lv.organisation_id = v.organisation_id
    and lv.list_key = 'risk_appetite' and lv.value = v.risk_appetite
  where v.organisation_id = nullif(ctx ->> 'organisation_id', '')::uuid
    and v.status = 'open';
$$;

-- baf_summary: heat map of open strategic risks (current likelihood × consequence) and the register
-- in score order. Config: limit (rows listed, default 20).
create function private.rb_baf_summary(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with mx as (select private.assurance_matrix(nullif(ctx ->> 'organisation_id', '')::uuid) as m),
  r as (select * from private.rb_baf_rows(ctx)),
  on_grid as (select r.* from r, mx where r.matrix_id = (mx.m ->> 'id')::uuid),
  cells as (
    select l, c, private.matrix_score(mx.m, l, c) as score
    from mx, generate_series(1, 5) l cross join generate_series(1, 5) c
  )
  select jsonb_build_object(
    'matrix', jsonb_build_object('name', mx.m ->> 'name', 'bands', coalesce(mx.m -> 'bands', '[]'),
      'likelihood', mx.m -> 'likelihood_levels', 'consequence', mx.m -> 'consequence_levels'),
    'cells', coalesce((select jsonb_agg(jsonb_build_object('l', cells.l, 'c', cells.c, 'score', cells.score,
        'band', private.matrix_band(mx.m, cells.score) ->> 'key', 'colour', private.matrix_band(mx.m, cells.score) ->> 'colour',
        'count', (select count(*) from on_grid g where g.current_likelihood = cells.l and g.current_consequence = cells.c),
        'refs', coalesce((select jsonb_agg(g.ref order by g.ref) from on_grid g
                          where g.current_likelihood = cells.l and g.current_consequence = cells.c), '[]'))
      order by cells.l desc, cells.c) from cells), '[]'),
    'total', (select count(*) from r),
    'on_other_matrix', (select count(*) from r) - (select count(*) from on_grid),
    'counts', jsonb_build_object(
      'above_appetite', (select count(*) from r where above_appetite),
      'review_overdue', (select count(*) from r where review_overdue),
      'low_assurance', (select count(*) from r where assurance_rank is not null and assurance_rating in ('limited', 'none', 'no_assurance')),
      'no_rating', (select count(*) from r where assurance_rating is null),
      'overdue_actions', (select coalesce(sum(overdue_actions), 0) from r)),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'title', x.title, 'lead', x.lead,
        'forum', x.forum, 'current_score', x.current_score, 'band', x.band ->> 'label', 'band_colour', x.band ->> 'colour',
        'target_score', x.target_score, 'appetite_score', x.appetite_score, 'above_appetite', x.above_appetite,
        'trend', x.trend, 'assurance', x.assurance_label, 'assurance_colour', x.assurance_colour,
        'review_date', x.review_date, 'review_overdue', x.review_overdue, 'is_sample', x.is_sample)
      order by x.current_score desc nulls last, x.ref)
      from (select * from r order by current_score desc nulls last, ref
            limit least(greatest(coalesce((cfg ->> 'limit')::integer, 20), 1), 100)) x), '[]'))
  from mx;
$$;

-- baf_above_appetite: open strategic risks whose current score is above their tolerated score,
-- largest gap first, with the gaps in control and assurance and the actions. Config: limit
-- (default 10), show_gaps (default true).
create function private.rb_baf_above_appetite(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with r as (select * from private.rb_baf_rows(ctx) where above_appetite),
  lim as (select least(greatest(coalesce((cfg ->> 'limit')::integer, 10), 1), 50) as n)
  select jsonb_build_object(
    'total_open', (select count(*) from private.rb_baf_rows(ctx)),
    'count', (select count(*) from r),
    'no_appetite', (select count(*) from private.rb_baf_rows(ctx) where appetite_score is null),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'title', x.title, 'lead', x.lead,
        'current_score', x.current_score, 'band', x.band ->> 'label', 'band_colour', x.band ->> 'colour',
        'appetite', x.appetite, 'appetite_score', x.appetite_score, 'gap', x.current_score - x.appetite_score,
        'target_score', x.target_score, 'trend', x.trend, 'assurance', x.assurance_label,
        'gaps_in_control', case when coalesce((cfg ->> 'show_gaps')::boolean, true) then left(x.gaps_in_control, 600) end,
        'gaps_in_assurance', case when coalesce((cfg ->> 'show_gaps')::boolean, true) then left(x.gaps_in_assurance, 600) end,
        'open_actions', x.open_actions, 'overdue_actions', x.overdue_actions)
      order by x.current_score - x.appetite_score desc, x.current_score desc, x.ref)
      from (select * from r order by current_score - appetite_score desc, current_score desc, ref
            limit (select n from lim)) x), '[]'));
$$;

-- baf_linkage: each open strategic risk with the programme and project risks that contribute to it
-- (record_links, link_type 'contributes_to_baf'). With in_scope_only (default true) only linked
-- risks of the report's projects, or of their programmes, count; strategic risks with no linked
-- risk in scope are listed by ref only. Config: limit (linked risks per strategic risk, default 8).
create function private.rb_baf_linkage(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with s as (select * from private.rb_baf_rows(ctx)),
  scope as (
    select private.rb_projects(ctx) as projects,
      coalesce((select array_agg(distinct p.programme_id) from public.projects p
                where p.id = any (private.rb_projects(ctx)) and p.programme_id is not null), '{}')
      || case when ctx ->> 'scope_type' = 'programme' then array[nullif(ctx ->> 'scope_entity_id', '')::uuid] else '{}'::uuid[] end
        as programmes
  ),
  linked as (
    select l.to_id as strategic_risk_id, k.id, k.ref, k.title, k.status::text as status,
      private.matrix_score(ctx -> 'matrix', k.probability::integer, k.impact::integer) as score,
      private.matrix_band(ctx -> 'matrix', private.matrix_score(ctx -> 'matrix', k.probability::integer, k.impact::integer)) as band,
      pj.code as project_code, pj.name as project_name, pg.name as programme_name
    from public.record_links l
    join public.risks k on k.id = l.from_id
    left join public.projects pj on pj.id = k.project_id
    left join public.programmes pg on pg.id = coalesce(k.programme_id, pj.programme_id)
    cross join scope
    where l.link_type = 'contributes_to_baf' and l.from_type = 'risk' and l.to_type = 'strategic_risk'
      and l.organisation_id = nullif(ctx ->> 'organisation_id', '')::uuid
      and l.to_id in (select id from s)
      and (not coalesce((cfg ->> 'in_scope_only')::boolean, true)
           or k.project_id = any (scope.projects)
           or (k.project_id is null and k.programme_id = any (scope.programmes)))
  ),
  lim as (select least(greatest(coalesce((cfg ->> 'limit')::integer, 8), 1), 50) as n)
  select jsonb_build_object(
    'in_scope_only', coalesce((cfg ->> 'in_scope_only')::boolean, true),
    'linked_total', (select count(*) from linked),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'ref', s.ref, 'title', s.title,
        'current_score', s.current_score, 'band', s.band ->> 'label', 'band_colour', s.band ->> 'colour',
        'above_appetite', s.above_appetite, 'assurance', s.assurance_label,
        'count', (select count(*) from linked x where x.strategic_risk_id = s.id),
        'open_count', (select count(*) from linked x where x.strategic_risk_id = s.id and x.status = 'open'),
        'risks', coalesce((select jsonb_agg(jsonb_build_object('id', y.id, 'ref', y.ref, 'title', y.title, 'status', y.status,
            'score', y.score, 'band', y.band ->> 'label', 'band_colour', y.band ->> 'colour',
            'project_code', y.project_code, 'project_name', y.project_name, 'programme_name', y.programme_name)
          order by y.score desc nulls last, y.ref)
          from (select * from linked x where x.strategic_risk_id = s.id
                order by (x.status = 'open') desc, x.score desc nulls last, x.ref limit (select n from lim)) y), '[]'))
      order by s.current_score desc nulls last, s.ref)
      from s where exists (select 1 from linked x where x.strategic_risk_id = s.id)), '[]'),
    'unlinked', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'ref', s.ref, 'title', s.title) order by s.ref)
      from s where not exists (select 1 from linked x where x.strategic_risk_id = s.id)), '[]'));
$$;

revoke all on function private.rb_baf_rows(jsonb), private.rb_baf_summary(jsonb, jsonb),
  private.rb_baf_above_appetite(jsonb, jsonb), private.rb_baf_linkage(jsonb, jsonb) from public, anon;
grant execute on function private.rb_baf_rows(jsonb), private.rb_baf_summary(jsonb, jsonb),
  private.rb_baf_above_appetite(jsonb, jsonb), private.rb_baf_linkage(jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 2. Partner safety: strategic risks never reach partner organisations.
-- ---------------------------------------------------------------------------------------------

create or replace function private.partner_unsafe_blocks()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['resource_summary', 'data_quality', 'baf_summary', 'baf_above_appetite', 'baf_linkage']; $$;

-- ---------------------------------------------------------------------------------------------
-- 3. Committee templates (system rows; hidden in the app unless the 'assurance' module is on)
-- ---------------------------------------------------------------------------------------------

insert into public.report_templates (organisation_id, name, description, forum_type, scope_type, is_system,
                                     rating_scheme_key, blocks, selection_rules)
select null, t.name, t.description, t.forum_type, t.scope_type, true, 'nhs_assurance', t.blocks, coalesce(pb.rules, '{}'::jsonb)
from (values
  ('Trust Board',
   'Board pack: the Board Assurance Framework, strategic risks above appetite, delivery at a glance, exceptions and decisions.',
   'committee', 'any', '[
    {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
    {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
    {"id":"baf","blockKey":"baf_summary","blockVersion":1,"config":{"limit":20},"placement":"report","pageBreakBefore":true},
    {"id":"appetite","blockKey":"baf_above_appetite","blockVersion":1,"config":{"limit":10,"show_gaps":true},"placement":"report"},
    {"id":"dist","blockKey":"rating_distribution","blockVersion":1,"config":{},"placement":"report","pageBreakBefore":true},
    {"id":"grid","blockKey":"project_status_grid","blockVersion":1,"config":{"only_exceptions":true},"placement":"report"},
    {"id":"budget","blockKey":"budget_summary","blockVersion":1,"config":{"show_projects":false},"placement":"report"},
    {"id":"benefits","blockKey":"benefits_value","blockVersion":1,"config":{},"placement":"report"},
    {"id":"escalations","blockKey":"escalations","blockVersion":1,"config":{},"placement":"report"},
    {"id":"decisions","blockKey":"decisions_required","blockVersion":1,"config":{},"placement":"report","pageBreakBefore":true},
    {"id":"actions","blockKey":"actions_log","blockVersion":1,"config":{},"placement":"report"}
   ]'::jsonb),
  ('Finance & Performance Committee',
   'Finance and performance pack: budget, spend profile and movers, benefits value, strategic risks above appetite and decisions.',
   'committee', 'any', '[
    {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
    {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
    {"id":"budget","blockKey":"budget_summary","blockVersion":1,"config":{"show_projects":true},"placement":"report"},
    {"id":"spend","blockKey":"spend_profile","blockVersion":1,"config":{},"placement":"report"},
    {"id":"movers","blockKey":"budget_movers","blockVersion":1,"config":{},"placement":"report"},
    {"id":"benefits","blockKey":"benefits_value","blockVersion":1,"config":{},"placement":"report","pageBreakBefore":true},
    {"id":"appetite","blockKey":"baf_above_appetite","blockVersion":1,"config":{"limit":10,"show_gaps":true},"placement":"report","pageBreakBefore":true},
    {"id":"grid","blockKey":"project_status_grid","blockVersion":1,"config":{"only_exceptions":true},"placement":"report"},
    {"id":"decisions","blockKey":"decisions_required","blockVersion":1,"config":{},"placement":"report"},
    {"id":"actions","blockKey":"actions_log","blockVersion":1,"config":{},"placement":"report"}
   ]'::jsonb),
  ('Quality Committee',
   'Quality pack: strategic risks above appetite, programme risks behind them, top risks and issues, escalations, benefits and decisions.',
   'committee', 'any', '[
    {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
    {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
    {"id":"appetite","blockKey":"baf_above_appetite","blockVersion":1,"config":{"limit":10,"show_gaps":true},"placement":"report"},
    {"id":"linkage","blockKey":"baf_linkage","blockVersion":1,"config":{"in_scope_only":true,"limit":8},"placement":"report","pageBreakBefore":true},
    {"id":"raid","blockKey":"top_raid","blockVersion":1,"config":{},"placement":"report"},
    {"id":"escalations","blockKey":"escalations","blockVersion":1,"config":{},"placement":"report"},
    {"id":"benefits","blockKey":"benefits_summary","blockVersion":1,"config":{},"placement":"report","pageBreakBefore":true},
    {"id":"decisions","blockKey":"decisions_required","blockVersion":1,"config":{},"placement":"report"},
    {"id":"actions","blockKey":"actions_log","blockVersion":1,"config":{},"placement":"report"}
   ]'::jsonb),
  ('Audit & Risk Committee',
   'Audit and risk pack: the Board Assurance Framework, risks above appetite, linked programme risks, the risk heat map, escalations, data quality and actions.',
   'committee', 'any', '[
    {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
    {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
    {"id":"baf","blockKey":"baf_summary","blockVersion":1,"config":{"limit":30},"placement":"report","pageBreakBefore":true},
    {"id":"appetite","blockKey":"baf_above_appetite","blockVersion":1,"config":{"limit":15,"show_gaps":true},"placement":"report"},
    {"id":"linkage","blockKey":"baf_linkage","blockVersion":1,"config":{"in_scope_only":false,"limit":8},"placement":"report","pageBreakBefore":true},
    {"id":"heatmap","blockKey":"risk_heatmap","blockVersion":1,"config":{},"placement":"report"},
    {"id":"escalations","blockKey":"escalations","blockVersion":1,"config":{},"placement":"report"},
    {"id":"dq","blockKey":"data_quality","blockVersion":1,"config":{},"placement":"report","pageBreakBefore":true},
    {"id":"actions","blockKey":"actions_log","blockVersion":1,"config":{},"placement":"report"}
   ]'::jsonb),
  ('Executive Management / PMO Board',
   'Executive and PMO pack: delivery at a glance, exceptions, slippage, divergence, escalations, programme risks behind the BAF and decisions, with project deep-dives.',
   'committee', 'any', '[
    {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
    {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
    {"id":"dist","blockKey":"rating_distribution","blockVersion":1,"config":{},"placement":"report"},
    {"id":"grid","blockKey":"project_status_grid","blockVersion":1,"config":{"only_exceptions":true},"placement":"report"},
    {"id":"slippage","blockKey":"milestone_slippage","blockVersion":1,"config":{},"placement":"report"},
    {"id":"divergence","blockKey":"divergence_list","blockVersion":1,"config":{},"placement":"report"},
    {"id":"escalations","blockKey":"escalations","blockVersion":1,"config":{},"placement":"report"},
    {"id":"linkage","blockKey":"baf_linkage","blockVersion":1,"config":{"in_scope_only":true,"limit":5},"placement":"report","pageBreakBefore":true},
    {"id":"decisions","blockKey":"decisions_required","blockVersion":1,"config":{},"placement":"report"},
    {"id":"actions","blockKey":"actions_log","blockVersion":1,"config":{},"placement":"report"},
    {"id":"dd-heading","blockKey":"section_heading","blockVersion":1,"config":{"title":"Project deep-dives"},"placement":"report","pageBreakBefore":true},
    {"id":"dd-overview","blockKey":"project_overview","blockVersion":1,"config":{"milestones_limit":6,"raid_limit":5},"placement":"deep_dive"}
   ]'::jsonb)
) as t(name, description, forum_type, scope_type, blocks)
left join lateral (select r.selection_rules as rules from public.report_templates r
                   where r.is_system and r.name = 'Portfolio Board / Committee' limit 1) pb on true
where not exists (select 1 from public.report_templates x where x.is_system and x.name = t.name);
