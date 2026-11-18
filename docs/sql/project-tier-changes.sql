-- Project tier changes: PMO / admin only, with a reason. Approved and applied 18/11/2026 (migration
-- 20261118143602_project_tier_changes; production recorded that version). Tests: supabase/tests/project_tier.sql.
--
-- Today a project's tier is a plain column that anyone with manager in the workspace can change
-- through the shared write helper (projects_update policy). After this migration:
--
--   1. A plain client update (current_user = 'authenticated') that changes projects.tier is
--      refused by a BEFORE UPDATE trigger, whatever the caller's role, with hint
--      'tier_via_rpc'. Same pattern as the business case status guard (AGENTS.md): no session
--      setting or GUC can bypass it. SECURITY DEFINER functions (current_user = owner), cron and
--      the service role are not affected. Inserts are not affected: whoever may create a project
--      (manager and above) still picks its starting tier.
--   2. public.change_project_tier(project, tier, reason, last_seen) is the only way for a person
--      to change it. Explicit check: PMO or above in the project's workspace
--      (private.has_workspace_role(ws, 'pmo')), which is workspace PMO / admin, organisation PMO
--      and organisation admins (workspace_role lifts org PMO+ into every workspace) and nobody
--      in an archived workspace (workspace_role caps at viewer there). Refuses archived
--      projects, an unchanged tier and a reason shorter than 3 or longer than 500 characters.
--      last_seen keeps optimistic concurrency: a newer updated_at raises 40001 (the client's
--      "conflict" kind, as other RPCs' stale checks). The GL-4 read-only trigger on projects
--      still refuses the update for a read-only organisation.
--   3. The reason goes into the audit log: the existing projects_audit trigger writes the usual
--      row ({"tier": {"from", "to"}}) when the RPC updates the project, and the RPC then adds
--      "reason" and "event": "project.tier_changed" to that row's detail (found by table,
--      entity, actor and created_at = now(), i.e. this transaction). No new table, no change
--      to audit_log's columns or check constraint.
--   4. public.project_tier_history(project) shows the changes in the project's history. The
--      audit log is readable only by PMO, so this SECURITY DEFINER read returns just the tier
--      changes of one project to anyone who can see the project (workspace member), with the
--      actor's display name ("Former member" after closure, via the tombstone profile). Older
--      tier changes made before this migration appear without a reason. History follows the
--      audit log's retention (Settings › Data, default 84 months).
--
-- Both new functions: SECURITY DEFINER, search_path '', execute revoked from public and anon,
-- granted to authenticated; cross_tenant.sql gets a case for each (B's admin with A's project:
-- change refused, history empty).

-- 1. Guard ---------------------------------------------------------------------------------
create function private.projects_tier_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and new.tier is distinct from old.tier then
    raise exception 'Change the tier with "Change tier", which asks for a reason. Only the PMO and admins can change it.'
      using errcode = '42501', hint = 'tier_via_rpc';
  end if;
  return new;
end;
$$;
revoke all on function private.projects_tier_guard() from public, anon, authenticated;

create trigger projects_tier_guard
  before update of tier on public.projects
  for each row execute function private.projects_tier_guard();

-- 2. Change ---------------------------------------------------------------------------------
create function public.change_project_tier(
  p_project uuid,
  p_tier public.project_tier,
  p_reason text,
  p_last_seen timestamptz default null
)
returns timestamptz   -- the project's new updated_at, for the client's next write
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.projects%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_updated timestamptz;
  v_rows integer;
begin
  select * into p from public.projects where id = p_project;
  if not found or not private.is_workspace_member(p.workspace_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;
  if not private.has_workspace_role(p.workspace_id, 'pmo') then
    raise exception 'Only the PMO and admins can change a project''s tier.' using errcode = '42501';
  end if;
  if p.archived_at is not null then
    raise exception 'This project is archived, so its tier can''t be changed.' using errcode = '22023';
  end if;
  if p_tier is null or p_tier = p.tier then
    raise exception 'Choose a different tier.' using errcode = '22023';
  end if;
  if char_length(v_reason) < 3 then
    raise exception 'Give a short reason for the tier change.' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.' using errcode = '22023';
  end if;
  if p_last_seen is not null and p.updated_at is distinct from p_last_seen then
    raise exception 'Someone else changed this project after you opened it. Reload and try again.'
      using errcode = '40001';
  end if;

  update public.projects set tier = p_tier where id = p_project
  returning updated_at into v_updated;

  -- The projects_audit trigger (AFTER ROW) has written this change's row by now.
  update public.audit_log
     set detail = detail || jsonb_build_object('reason', v_reason, 'event', 'project.tier_changed')
   where entity_table = 'projects' and entity_id = p_project
     and actor_id = (select auth.uid()) and created_at = now() and detail ? 'tier';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then   -- defensive: never lose the reason
    insert into public.audit_log (organisation_id, workspace_id, actor_id, action, entity_table, entity_id, detail)
    values (p.organisation_id, p.workspace_id, (select auth.uid()), 'update', 'projects', p_project,
            jsonb_build_object('tier', jsonb_build_object('from', p.tier, 'to', p_tier),
                               'reason', v_reason, 'event', 'project.tier_changed'));
  end if;
  return v_updated;
end;
$$;
revoke all on function public.change_project_tier(uuid, public.project_tier, text, timestamptz) from public, anon;
grant execute on function public.change_project_tier(uuid, public.project_tier, text, timestamptz) to authenticated;

-- 3. History --------------------------------------------------------------------------------
create function public.project_tier_history(p_project uuid)
returns table (
  changed_at timestamptz,
  from_tier public.project_tier,
  to_tier public.project_tier,
  reason text,
  changed_by text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.created_at,
         (a.detail -> 'tier' ->> 'from')::public.project_tier,
         (a.detail -> 'tier' ->> 'to')::public.project_tier,
         nullif(a.detail ->> 'reason', ''),
         pr.display_name
  from public.projects p
  join public.audit_log a
    on a.entity_table = 'projects' and a.entity_id = p.id and a.action = 'update'
   and a.detail ? 'tier'
  left join public.profiles pr on pr.id = a.actor_id
  where p.id = p_project
    and private.is_workspace_member(p.workspace_id)
  order by a.created_at desc;
$$;
revoke all on function public.project_tier_history(uuid) from public, anon;
grant execute on function public.project_tier_history(uuid) to authenticated;
