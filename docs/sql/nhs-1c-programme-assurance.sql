-- NHS-1 part 3: programme assurance ratings and the "assurance by programme" report block
-- (docs/nhs-module-plan.md § NHS-1 items 2 and 4, docs/sql/nhs-1c-programme-assurance.sql).
-- Written by an unattended run on 22/11/2026: tested on the local Postgres only, NOT applied to
-- production. Apply after 20261122190000_nhs_1b_assurance_blocks. Nothing here is destructive:
-- one new table, one view, two block functions, one function replaced
-- (private.partner_unsafe_blocks, its list extended) and two system templates gain one block
-- (only where they don't already hold it).
--
-- Design
-- - programme_assurance_ratings keeps every rating given to a programme (history, newest wins).
--   Programmes are workspace records, so the table follows the workspace tenant rules
--   (organisation_id and workspace_id filled from the programme by private.tenant_guard).
-- - Each rating is stamped with the organisation's assurance rating scheme
--   (private.assurance_rating_scheme: settings.assurance.ratingSchemeKey, else the organisation's
--   own assurance scheme, else the system 'nhs_assurance') and must be one of its levels. A later
--   change of scheme never relabels an earlier rating.
-- - Reads: workspace members, whether the module is on or off. Insert and delete (to correct a
--   mistake): workspace PMO and admins while the 'assurance' module is on. No update: a new
--   judgement is a new row, so the history stays honest.
-- - Archived programmes, and archived workspaces (private.my_workspace_ids('pmo') leaves them out),
--   can't be rated.
-- - v_programme_assurance (security invoker): the latest rating per programme with the previous
--   one and the direction of travel (by the scheme's rank: lower rank is better).
-- - The block rb_assurance_by_programme lists the programmes in the report's scope with the
--   rating in force on the report's as-at date. It is partner-unsafe (assurance judgements are
--   internal), like the BAF blocks.

-- ---------------------------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------------------------

create table public.programme_assurance_ratings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  programme_id uuid not null,
  rating_scheme_id uuid references public.rating_schemes (id) on delete restrict,
  rating text not null check (rating ~ '^[a-z0-9_]{1,40}$'),
  rationale text check (rationale is null or length(rationale) <= 4000),
  forum_id uuid,
  rated_on date not null default current_date,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (programme_id, workspace_id) references public.programmes (id, workspace_id) on delete cascade,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (forum_id, organisation_id) references public.forums (id, organisation_id)
    on delete set null (forum_id)
);
create index programme_assurance_ratings_programme_idx
  on public.programme_assurance_ratings (programme_id, rated_on desc, created_at desc);
create index programme_assurance_ratings_ws_idx on public.programme_assurance_ratings (workspace_id, organisation_id);
create index programme_assurance_ratings_org_idx on public.programme_assurance_ratings (organisation_id);
create index programme_assurance_ratings_scheme_idx on public.programme_assurance_ratings (rating_scheme_id);
create index programme_assurance_ratings_forum_idx on public.programme_assurance_ratings (forum_id, organisation_id);
create index programme_assurance_ratings_created_by_idx on public.programme_assurance_ratings (created_by);

comment on table public.programme_assurance_ratings is
  'NHS-1: assurance ratings given to a programme (history; the newest by rated_on wins).';

-- Stamps the scheme, checks it is an assurance scheme of the organisation (or the system), the
-- rating is one of its levels, the programme isn't archived and the date isn't in the future.
create function private.programme_assurance_ratings_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scheme public.rating_schemes;
begin
  if new.rating_scheme_id is null then
    new.rating_scheme_id := (private.assurance_rating_scheme(new.organisation_id) ->> 'id')::uuid;
  end if;
  select * into v_scheme from public.rating_schemes s where s.id = new.rating_scheme_id;
  if v_scheme.id is null or not v_scheme.is_assurance
     or (v_scheme.organisation_id is not null and v_scheme.organisation_id <> new.organisation_id) then
    raise exception 'Choose one of the organisation''s assurance rating schemes.' using errcode = '23514';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_scheme.levels) l where l ->> 'key' = new.rating) then
    raise exception 'That rating isn''t one of the levels of %.', v_scheme.name using errcode = '23514';
  end if;
  if new.rated_on > current_date then
    raise exception 'A rating can''t be dated in the future.' using errcode = '23514';
  end if;
  if exists (select 1 from public.programmes p where p.id = new.programme_id and p.archived_at is not null) then
    raise exception 'This programme is archived, so it can''t be rated.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function private.programme_assurance_ratings_check() from public, anon, authenticated;

