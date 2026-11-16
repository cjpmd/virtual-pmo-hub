-- GL-10 follow-up: fixes for the six partner-sharing findings (cross_tenant.sql section 5,
-- docs/go-live-plan.md). Proposal: docs/sql/gl-10-partner-sharing-fixes.sql. NOT APPLIED: for review.
-- Additive only: ALTER POLICY changes five USING expressions in place (no drop), plus one new
-- function and one new trigger. No drop, delete or truncate.
--
-- RB-15 / RB-30: partners read the shared published pack (the report row) and its partner-visible
-- snapshots, and nothing else. private.is_partner_viewer(report) is true when the report's
-- organisation isn't one of the reader's (the rule report_metric_snapshots already uses).
--
-- F1 report_narratives, F2 report_inclusions, F3 report_events, F4 report_notifications: the
--    report's own organisation only. Partners still see the narrative text of visible blocks,
--    because it is inside those blocks' snapshot data.
-- F5 Storage report-pdfs: the report's own organisation only. The PDF is rendered from every
--    snapshot, partner-hidden blocks included, so partners don't get it.
-- F6 A report's scope must belong to its own organisation: a trigger on reports refuses a scope
--    entity, or a custom scope item, from another organisation. That covers create_report, direct
--    updates of scope_items (authenticated may update that column on reports it can edit) and the
--    scheduled packs. A partner can therefore no longer put a shared project into its own pack,
--    and publish_report (SECURITY DEFINER) can't compute another organisation's live data.
--    Sharing itself is unchanged: can_view_entity still lets partners view what is shared.

-- =====================================================================================
-- F1 to F4: the report's own organisation only
-- =====================================================================================
alter policy report_narratives_select on public.report_narratives
  using ((select private.can_view_report(report_id)) and not (select private.is_partner_viewer(report_id)));
alter policy report_inclusions_select on public.report_inclusions
  using ((select private.can_view_report(report_id)) and not (select private.is_partner_viewer(report_id)));
alter policy report_events_select on public.report_events
  using ((select private.can_view_report(report_id)) and not (select private.is_partner_viewer(report_id)));
alter policy report_notifications_select on public.report_notifications
  using ((select private.can_view_report(report_id)) and not (select private.is_partner_viewer(report_id)));

-- =====================================================================================
-- F5: report PDFs, the report's own organisation only
-- =====================================================================================
alter policy report_pdfs_select on storage.objects
  using (bucket_id = 'report-pdfs'
         and private.can_view_report(private.try_uuid(replace(storage.filename(name), '.pdf', '')))
         and not private.is_partner_viewer(private.try_uuid(replace(storage.filename(name), '.pdf', ''))));

-- =====================================================================================
-- F6: a report's scope belongs to its own organisation
-- =====================================================================================
create function private.report_scope_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scope_entity_id is not null and not exists (
      select 1 from public.projects x where new.scope_type = 'project' and x.id = new.scope_entity_id and x.organisation_id = new.organisation_id
      union all
      select 1 from public.programmes x where new.scope_type = 'programme' and x.id = new.scope_entity_id and x.organisation_id = new.organisation_id
      union all
      select 1 from public.portfolios x where new.scope_type = 'portfolio' and x.id = new.scope_entity_id and x.organisation_id = new.organisation_id
      union all
      select 1 from public.collections x where new.scope_type = 'collection' and x.id = new.scope_entity_id and x.organisation_id = new.organisation_id) then
    raise exception 'A report can only cover its own organisation''s projects and programmes.' using errcode = '42501', hint = 'scope_other_organisation';
  end if;
  if exists (
      select 1 from jsonb_array_elements(coalesce(new.scope_items, '[]'::jsonb)) i
      where not exists (
        select 1 from public.projects x
        where i ->> 'entity_type' = 'project' and x.id = private.try_uuid(i ->> 'entity_id') and x.organisation_id = new.organisation_id
        union all
        select 1 from public.programmes x
        where i ->> 'entity_type' = 'programme' and x.id = private.try_uuid(i ->> 'entity_id') and x.organisation_id = new.organisation_id)) then
    raise exception 'A report can only cover its own organisation''s projects and programmes.' using errcode = '42501', hint = 'scope_other_organisation';
  end if;
  return new;
end;
$$;
revoke execute on function private.report_scope_same_org() from public, anon, authenticated;

create trigger reports_06_scope_same_org
  before insert or update of organisation_id, scope_type, scope_entity_id, scope_items on public.reports
  for each row execute function private.report_scope_same_org();
