-- NHS-7 (part 2): the ICS / system programme board pack. Module `cross_org`.
-- Proposal: docs/sql/nhs-7b-ics-template.sql. NOT APPLIED: for review. Additive only.
--
-- 1. Report block `partner_contributions` (private.rb_partner_contributions): for a programme-scoped
--    report, each organisation's part of the programme (host and partners): projects, stored RAG
--    mix and the partners' contributed projects. The data comes from
--    public.shared_programme_overview, which checks the caller can see the programme (a host
--    member, or a partner it is shared with) and that the host has the module on. A new block is
--    a new rb_<key> function; the dispatcher (private.report_block_resolve) is unchanged.
--    Partner-safe: partners already see the same roll-up, so private.partner_unsafe_blocks is
--    unchanged.
-- 2. System template "ICS system programme board" (one global row, like "Funding committee"):
--    programme scope, with the contributions block. The app hides it while the module is off
--    (templates containing a module-owned block, NHS-1's filter in lane A).

create function private.rb_partner_contributions(ctx jsonb, cfg jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_overview jsonb;
  v_all jsonb;
begin
  if coalesce(ctx ->> 'scope_type', '') <> 'programme' or ctx ->> 'scope_entity_id' is null then
    return jsonb_build_object('programme_scope_only', true, 'organisations', '[]'::jsonb, 'projects', '[]'::jsonb);
  end if;
  v_overview := public.shared_programme_overview((ctx ->> 'scope_entity_id')::uuid);
  if v_overview is null then
    return jsonb_build_object('unavailable', true, 'organisations', '[]'::jsonb, 'projects', '[]'::jsonb);
  end if;
  v_all := coalesce(v_overview -> 'projects', '[]'::jsonb) || coalesce(v_overview -> 'contributed_projects', '[]'::jsonb);
  return jsonb_build_object(
    'programme', v_overview -> 'programme' ->> 'name',
    'host', v_overview -> 'programme' ->> 'organisation',
    'organisations', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', o ->> 'id', 'name', o ->> 'name', 'role', o ->> 'role',
          'projects', (select count(*) from jsonb_array_elements(v_all) p where p ->> 'organisation_id' = o ->> 'id'),
          'green', (select count(*) from jsonb_array_elements(v_all) p where p ->> 'organisation_id' = o ->> 'id' and p ->> 'overall' = 'green'),
          'amber', (select count(*) from jsonb_array_elements(v_all) p where p ->> 'organisation_id' = o ->> 'id' and p ->> 'overall' = 'amber'),
          'red', (select count(*) from jsonb_array_elements(v_all) p where p ->> 'organisation_id' = o ->> 'id' and p ->> 'overall' = 'red'),
          'open_risks', (select coalesce(sum((p ->> 'open_risks')::integer), 0) from jsonb_array_elements(v_all) p
                         where p ->> 'organisation_id' = o ->> 'id'),
          'milestones_overdue', (select coalesce(sum((p ->> 'milestones_overdue')::integer), 0) from jsonb_array_elements(v_all) p
                                 where p ->> 'organisation_id' = o ->> 'id'))
        order by o ->> 'role', o ->> 'name')
      from jsonb_array_elements(coalesce(v_overview -> 'organisations', '[]'::jsonb)) o), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p ->> 'id', 'code', p ->> 'code', 'name', p ->> 'name',
          'organisation', p ->> 'organisation', 'overall', p ->> 'overall', 'state', p ->> 'state',
          'next_milestone', p -> 'next_milestone', 'open_risks', (p ->> 'open_risks')::integer)
        order by p ->> 'organisation', p ->> 'code')
      from jsonb_array_elements(coalesce(v_overview -> 'contributed_projects', '[]'::jsonb)) p), '[]'::jsonb),
    'benefits', v_overview -> 'benefits');
end;
$$;
revoke execute on function private.rb_partner_contributions(jsonb, jsonb) from public, anon;
grant execute on function private.rb_partner_contributions(jsonb, jsonb) to authenticated, service_role;

insert into public.report_templates (organisation_id, name, description, forum_type, scope_type, is_system, blocks, selection_rules)
select null, 'ICS system programme board',
  'System-level programme board pack for a programme shared with partner organisations: the programme at a glance, each organisation''s contribution, exceptions, milestones, risks, benefits and decisions.',
  'programme_board', 'programme', true, '[
  {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
  {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"partners","blockKey":"partner_contributions","blockVersion":1,"config":{},"placement":"report"},
  {"id":"dist","blockKey":"rating_distribution","blockVersion":1,"config":{},"placement":"report"},
  {"id":"grid","blockKey":"project_status_grid","blockVersion":1,"config":{"only_exceptions":true},"placement":"report","pageBreakBefore":true},
  {"id":"milestones","blockKey":"milestone_timeline","blockVersion":1,"config":{},"placement":"report","pageBreakBefore":true},
  {"id":"raid","blockKey":"top_raid","blockVersion":1,"config":{},"placement":"report"},
  {"id":"benefits","blockKey":"benefits_value","blockVersion":1,"config":{},"placement":"report","pageBreakBefore":true},
  {"id":"decisions","blockKey":"decisions_required","blockVersion":1,"config":{},"placement":"report"}
 ]'::jsonb,
  -- Deep-dive selection as the system Programme Board (exceptions only).
  coalesce((select t.selection_rules from public.report_templates t where t.is_system and t.name = 'Programme Board' limit 1),
    '{"mode":"any","orderBy":"severity","rules":[]}'::jsonb)
where not exists (select 1 from public.report_templates where is_system and name = 'ICS system programme board');