create trigger programme_assurance_ratings_00_tenant_guard before insert on public.programme_assurance_ratings
  for each row execute function private.tenant_guard('programme_id', 'programmes');
create trigger programme_assurance_ratings_05_check before insert on public.programme_assurance_ratings
  for each row execute function private.programme_assurance_ratings_check();
create trigger programme_assurance_ratings_audit after insert or delete on public.programme_assurance_ratings
  for each row execute function private.audit_row_change();
create trigger zz_org_read_only before insert or update or delete on public.programme_assurance_ratings
  for each row execute function private.enforce_org_writable();

alter table public.programme_assurance_ratings enable row level security;
revoke all on public.programme_assurance_ratings from anon, authenticated;
grant select, insert, delete on public.programme_assurance_ratings to authenticated;
create policy programme_assurance_ratings_select on public.programme_assurance_ratings for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy programme_assurance_ratings_insert on public.programme_assurance_ratings for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[])
              and private.module_enabled(organisation_id, 'assurance'));
create policy programme_assurance_ratings_delete on public.programme_assurance_ratings for delete to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('pmo'))::uuid[])
         and private.module_enabled(organisation_id, 'assurance'));

-- ---------------------------------------------------------------------------------------------
-- 2. Latest rating per programme
-- ---------------------------------------------------------------------------------------------

create view public.v_programme_assurance with (security_invoker = true) as
with ranked as (
  select r.*, lvl.value ->> 'label' as label, lvl.value ->> 'colour' as colour,
    nullif(lvl.value ->> 'rank', '')::integer as rank,
    row_number() over (partition by r.programme_id order by r.rated_on desc, r.created_at desc) as n
  from public.programme_assurance_ratings r
  join public.rating_schemes s on s.id = r.rating_scheme_id
  left join lateral (select l.value from jsonb_array_elements(s.levels) l where l.value ->> 'key' = r.rating) lvl on true
)
select c.programme_id, c.organisation_id, c.workspace_id, c.id as rating_id, c.rating_scheme_id,
  c.rating, c.label, c.colour, c.rank, c.rationale, c.forum_id, f.name as forum_name,
  c.rated_on, c.created_by, pr.display_name as rated_by_name, c.is_sample,
  p.rating as previous_rating, p.label as previous_label, p.rated_on as previous_rated_on,
  case when p.id is null then 'new'
       when c.rank is null or p.rank is null then 'same'
       when c.rank < p.rank then 'better'
       when c.rank > p.rank then 'worse'
       else 'same' end as direction,
  (select count(*) from ranked x where x.programme_id = c.programme_id)::integer as rating_count
from ranked c
left join ranked p on p.programme_id = c.programme_id and p.n = 2
left join public.forums f on f.id = c.forum_id
left join public.profiles pr on pr.id = c.created_by
where c.n = 1;

revoke all on public.v_programme_assurance from anon, authenticated;
grant select on public.v_programme_assurance to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Report block: assurance by programme
-- ---------------------------------------------------------------------------------------------

-- Programmes in the report's scope: the scoped programme; a portfolio's programmes; otherwise the
-- programmes of the projects in scope. Only programmes of the report's organisation, and not
-- archived on the as-at date.
create function private.rb_scope_programmes(ctx jsonb)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct p.id), '{}')
  from public.programmes p
  where p.organisation_id = nullif(ctx ->> 'organisation_id', '')::uuid
    and (p.archived_at is null or p.archived_at::date > (ctx ->> 'as_at')::date)
    and (
      (ctx ->> 'scope_type' = 'programme' and p.id = nullif(ctx ->> 'scope_entity_id', '')::uuid)
      or (ctx ->> 'scope_type' = 'portfolio' and p.portfolio_id = nullif(ctx ->> 'scope_entity_id', '')::uuid)
      or p.id in (select j.programme_id from public.projects j where j.id = any (private.rb_projects(ctx))));
$$;

