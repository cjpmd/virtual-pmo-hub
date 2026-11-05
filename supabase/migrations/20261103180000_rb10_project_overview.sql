-- RB-10: project_overview deep-dive block
-- SQL function + system template updates only. Existing reports and org templates are untouched.
-- Apply as a new migration (timestamp after 20261103170000).

-- ===================================================================== 1. SQL block function
-- Composes the six existing rb_ functions into one per-project payload so the
-- project_overview block can render a full project panel from a single data call.
-- ctx and cfg have the same shape as every other rb_ dispatcher target (§RB-10).
-- cfg keys forwarded to sub-functions:
--   milestones_limit  int  default 6  (passed to rb_milestone_slippage)
--   raid_limit        int  default 5  (passed to rb_top_raid)
create function private.rb_project_overview(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'summary',    private.rb_project_summary(ctx, cfg),
    'health',     private.rb_overall_status(ctx, cfg),
    'history',    private.rb_health_by_dimension(ctx, cfg),
    'milestones', private.rb_milestone_slippage(
                    ctx,
                    jsonb_build_object('limit', coalesce((cfg->>'milestones_limit')::int, 6))
                  ),
    'raid',       private.rb_top_raid(
                    ctx,
                    jsonb_build_object('limit', coalesce((cfg->>'raid_limit')::int, 5))
                  ),
    'highlight',  private.rb_highlight_report_summary(ctx, cfg)
  )
$$;

revoke all on function private.rb_project_overview(jsonb, jsonb) from public, anon;
grant execute on function private.rb_project_overview(jsonb, jsonb) to authenticated, service_role;

-- ================================================================= 2. System template updates
-- Replace the 6 separate deep-dive blocks in Programme Board with one project_overview block.
-- Only the blocks column changes; selection_rules, name, description and all other columns
-- are untouched. is_system = true guards against touching any organisation-owned template.

update public.report_templates
set blocks = '[
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
  {"id":"dd-overview","blockKey":"project_overview","blockVersion":1,"config":{"milestones_limit":6,"raid_limit":5},"placement":"deep_dive"}
]'::jsonb
where is_system = true
  and name = 'Programme Board';

-- Replace the 5 separate deep-dive blocks in Portfolio Board / Committee with one project_overview block.

update public.report_templates
set blocks = '[
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
  {"id":"dd-overview","blockKey":"project_overview","blockVersion":1,"config":{"milestones_limit":6,"raid_limit":5},"placement":"deep_dive"}
]'::jsonb
where is_system = true
  and name = 'Portfolio Board / Committee';