-- assurance_by_programme: each programme in scope with the rating in force on the as-at date, the
-- one before it and the direction of travel, plus counts by level. Config: show_rationale
-- (default true), include_unrated (default true).
create function private.rb_assurance_by_programme(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with scheme as (select private.assurance_rating_scheme(nullif(ctx ->> 'organisation_id', '')::uuid) as s),
  progs as (
    select p.id, p.name, p.is_sample, pf.name as portfolio_name
    from public.programmes p
    left join public.portfolios pf on pf.id = p.portfolio_id
    where p.id = any (private.rb_scope_programmes(ctx))
  ),
  ranked as (
    select r.programme_id, r.rating, r.rationale, r.rated_on, f.name as forum_name,
      lvl.value ->> 'label' as label, lvl.value ->> 'colour' as colour,
      nullif(lvl.value ->> 'rank', '')::integer as rank,
      row_number() over (partition by r.programme_id order by r.rated_on desc, r.created_at desc) as n
    from public.programme_assurance_ratings r
    join public.rating_schemes s on s.id = r.rating_scheme_id
    left join lateral (select l.value from jsonb_array_elements(s.levels) l where l.value ->> 'key' = r.rating) lvl on true
    left join public.forums f on f.id = r.forum_id
    where r.programme_id in (select id from progs)
      and r.organisation_id = nullif(ctx ->> 'organisation_id', '')::uuid
      and r.rated_on <= (ctx ->> 'as_at')::date
  ),
  rows as (
    select g.id, g.name, g.portfolio_name, g.is_sample,
      c.rating, c.label, c.colour, c.rank, c.rated_on, c.forum_name, c.rationale,
      p.label as previous_label,
      case when c.rating is null then null
           when p.rating is null then 'new'
           when c.rank is null or p.rank is null then 'same'
           when c.rank < p.rank then 'better'
           when c.rank > p.rank then 'worse'
           else 'same' end as direction
    from progs g
    left join ranked c on c.programme_id = g.id and c.n = 1
    left join ranked p on p.programme_id = g.id and p.n = 2
  )
  select jsonb_build_object(
    'scheme', jsonb_build_object('name', scheme.s ->> 'name', 'levels', coalesce(scheme.s -> 'levels', '[]')),
    'total', (select count(*) from rows),
    'rated', (select count(*) from rows where rating is not null),
    'worse', (select count(*) from rows where direction = 'worse'),
    'counts', coalesce((select jsonb_object_agg(k, n) from (
        select coalesce(rating, 'unrated') as k, count(*) as n from rows group by 1) x), '{}'),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'portfolio', x.portfolio_name,
        'rating', x.rating, 'label', x.label, 'colour', x.colour, 'rank', x.rank, 'rated_on', x.rated_on,
        'forum', x.forum_name, 'previous', x.previous_label, 'direction', x.direction,
        'rationale', case when coalesce((cfg ->> 'show_rationale')::boolean, true) then left(x.rationale, 600) end,
        'is_sample', x.is_sample)
      order by x.rank desc nulls last, x.name)
      from rows x where x.rating is not null or coalesce((cfg ->> 'include_unrated')::boolean, true)), '[]'))
  from scheme;
$$;

revoke all on function private.rb_scope_programmes(jsonb), private.rb_assurance_by_programme(jsonb, jsonb)
  from public, anon;
grant execute on function private.rb_scope_programmes(jsonb), private.rb_assurance_by_programme(jsonb, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Partner safety: programme assurance ratings never reach partner organisations.
-- ---------------------------------------------------------------------------------------------

create or replace function private.partner_unsafe_blocks()
returns text[]
language sql
immutable
set search_path = ''
as $$ select array['resource_summary', 'data_quality', 'baf_summary', 'baf_above_appetite', 'baf_linkage',
                   'assurance_by_programme']; $$;

-- ---------------------------------------------------------------------------------------------
-- 5. Committee templates: Trust Board (after the rating distribution) and Executive Management /
--    PMO Board (after the status grid) gain the block. Only system rows that don't hold it yet;
--    reports already made from them keep their own blocks.
-- ---------------------------------------------------------------------------------------------

update public.report_templates t
set blocks = (
  select jsonb_agg(e.value order by e.ordinality, e.sub)
  from (
    select b.value, b.ordinality, 0 as sub from jsonb_array_elements(t.blocks) with ordinality b
    union all
    select jsonb_build_object('id', 'prog-assurance', 'blockKey', 'assurance_by_programme', 'blockVersion', 1,
             'config', jsonb_build_object('show_rationale', true, 'include_unrated', true), 'placement', 'report'),
           b.ordinality, 1
    from jsonb_array_elements(t.blocks) with ordinality b
    where b.value ->> 'id' = case t.name when 'Trust Board' then 'dist' else 'grid' end
  ) e)
where t.is_system and t.organisation_id is null
  and t.name in ('Trust Board', 'Executive Management / PMO Board')
  and not t.blocks @> '[{"blockKey":"assurance_by_programme"}]'::jsonb
  and t.blocks @> jsonb_build_array(jsonb_build_object('id', case t.name when 'Trust Board' then 'dist' else 'grid' end));
