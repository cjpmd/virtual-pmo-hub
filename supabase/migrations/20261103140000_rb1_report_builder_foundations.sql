-- Report builder, Phase 1: foundations (docs/report-builder-spec.md §5, §7, §8;
-- mapping in docs/report-builder-mapping.md; decisions RB-n in docs/report-builder-decisions.md).
-- Additive only: new tables, new nullable columns on forums / forum_members / decisions / risks,
-- new functions. No existing column, policy or function changes behaviour.

-- ============================================================================ 1. Config
-- Rating schemes (RAG, NHS assurance …) and risk matrices. Organisation-scoped config; a null
-- organisation_id is a system row every organisation reads (RB-14).
create table public.rating_schemes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(btrim(name)) > 0),
  -- [{key,label,colour,rank,rag}] rank 1 = best; rag = the evidenced RAG value this level shows
  -- (green / amber / red / not_set), so computed RAG maps to the scheme without code (§8).
  levels jsonb not null check (jsonb_typeof(levels) = 'array' and jsonb_array_length(levels) between 2 and 8),
  is_assurance boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique nulls not distinct (organisation_id, key)
);
create index rating_schemes_created_by_idx on public.rating_schemes (created_by);
create trigger rating_schemes_updated_at before update on public.rating_schemes
  for each row execute function private.set_updated_at();

create table public.risk_matrices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(btrim(name)) > 0),
  likelihood_levels jsonb not null check (jsonb_typeof(likelihood_levels) = 'array'),
  consequence_levels jsonb not null check (jsonb_typeof(consequence_levels) = 'array'),
  score_method text not null default 'product' check (score_method in ('product', 'lookup')),
  score_lookup jsonb check (score_lookup is null or jsonb_typeof(score_lookup) = 'array'),
  -- [{min,max,key,label,colour}] in ascending order; the last band is the top band.
  bands jsonb not null check (jsonb_typeof(bands) = 'array' and jsonb_array_length(bands) >= 1),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique nulls not distinct (organisation_id, key),
  check (score_method = 'product' or score_lookup is not null)
);
create unique index risk_matrices_one_default on public.risk_matrices (coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid)) where is_default;
create index risk_matrices_created_by_idx on public.risk_matrices (created_by);
create trigger risk_matrices_updated_at before update on public.risk_matrices
  for each row execute function private.set_updated_at();

alter table public.rating_schemes enable row level security;
alter table public.risk_matrices enable row level security;
revoke all on public.rating_schemes, public.risk_matrices from anon, authenticated;
grant select, insert, update, delete on public.rating_schemes, public.risk_matrices to authenticated;
create policy rating_schemes_select on public.rating_schemes for select to authenticated
  using (organisation_id is null or organisation_id = any ((select private.my_org_ids())::uuid[]));
create policy rating_schemes_write on public.rating_schemes for all to authenticated
  using (organisation_id = any ((select private.my_org_ids('admin'))::uuid[]))
  with check (organisation_id = any ((select private.my_org_ids('admin'))::uuid[]));
create policy risk_matrices_select on public.risk_matrices for select to authenticated
  using (organisation_id is null or organisation_id = any ((select private.my_org_ids())::uuid[]));
create policy risk_matrices_write on public.risk_matrices for all to authenticated
  using (organisation_id = any ((select private.my_org_ids('admin'))::uuid[]))
  with check (organisation_id = any ((select private.my_org_ids('admin'))::uuid[]));

insert into public.rating_schemes (organisation_id, key, name, levels, is_assurance) values
  (null, 'rag', 'RAG', '[
    {"key":"green","label":"Green","colour":"#2e7d52","rank":1,"rag":"green"},
    {"key":"amber","label":"Amber","colour":"#b7791f","rank":2,"rag":"amber"},
    {"key":"red","label":"Red","colour":"#b3261e","rank":3,"rag":"red"},
    {"key":"grey","label":"Not reported","colour":"#6b7280","rank":4,"rag":"not_set"}]', false);

-- System default = the app's current settings (5×5, Low ≥1, Elevated ≥8, Critical ≥15), and
-- the NHS 5×5 (bands 1–3 low, 4–6 moderate, 8–12 high, 15–25 extreme).
insert into public.risk_matrices (organisation_id, key, name, likelihood_levels, consequence_levels, bands, is_default) values
  (null, 'default', 'Standard 5×5',
   '[{"value":1,"label":"Rare"},{"value":2,"label":"Unlikely"},{"value":3,"label":"Possible"},{"value":4,"label":"Likely"},{"value":5,"label":"Almost certain"}]',
   '[{"value":1,"label":"Negligible"},{"value":2,"label":"Minor"},{"value":3,"label":"Moderate"},{"value":4,"label":"Major"},{"value":5,"label":"Severe"}]',
   '[{"min":1,"max":7,"key":"low","label":"Low","colour":"#2e7d52"},
     {"min":8,"max":14,"key":"elevated","label":"Elevated","colour":"#b7791f"},
     {"min":15,"max":25,"key":"critical","label":"Critical","colour":"#b3261e"}]', true),
  (null, 'nhs_5x5', 'NHS 5×5',
   '[{"value":1,"label":"Rare"},{"value":2,"label":"Unlikely"},{"value":3,"label":"Possible"},{"value":4,"label":"Likely"},{"value":5,"label":"Almost certain"}]',
   '[{"value":1,"label":"Negligible"},{"value":2,"label":"Minor"},{"value":3,"label":"Moderate"},{"value":4,"label":"Major"},{"value":5,"label":"Catastrophic"}]',
   '[{"min":1,"max":3,"key":"low","label":"Low","colour":"#2e7d52"},
     {"min":4,"max":6,"key":"moderate","label":"Moderate","colour":"#ca8a04"},
     {"min":8,"max":12,"key":"high","label":"High","colour":"#c2410c"},
     {"min":15,"max":25,"key":"extreme","label":"Extreme","colour":"#b3261e"}]', false);

alter table public.risks add column risk_matrix_id uuid references public.risk_matrices (id) on delete set null;
create index risks_risk_matrix_idx on public.risks (risk_matrix_id);

-- The matrix used for an organisation: its own default, else the system default.
create function private.org_risk_matrix(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(m) from public.risk_matrices m
  where m.is_default and (m.organisation_id = p_org or m.organisation_id is null)
  order by m.organisation_id nulls last
  limit 1;
$$;

create function private.matrix_score(p_matrix jsonb, p_likelihood integer, p_consequence integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_likelihood is null or p_consequence is null then null
    when p_matrix ->> 'score_method' = 'lookup'
      then ((p_matrix -> 'score_lookup' -> (p_likelihood - 1)) ->> (p_consequence - 1))::integer
    else p_likelihood * p_consequence end;
$$;

-- The band holding a score: the highest band whose min the score reaches.
create function private.matrix_band(p_matrix jsonb, p_score integer)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select b.value || jsonb_build_object('rank', b.ordinality, 'top', b.ordinality = jsonb_array_length(p_matrix -> 'bands'))
  from jsonb_array_elements(p_matrix -> 'bands') with ordinality b
  where p_score is not null and p_score >= (b.value ->> 'min')::integer
  order by (b.value ->> 'min')::integer desc
  limit 1;
$$;

-- Score and band of a risk by its matrix (or the organisation's default). Security invoker: the
-- caller must be able to read the risk.
create function public.risk_score(p_risk_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select private.matrix_score(coalesce((select to_jsonb(m) from public.risk_matrices m where m.id = r.risk_matrix_id),
      private.org_risk_matrix(r.organisation_id)), r.probability, r.impact)
  from public.risks r where r.id = p_risk_id;
$$;

create function public.risk_band(p_risk_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with m as (
    select r.probability, r.impact, coalesce((select to_jsonb(x) from public.risk_matrices x where x.id = r.risk_matrix_id),
      private.org_risk_matrix(r.organisation_id)) as matrix
    from public.risks r where r.id = p_risk_id
  )
  select private.matrix_band(m.matrix, private.matrix_score(m.matrix, m.probability, m.impact)) from m;
$$;

-- ========================================================================== 2. Forums
create type public.forum_role as enum ('chair', 'secretary', 'member', 'contributor', 'observer');

alter table public.forums
  add column forum_type text,
  add column description text,
  add column scope_type text check (scope_type in ('project', 'programme', 'portfolio', 'custom')),
  add column scope_entity_id uuid,
  add column rating_scheme_id uuid references public.rating_schemes (id) on delete set null,
  add column tolerances jsonb not null default '{}'::jsonb check (jsonb_typeof(tolerances) = 'object'),
  add column default_template_id uuid,
  add column parent_forum_id uuid,
  add column approval_required boolean not null default true,
  add column archived_at timestamptz,
  add constraint forums_forum_type_check check (forum_type in ('project_board', 'programme_board', 'portfolio_board', 'committee', 'custom')),
  add constraint forums_parent_fkey foreign key (parent_forum_id, organisation_id) references public.forums (id, organisation_id) on delete set null (parent_forum_id),
  add constraint forums_scope_entity_check check ((scope_type in ('project', 'programme', 'portfolio')) = (scope_entity_id is not null) or scope_type is null);
update public.forums set forum_type = case level when 'project' then 'project_board' when 'programme' then 'programme_board'
  when 'portfolio' then 'portfolio_board' else 'committee' end;
create index forums_rating_scheme_idx on public.forums (rating_scheme_id);
create index forums_parent_idx on public.forums (parent_forum_id, organisation_id);
create index forums_default_template_idx on public.forums (default_template_id);

alter table public.forum_members add column role public.forum_role not null default 'member';
grant update (role) on public.forum_members to authenticated;
create policy forum_members_update on public.forum_members for update to authenticated
  using ((select private.can_manage_forum(organisation_id, workspace_id)))
  with check ((select private.can_manage_forum(organisation_id, workspace_id)));

create table public.forum_scope_items (
  organisation_id uuid not null,
  workspace_id uuid,
  forum_id uuid not null,
  entity_type text not null check (entity_type in ('project', 'programme')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (forum_id, entity_type, entity_id),
  foreign key (forum_id, organisation_id) references public.forums (id, organisation_id) on delete cascade,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
create index forum_scope_items_ws_idx on public.forum_scope_items (workspace_id, organisation_id);
create index forum_scope_items_forum_idx on public.forum_scope_items (forum_id, organisation_id);
create trigger forum_scope_items_00_tenant_guard before insert or update on public.forum_scope_items
  for each row execute function private.tenant_guard('forum_id', 'forums');
alter table public.forum_scope_items enable row level security;
revoke all on public.forum_scope_items from anon, authenticated;
grant select, insert, delete on public.forum_scope_items to authenticated;
create policy forum_scope_items_select on public.forum_scope_items for select to authenticated
  using (organisation_id = any ((select private.my_org_ids())::uuid[]));
create policy forum_scope_items_insert on public.forum_scope_items for insert to authenticated
  with check ((select private.can_manage_forum(organisation_id, workspace_id)));
create policy forum_scope_items_delete on public.forum_scope_items for delete to authenticated
  using ((select private.can_manage_forum(organisation_id, workspace_id)));

-- The signed-in user's role on a forum: chair (forums.chair_resource_id or member role), else
-- their member role, else null.
create function private.forum_role_of(p_forum uuid)
returns public.forum_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.forums f join public.resources r on r.id = f.chair_resource_id
                 where f.id = p_forum and r.profile_id = (select auth.uid())) then 'chair'::public.forum_role
    else (select min(fm.role) from public.forum_members fm join public.resources r on r.id = fm.resource_id
          where fm.forum_id = p_forum and r.profile_id = (select auth.uid())) end;
$$;

-- ======================================================================= 3. Templates
create table public.report_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete cascade,
  workspace_id uuid,
  name text not null check (length(btrim(name)) > 0),
  description text,
  forum_type text check (forum_type in ('project_board', 'programme_board', 'portfolio_board', 'committee', 'custom')),
  scope_type text not null default 'any' check (scope_type in ('project', 'programme', 'portfolio', 'custom', 'any')),
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array' and pg_column_size(blocks) <= 131072),
  selection_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(selection_rules) = 'object'),
  rating_scheme_key text,
  version integer not null default 1,
  is_system boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  check (is_system = (organisation_id is null)),
  check (workspace_id is null or organisation_id is not null)
);
create index report_templates_org_idx on public.report_templates (organisation_id);
create index report_templates_ws_idx on public.report_templates (workspace_id, organisation_id);
create index report_templates_created_by_idx on public.report_templates (created_by);
create trigger report_templates_updated_at before update on public.report_templates
  for each row execute function private.set_updated_at();
-- A change to blocks or rules is a new template version (reports record the version they used).
create function private.report_template_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.blocks is distinct from old.blocks or new.selection_rules is distinct from old.selection_rules then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;
create trigger report_templates_10_version before update on public.report_templates
  for each row execute function private.report_template_version();

alter table public.forums add constraint forums_default_template_fkey
  foreign key (default_template_id) references public.report_templates (id) on delete set null;

-- Who writes organisation templates: organisation PMO / admin; a workspace template also its
-- workspace PMO / admin.
create function private.can_manage_template(p_org uuid, p_ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_org is not null and (p_org = any (private.my_org_ids('pmo'))
    or (p_ws is not null and p_ws = any (private.my_workspace_ids('pmo'))));
$$;

alter table public.report_templates enable row level security;
revoke all on public.report_templates from anon, authenticated;
grant select, insert, update on public.report_templates to authenticated;
create policy report_templates_select on public.report_templates for select to authenticated
  using (organisation_id is null or organisation_id = any ((select private.my_org_ids())::uuid[]));
create policy report_templates_insert on public.report_templates for insert to authenticated
  with check (not is_system and (select private.can_manage_template(organisation_id, workspace_id)));
create policy report_templates_update on public.report_templates for update to authenticated
  using (not is_system and (select private.can_manage_template(organisation_id, workspace_id)))
  with check (not is_system and (select private.can_manage_template(organisation_id, workspace_id)));

-- ========================================================================= 4. Reports
create type public.report_status as enum ('draft', 'in_review', 'approved', 'published', 'withdrawn');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id),
  workspace_id uuid,
  title text not null check (length(btrim(title)) > 0),
  template_id uuid references public.report_templates (id) on delete set null,
  template_version integer,
  forum_id uuid,
  meeting_id uuid,
  scope_type text not null check (scope_type in ('project', 'programme', 'portfolio', 'custom')),
  scope_entity_id uuid,
  scope_items jsonb check (scope_items is null or jsonb_typeof(scope_items) = 'array'),
  as_at date not null,
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array' and pg_column_size(blocks) <= 131072),
  selection_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(selection_rules) = 'object'),
  rating_scheme_id uuid references public.rating_schemes (id) on delete set null,
  overall_rating text,
  overall_rating_rationale text,
  status public.report_status not null default 'draft',
  previous_report_id uuid,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (forum_id, organisation_id) references public.forums (id, organisation_id),
  foreign key (meeting_id, organisation_id) references public.meetings (id, organisation_id) on delete set null (meeting_id),
  foreign key (previous_report_id, organisation_id) references public.reports (id, organisation_id) on delete set null (previous_report_id),
  check ((scope_type = 'custom') = (scope_entity_id is null)),
  check (meeting_id is null or forum_id is not null)
);
create index reports_ws_idx on public.reports (workspace_id, organisation_id);
create index reports_forum_idx on public.reports (forum_id, organisation_id);
create index reports_meeting_idx on public.reports (meeting_id, organisation_id);
create index reports_previous_idx on public.reports (previous_report_id, organisation_id);
create index reports_template_idx on public.reports (template_id);
create index reports_scheme_idx on public.reports (rating_scheme_id);
create index reports_created_by_idx on public.reports (created_by);
create index reports_approved_by_idx on public.reports (approved_by);
create index reports_published_by_idx on public.reports (published_by);
create index reports_org_status_idx on public.reports (organisation_id, status, as_at desc);
create trigger reports_updated_at before update on public.reports
  for each row execute function private.set_updated_at();

create table public.report_inclusions (
  organisation_id uuid not null,
  workspace_id uuid,
  report_id uuid not null,
  entity_type text not null default 'project' check (entity_type in ('project', 'programme')),
  entity_id uuid not null,
  mode text not null check (mode in ('rule', 'pinned', 'excluded')),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  severity integer,
  sort_order integer,
  pinned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (report_id, entity_type, entity_id),
  foreign key (report_id, organisation_id) references public.reports (id, organisation_id) on delete cascade,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
create index report_inclusions_report_idx on public.report_inclusions (report_id, organisation_id);
create index report_inclusions_ws_idx on public.report_inclusions (workspace_id, organisation_id);
create index report_inclusions_pinned_by_idx on public.report_inclusions (pinned_by);
create trigger report_inclusions_00_tenant_guard before insert or update on public.report_inclusions
  for each row execute function private.tenant_guard('report_id', 'reports');

create table public.report_narratives (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid,
  report_id uuid not null,
  block_instance_id text not null check (length(block_instance_id) between 1 and 64),
  entity_id uuid,
  body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 65536),
  source text not null default 'human' check (source in ('human', 'ai_draft', 'highlight_report')),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (report_id, organisation_id) references public.reports (id, organisation_id) on delete cascade,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
create unique index report_narratives_one on public.report_narratives
  (report_id, block_instance_id, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index report_narratives_report_idx on public.report_narratives (report_id, organisation_id);
create index report_narratives_ws_idx on public.report_narratives (workspace_id, organisation_id);
create index report_narratives_updated_by_idx on public.report_narratives (updated_by);
create trigger report_narratives_00_tenant_guard before insert or update on public.report_narratives
  for each row execute function private.tenant_guard('report_id', 'reports');
create trigger report_narratives_updated_at before update on public.report_narratives
  for each row execute function private.set_updated_at();
create trigger report_narratives_updated_by before insert or update on public.report_narratives
  for each row execute function private.set_updated_by();

create table public.report_events (
  id bigserial primary key,
  organisation_id uuid not null,
  workspace_id uuid,
  report_id uuid not null,
  event text not null check (event in ('created', 'submitted', 'approved', 'returned', 'published',
    'distributed', 'withdrawn', 'selection_refreshed', 'ai_draft', 'ai_acknowledged', 'template_updated', 'pdf_generated')),
  actor uuid references public.profiles (id) on delete set null,
  payload jsonb,
  created_at timestamptz not null default now(),
  foreign key (report_id, organisation_id) references public.reports (id, organisation_id) on delete cascade,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id)
);
create index report_events_report_idx on public.report_events (report_id, organisation_id, created_at);
create index report_events_ws_idx on public.report_events (workspace_id, organisation_id);
create index report_events_actor_idx on public.report_events (actor);

-- ================================================================== 5. Decisions, gates, links, shares
alter table public.decisions
  add column report_id uuid,
  add column decided_meeting_id uuid,
  add constraint decisions_report_fkey foreign key (report_id, organisation_id)
    references public.reports (id, organisation_id) on delete set null (report_id),
  add constraint decisions_decided_meeting_fkey foreign key (decided_meeting_id, organisation_id)
    references public.meetings (id, organisation_id) on delete set null (decided_meeting_id);
create index decisions_report_idx on public.decisions (report_id, organisation_id);
create index decisions_decided_meeting_idx on public.decisions (decided_meeting_id, organisation_id);

create table public.approval_gates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  project_id uuid,
  entity_type text not null check (entity_type ~ '^[a-z_]{2,40}$'),
  entity_id uuid not null,
  gate_type text not null check (gate_type ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(btrim(name)) > 0),
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'waived')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (id, organisation_id),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete cascade,
  check (entity_type <> 'project' or project_id = entity_id)
);
create index approval_gates_ws_idx on public.approval_gates (workspace_id, organisation_id);
create index approval_gates_project_idx on public.approval_gates (project_id, workspace_id);
create index approval_gates_entity_idx on public.approval_gates (entity_type, entity_id);
create index approval_gates_created_by_idx on public.approval_gates (created_by);
create trigger approval_gates_00_tenant_guard before insert or update on public.approval_gates
  for each row execute function private.tenant_guard('project_id', 'projects');
create trigger approval_gates_updated_at before update on public.approval_gates
  for each row execute function private.set_updated_at();

create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  gate_id uuid not null,
  step_order integer not null check (step_order > 0),
  required_role text not null check (length(btrim(required_role)) > 0),
  approver_id uuid references public.profiles (id) on delete set null,
  decision text check (decision in ('approved', 'rejected')),
  decided_at timestamptz,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (gate_id, organisation_id) references public.approval_gates (id, organisation_id) on delete cascade,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  unique (gate_id, step_order)
);
create index approval_steps_gate_idx on public.approval_steps (gate_id, organisation_id);
create index approval_steps_ws_idx on public.approval_steps (workspace_id, organisation_id);
create index approval_steps_approver_idx on public.approval_steps (approver_id);
create trigger approval_steps_00_tenant_guard before insert or update on public.approval_steps
  for each row execute function private.tenant_guard('gate_id', 'approval_gates');
create trigger approval_steps_updated_at before update on public.approval_steps
  for each row execute function private.set_updated_at();

alter table public.approval_gates enable row level security;
alter table public.approval_steps enable row level security;
revoke all on public.approval_gates, public.approval_steps from anon, authenticated;
grant select, insert, update, delete on public.approval_gates, public.approval_steps to authenticated;
create policy approval_gates_select on public.approval_gates for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy approval_gates_write on public.approval_gates for all to authenticated
  using (case when project_id is null then workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[])
    else project_id = any ((select private.my_editable_project_ids())::uuid[]) end)
  with check (case when project_id is null then workspace_id = any ((select private.my_workspace_ids('manager'))::uuid[])
    else project_id = any ((select private.my_editable_project_ids())::uuid[]) end);
create policy approval_steps_select on public.approval_steps for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy approval_steps_write on public.approval_steps for all to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]))
  with check (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]));

-- A step's decision is recorded through decide_approval_step (who decided, when); the gate's
-- status follows its steps: any rejection rejects it, all approved approves it.
create function public.decide_approval_step(p_step_id uuid, p_decision text, p_comment text default null)
returns public.approval_steps
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.approval_steps;
begin
  select * into s from public.approval_steps where id = p_step_id for update;
  if s.id is null or not (s.workspace_id = any (private.my_workspace_ids('contributor'))) then
    raise exception 'You can''t decide this approval step.' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approve or reject.' using errcode = '22023';
  end if;
  if s.decision is not null then
    raise exception 'This step is already decided.' using errcode = '22023';
  end if;
  update public.approval_steps set decision = p_decision, decided_at = now(), approver_id = (select auth.uid()),
    comment = nullif(btrim(coalesce(p_comment, '')), '')
  where id = s.id returning * into s;
  update public.approval_gates g set
    status = case when exists (select 1 from public.approval_steps x where x.gate_id = g.id and x.decision = 'rejected') then 'rejected'
                  when not exists (select 1 from public.approval_steps x where x.gate_id = g.id and x.decision is distinct from 'approved') then 'approved'
                  else 'pending' end,
    decided_at = case when exists (select 1 from public.approval_steps x where x.gate_id = g.id and x.decision is null)
                        and not exists (select 1 from public.approval_steps x where x.gate_id = g.id and x.decision = 'rejected')
                      then null else now() end
  where g.id = s.gate_id;
  return s;
end;
$$;
revoke all on function public.decide_approval_step(uuid, text, text) from public, anon;
grant execute on function public.decide_approval_step(uuid, text, text) to authenticated;

create table public.record_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  workspace_id uuid not null,
  from_type text not null check (from_type ~ '^[a-z_]{2,40}$'),
  from_id uuid not null,
  to_type text not null check (to_type ~ '^[a-z_]{2,40}$'),
  to_id uuid not null,
  link_type text not null check (link_type ~ '^[a-z_]{2,40}$'),
  attributes jsonb check (attributes is null or jsonb_typeof(attributes) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  unique (from_type, from_id, to_type, to_id, link_type),
  check (from_id <> to_id)
);
create index record_links_ws_idx on public.record_links (workspace_id, organisation_id);
create index record_links_to_idx on public.record_links (to_type, to_id);
create index record_links_created_by_idx on public.record_links (created_by);
create trigger record_links_00_tenant_guard before insert or update on public.record_links
  for each row execute function private.tenant_guard('workspace_id', 'workspaces');
alter table public.record_links enable row level security;
revoke all on public.record_links from anon, authenticated;
grant select, insert, delete on public.record_links to authenticated;
create policy record_links_select on public.record_links for select to authenticated
  using (workspace_id = any ((select private.my_workspace_ids())::uuid[]));
create policy record_links_insert on public.record_links for insert to authenticated
  with check (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]));
create policy record_links_delete on public.record_links for delete to authenticated
  using (workspace_id = any ((select private.my_workspace_ids('contributor'))::uuid[]));

-- Dependencies stay in their own table; this view shows them in the record_links shape.
create view public.v_record_links with (security_invoker = true) as
  select l.id, l.organisation_id, l.workspace_id, l.from_type, l.from_id, l.to_type, l.to_id, l.link_type,
    l.attributes, 'record_links'::text as source
  from public.record_links l
  union all
  select d.id, d.organisation_id, d.workspace_id, 'project', d.receiver_project_id, 'project', d.giver_project_id,
    'depends_on', jsonb_build_object('criticality', d.criticality, 'need_by', d.required_by_date, 'ref', d.ref,
      'description', d.description, 'validation', d.validation),
    'dependencies'
  from public.dependencies d
  where d.receiver_project_id is not null and d.giver_project_id is not null;
grant select on public.v_record_links to authenticated;

create table public.entity_shares (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  workspace_id uuid,
  entity_type text not null check (entity_type in ('programme', 'project', 'forum', 'report')),
  entity_id uuid not null,
  partner_organisation_id uuid not null references public.organisations (id) on delete cascade,
  access text not null default 'read' check (access in ('read', 'contribute')),
  hidden_block_keys text[] not null default '{}',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, organisation_id) references public.workspaces (id, organisation_id),
  unique (entity_type, entity_id, partner_organisation_id),
  check (partner_organisation_id <> organisation_id)
);
create index entity_shares_ws_idx on public.entity_shares (workspace_id, organisation_id);
create index entity_shares_partner_idx on public.entity_shares (partner_organisation_id);
create index entity_shares_created_by_idx on public.entity_shares (created_by);
alter table public.entity_shares enable row level security;
revoke all on public.entity_shares from anon, authenticated;
grant select on public.entity_shares to authenticated;
-- Owners and partners read shares; creating them is SQL-only for now (spec §14).
create policy entity_shares_select on public.entity_shares for select to authenticated
  using (organisation_id = any ((select private.my_org_ids())::uuid[])
    or partner_organisation_id = any ((select private.my_org_ids())::uuid[]));

-- ==================================================================== 6. Access helpers
-- Can the signed-in user view an entity: a member of its workspace (or organisation for
-- organisation-level rows), or their organisation has a share for it or its programme.
create function private.can_view_entity(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_ws uuid;
  v_programme uuid;
  mine uuid[] := private.my_org_ids();
begin
  case p_entity_type
    when 'project' then select organisation_id, workspace_id, programme_id into v_org, v_ws, v_programme from public.projects where id = p_entity_id;
    when 'programme' then select organisation_id, workspace_id, id into v_org, v_ws, v_programme from public.programmes where id = p_entity_id;
    when 'portfolio' then select organisation_id, workspace_id into v_org, v_ws from public.portfolios where id = p_entity_id;
    when 'forum' then select organisation_id, workspace_id into v_org, v_ws from public.forums where id = p_entity_id;
    when 'report' then select organisation_id, workspace_id into v_org, v_ws from public.reports where id = p_entity_id;
    else return false;
  end case;
  if v_org is null then return false; end if;
  if (v_ws is null and v_org = any (mine)) or v_ws = any (private.my_workspace_ids()) then return true; end if;
  return exists (
    select 1 from public.entity_shares s
    where s.partner_organisation_id = any (mine)
      and ((s.entity_type = p_entity_type and s.entity_id = p_entity_id)
        or (s.entity_type = 'programme' and s.entity_id = v_programme)));
end;
$$;

-- Report editors: PMO / admin of the report's workspace (organisation PMO / admin for an
-- organisation-wide report), the forum's chair or secretary, or the creator while it is a draft.
-- Drafts and in-review reports only; nothing edits an approved or published report's content.
create function private.can_edit_report(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.status in ('draft', 'in_review') and (
      (r.workspace_id is null and r.organisation_id = any (private.my_org_ids('pmo')))
      or r.workspace_id = any (private.my_workspace_ids('pmo'))
      or (r.forum_id is not null and private.forum_role_of(r.forum_id) in ('chair', 'secretary'))
      or (r.status = 'draft' and r.created_by = (select auth.uid())))
    from public.reports r where r.id = p_report), false);
$$;

-- Report readers. Published (and withdrawn) packs: anyone who can view the report entity
-- (workspace members, organisation members for organisation-wide reports, partner shares of
-- the report, its forum or programme) and the forum's members. Drafts: editors and the forum's
-- chair / secretary only. PMO / admin see everything in their workspaces.
create function private.can_view_report(p_report uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  mine uuid[];
begin
  select id, organisation_id, workspace_id, forum_id, status, created_by, scope_type, scope_entity_id
    into r from public.reports where id = p_report;
  if r.id is null then return false; end if;
  if (r.workspace_id is null and r.organisation_id = any (private.my_org_ids('pmo')))
    or r.workspace_id = any (private.my_workspace_ids('pmo')) then return true; end if;
  if r.forum_id is not null and private.forum_role_of(r.forum_id) in ('chair', 'secretary') then return true; end if;
  if r.status in ('draft', 'in_review', 'approved') then
    return r.created_by = (select auth.uid()) or private.can_edit_report(p_report);
  end if;
  -- published / withdrawn
  mine := private.my_org_ids();
  if r.organisation_id = any (mine) and (r.workspace_id is null or r.workspace_id = any (private.my_workspace_ids())) then
    return true;
  end if;
  if r.forum_id is not null and private.forum_role_of(r.forum_id) is not null then return true; end if;
  return exists (
    select 1 from public.entity_shares s
    where s.partner_organisation_id = any (mine)
      and ((s.entity_type = 'report' and s.entity_id = r.id)
        or (s.entity_type = 'forum' and s.entity_id = r.forum_id)
        or (s.entity_type = r.scope_type and s.entity_id = r.scope_entity_id)));
end;
$$;

-- PMO / admin of the report's workspace (organisation PMO / admin for organisation-wide reports).
create function private.is_report_pmo(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (r.workspace_id is null and r.organisation_id = any (private.my_org_ids('pmo')))
      or r.workspace_id = any (private.my_workspace_ids('pmo'))
    from public.reports r where r.id = p_report), false);
$$;

-- Approvers (§10, RB-19): the forum's chair; PMO / admin when the forum has no chair or does
-- not require approval; PMO for reports without a forum.
create function private.can_approve_report(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when r.forum_id is null then private.is_report_pmo(r.id)
      when private.forum_role_of(r.forum_id) = 'chair' then true
      when not f.approval_required then private.is_report_pmo(r.id)
      when f.chair_resource_id is null and not exists (select 1 from public.forum_members m where m.forum_id = f.id and m.role = 'chair')
        then private.is_report_pmo(r.id)
      else false end
    from public.reports r left join public.forums f on f.id = r.forum_id where r.id = p_report), false);
$$;

-- Publishers: PMO / admin, or the forum's secretary.
create function private.can_publish_report(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_report_pmo(p_report) or coalesce((
    select r.forum_id is not null and private.forum_role_of(r.forum_id) = 'secretary'
    from public.reports r where r.id = p_report), false);
$$;

-- Is the signed-in user in a partner organisation (not the report's own)?
create function private.is_partner_viewer(p_report uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.reports r where r.id = p_report and r.organisation_id = any (private.my_org_ids()));
$$;

-- Block keys hidden from partners for this report (union of matching shares).
create function private.partner_hidden_blocks(p_report uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct k), '{}') from public.reports r
  join public.entity_shares s on s.partner_organisation_id = any (private.my_org_ids())
    and ((s.entity_type = 'report' and s.entity_id = r.id) or (s.entity_type = 'forum' and s.entity_id = r.forum_id)
      or (s.entity_type = r.scope_type and s.entity_id = r.scope_entity_id))
  cross join lateral unnest(s.hidden_block_keys) k
  where r.id = p_report;
$$;

-- What the signed-in user may do with a report (the UI's buttons; the RPCs re-check).
create function public.report_permissions(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'can_view', private.can_view_report(p_report_id),
    'can_edit', private.can_edit_report(p_report_id),
    'can_approve', private.can_approve_report(p_report_id),
    'can_publish', private.can_publish_report(p_report_id),
    'can_withdraw', private.is_report_pmo(p_report_id),
    'can_save_template', coalesce((select private.can_manage_template(r.organisation_id, r.workspace_id) from public.reports r where r.id = p_report_id), false),
    'is_partner', private.is_partner_viewer(p_report_id),
    'hidden_block_keys', to_jsonb(private.partner_hidden_blocks(p_report_id)));
$$;

alter table public.reports enable row level security;
alter table public.report_inclusions enable row level security;
alter table public.report_narratives enable row level security;
alter table public.report_events enable row level security;
revoke all on public.reports, public.report_inclusions, public.report_narratives, public.report_events from anon, authenticated;
grant select, update on public.reports to authenticated;
grant select on public.report_inclusions, public.report_events to authenticated;
grant select, insert, update, delete on public.report_narratives to authenticated;
grant usage on sequence public.report_events_id_seq to authenticated;
-- Reports are created through create_report and change status through the lifecycle RPCs;
-- editors update draft content directly (with updated_at concurrency, write.ts).
create policy reports_select on public.reports for select to authenticated
  using ((select private.can_view_report(id)));
create policy reports_update on public.reports for update to authenticated
  using ((select private.can_edit_report(id))) with check ((select private.can_edit_report(id)));
create policy report_inclusions_select on public.report_inclusions for select to authenticated
  using ((select private.can_view_report(report_id)));
create policy report_events_select on public.report_events for select to authenticated
  using ((select private.can_view_report(report_id)));
create policy report_narratives_select on public.report_narratives for select to authenticated
  using ((select private.can_view_report(report_id)));
create policy report_narratives_insert on public.report_narratives for insert to authenticated
  with check ((select private.can_edit_report(report_id)));
create policy report_narratives_update on public.report_narratives for update to authenticated
  using ((select private.can_edit_report(report_id))) with check ((select private.can_edit_report(report_id)));
create policy report_narratives_delete on public.report_narratives for delete to authenticated
  using ((select private.can_edit_report(report_id)));

-- Plain updates can change draft content only: never the status or the workflow columns, and
-- never the organisation / workspace (status changes go through the lifecycle RPCs).
create function private.reports_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if new.status is distinct from old.status or new.submitted_at is distinct from old.submitted_at
      or new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by
      or new.published_at is distinct from old.published_at or new.published_by is distinct from old.published_by
      or new.previous_report_id is distinct from old.previous_report_id or new.created_by is distinct from old.created_by
      or new.template_id is distinct from old.template_id or new.template_version is distinct from old.template_version then
      raise exception 'Use the report actions (submit, approve, publish) to change its status.' using errcode = '42501';
    end if;
  end if;
  if new.organisation_id is distinct from old.organisation_id or new.workspace_id is distinct from old.workspace_id then
    raise exception 'organisation_id and workspace_id are immutable' using errcode = '42501';
  end if;
  if old.status in ('published', 'withdrawn') and (new.blocks is distinct from old.blocks or new.as_at is distinct from old.as_at
      or new.scope_type is distinct from old.scope_type or new.scope_entity_id is distinct from old.scope_entity_id
      or new.scope_items is distinct from old.scope_items or new.selection_rules is distinct from old.selection_rules
      or new.title is distinct from old.title or new.overall_rating is distinct from old.overall_rating
      or new.overall_rating_rationale is distinct from old.overall_rating_rationale) then
    raise exception 'A published report can''t change.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger reports_05_guard before update on public.reports
  for each row execute function private.reports_guard();

-- ================================================================ 7. Scope and context
-- Projects a report covers (non-archived, not closed unless the scope is one closed project).
create function private.scope_project_ids(p_scope_type text, p_scope_entity_id uuid, p_scope_items jsonb)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(p.id order by p.name), '{}')
  from public.v_projects p
  where p.archived_at is null
    and (p.state <> 'closed' or p_scope_type = 'project')
    and case p_scope_type
      when 'project' then p.id = p_scope_entity_id
      when 'programme' then p.programme_id = p_scope_entity_id
      when 'portfolio' then p.effective_portfolio_id = p_scope_entity_id
      else p.id in (select (i ->> 'entity_id')::uuid from jsonb_array_elements(coalesce(p_scope_items, '[]')) i where i ->> 'entity_type' = 'project')
        or p.programme_id in (select (i ->> 'entity_id')::uuid from jsonb_array_elements(coalesce(p_scope_items, '[]')) i where i ->> 'entity_type' = 'programme')
    end;
$$;

-- Rating scheme for a report: report → forum → template key → system RAG.
create function private.report_scheme(p_scheme_id uuid, p_forum_id uuid, p_template_key text, p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(s) from public.rating_schemes s
  where s.id = coalesce(p_scheme_id, (select f.rating_scheme_id from public.forums f where f.id = p_forum_id),
    (select x.id from public.rating_schemes x where x.key = p_template_key and (x.organisation_id = p_org or x.organisation_id is null)
     order by x.organisation_id nulls last limit 1),
    (select x.id from public.rating_schemes x where x.key = 'rag' and x.organisation_id is null));
$$;

-- The context every block function receives (jsonb): report, scope, as-at, forum, scheme,
-- matrix, inclusions. p_input: {report_id} for a saved report, or {organisation_id,
-- scope_type, scope_entity_id, scope_items, as_at, forum_id, rating_scheme_key} for a
-- template preview.
create function public.report_context(p_input jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  r public.reports;
  v_org uuid;
  v_projects uuid[];
  v_forum uuid;
  v_today date;
begin
  if p_input ? 'report_id' then
    select * into r from public.reports where id = (p_input ->> 'report_id')::uuid;
    if r.id is null then
      raise exception 'Report not found or not visible.' using errcode = '42501';
    end if;
  else
    r.organisation_id := (p_input ->> 'organisation_id')::uuid;
    r.scope_type := coalesce(p_input ->> 'scope_type', 'project');
    r.scope_entity_id := nullif(p_input ->> 'scope_entity_id', '')::uuid;
    r.scope_items := p_input -> 'scope_items';
    r.forum_id := nullif(p_input ->> 'forum_id', '')::uuid;
    r.title := coalesce(p_input ->> 'title', 'Preview');
    r.status := 'draft';
    r.selection_rules := coalesce(p_input -> 'selection_rules', '{}');
    if r.organisation_id is null then
      select organisation_id into r.organisation_id from public.v_projects
      where id = any (private.scope_project_ids(r.scope_type, r.scope_entity_id, r.scope_items)) limit 1;
    end if;
    r.as_at := coalesce(nullif(p_input ->> 'as_at', '')::date, private.org_today(r.organisation_id));
  end if;
  v_org := r.organisation_id;
  v_forum := r.forum_id;
  v_today := private.org_today(v_org);
  v_projects := private.scope_project_ids(r.scope_type, r.scope_entity_id, r.scope_items);
  return jsonb_build_object(
    'report_id', r.id, 'organisation_id', v_org, 'workspace_id', r.workspace_id, 'title', r.title,
    'status', r.status, 'as_at', r.as_at, 'today', v_today, 'forum_id', v_forum, 'meeting_id', r.meeting_id,
    'scope_type', r.scope_type, 'scope_entity_id', r.scope_entity_id, 'project_ids', to_jsonb(v_projects),
    'previous_report_id', r.previous_report_id, 'created_by', r.created_by,
    'overall_rating', r.overall_rating, 'overall_rating_rationale', r.overall_rating_rationale,
    'scheme', private.report_scheme(r.rating_scheme_id, v_forum, p_input ->> 'rating_scheme_key', v_org),
    'matrix', private.org_risk_matrix(v_org),
    'currency', coalesce((select o.settings -> 'regional' ->> 'baseCurrency' from public.organisations o where o.id = v_org), 'GBP'),
    'included', coalesce((select jsonb_agg(i.entity_id order by i.sort_order nulls last) from public.report_inclusions i
                          where i.report_id = r.id and i.mode <> 'excluded'), '[]'::jsonb),
    'forum', (select jsonb_build_object('id', f.id, 'name', f.name, 'forum_type', f.forum_type, 'tolerances', f.tolerances,
                'approval_required', f.approval_required, 'workspace_id', f.workspace_id)
              from public.forums f where f.id = v_forum),
    'meeting', (select jsonb_build_object('id', m.id, 'meeting_date', m.meeting_date, 'papers_deadline', m.papers_deadline, 'status', m.status)
                from public.meetings m where m.id = r.meeting_id)
  );
end;
$$;

-- ======================================================================= 8. Metrics
-- RAG rank: green 1 < amber 2 < red 3 (worse is higher); not_set / unknown = null.
create function private.rag_rank(p text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p when 'green' then 1 when 'amber' then 2 when 'red' then 3 end;
$$;

-- Per-entity metrics stored for a published report (Phase 3 fills report_metric_snapshots and
-- replaces this body); empty until then.
create function private.previous_report_metrics(p_report uuid)
returns table (entity_id uuid, metrics jsonb)
language sql
stable
set search_path = ''
as $$
  select null::uuid, null::jsonb where false and p_report is not null;
$$;

-- One row per project with a jsonb of metrics as at a date (spec §7.1). Security invoker: the
-- caller's RLS applies (publish_report runs it as the definer).
create function public.project_metrics(p_project_ids uuid[], p_as_at date, p_forum_id uuid default null,
  p_previous_report_id uuid default null)
returns table (project_id uuid, metrics jsonb)
language sql
stable
set search_path = ''
as $$
  with p as (
    select vp.id, vp.organisation_id, vp.programme_id, vp.name, vp.code, private.org_today(vp.organisation_id) as today
    from public.v_projects vp where vp.id = any (p_project_ids)
  ),
  h as (
    select h.* from public.project_health_current h join p on p.id = h.project_id
  ),
  snap as (
    select distinct on (hs.project_id) hs.project_id, hs.overall
    from public.health_snapshots hs join p on p.id = hs.project_id
    where hs.snapshot_date <= p_as_at
    order by hs.project_id, hs.snapshot_date desc
  ),
  prev_snap as (
    select distinct on (hs.project_id) hs.project_id, hs.overall
    from public.health_snapshots hs join p on p.id = hs.project_id
    where hs.snapshot_date <= (p_as_at - 28)
    order by hs.project_id, hs.snapshot_date desc
  ),
  declared as (
    select distinct on (r.project_id) r.project_id, r.overall, r.reporting_date
    from public.status_reports r join p on p.id = r.project_id
    where r.status = 'submitted' and r.reporting_date <= p_as_at
    order by r.project_id, r.reporting_date desc, r.submitted_at desc
  ),
  ms as (
    select m.project_id, max(m.slip_days) filter (where m.actual_date is null) as max_slip,
      count(*) filter (where m.actual_date is null and m.slip_days > 0) as slipped
    from public.v_milestones m join p on p.id = m.project_id group by m.project_id
  ),
  fin as (
    select f.project_id, f.budget, f.eac, f.variance, f.variance_percent
    from public.v_project_financials f join p on p.id = f.project_id
  ),
  fin_prev as (
    select distinct on (ffh.project_id) ffh.project_id, ffh.eac
    from public.financial_forecast_history ffh join p on p.id = ffh.project_id
    where ffh.reporting_month < date_trunc('month', p_as_at)::date
    order by ffh.project_id, ffh.reporting_month desc
  ),
  rk as (
    select r.project_id,
      private.matrix_score(coalesce((select to_jsonb(x) from public.risk_matrices x where x.id = r.risk_matrix_id),
        private.org_risk_matrix(r.organisation_id)), r.probability, r.impact) as score,
      coalesce((select to_jsonb(x) from public.risk_matrices x where x.id = r.risk_matrix_id), private.org_risk_matrix(r.organisation_id)) as matrix
    from public.risks r join p on p.id = r.project_id where r.status = 'open'
  ),
  risk_agg as (
    select rk.project_id, max(rk.score) as max_score,
      count(*) filter (where (private.matrix_band(rk.matrix, rk.score) ->> 'top')::boolean) as top_band
    from rk group by rk.project_id
  ),
  iss as (
    select i.project_id, count(*) as high from public.issues i join p on p.id = i.project_id
    where i.status = 'open' and i.severity = 'high' group by i.project_id
  ),
  dec as (
    select d.project_id, count(*) as n from public.decisions d join p on p.id = d.project_id
    where d.status = 'pending' and p_forum_id is not null and d.forum_id = p_forum_id group by d.project_id
  ),
  cr as (
    select c.project_id, count(*) as n from public.change_requests c join p on p.id = c.project_id
    where c.status = 'proposed' group by c.project_id
  ),
  gates as (
    select x.project_id, min(x.d) - p_as_at as days from (
      select g.project_id, coalesce(g.forecast_date, g.actual_date) as d from public.v_project_gates g join p on p.id = g.project_id
      where g.actual_date is null and g.forecast_date is not null
      union all
      select a.project_id, a.due_date from public.approval_gates a join p on p.id = a.project_id
      where a.gate_type = 'stage_gate' and a.status = 'pending' and a.due_date is not null
    ) x group by x.project_id
  ),
  deps as (
    select d.receiver_project_id as project_id, count(*) as n
    from public.dependencies d join public.v_dependency_health dh on dh.dependency_id = d.id
    join p on p.id = d.receiver_project_id
    where dh.health in ('amber', 'red') and d.validation <> 'closed' group by d.receiver_project_id
  ),
  tasks as (
    select t.project_id, t.avg_percent_complete from public.v_project_task_stats t join p on p.id = t.project_id
  ),
  prev as (
    select ms2.entity_id as project_id, ms2.metrics from private.previous_report_metrics(p_previous_report_id) ms2
  )
  select p.id, jsonb_strip_nulls(jsonb_build_object(
    'declared_rating', coalesce(d.overall::text, 'not_set'),
    'evidenced_rating', coalesce(case when p_as_at < p.today - 1 then s.overall::text end, h.evidenced::text, h.computed_overall::text, 'not_set'),
    'rating_rank_delta', private.rag_rank(coalesce(case when p_as_at < p.today - 1 then s.overall::text end, h.evidenced::text, h.computed_overall::text))
      - private.rag_rank(d.overall::text),
    'divergence_days', coalesce(h.divergence_days, 0),
    'rating_worsened', coalesce(
      private.rag_rank(coalesce(case when p_as_at < p.today - 1 then s.overall::text end, h.evidenced::text, h.computed_overall::text))
        > private.rag_rank(coalesce(pv.metrics ->> 'evidenced_rating', ps.overall::text)), false),
    'dimension_red_count', (h.schedule = 'red')::int + (h.financial = 'red')::int + (h.effort = 'red')::int
      + (h.issue = 'red')::int + (h.benefit = 'red')::int,
    'max_milestone_slip_days', greatest(coalesce(ms.max_slip, 0), 0),
    'slipped_milestones', coalesce(ms.slipped, 0),
    'budget', f.budget,
    'eac', f.eac,
    -- forecast at completion − budget (v_project_financials.variance is budget − EAC)
    'budget_variance_abs', f.eac - f.budget,
    'budget_variance_pct', f.variance_percent,
    'budget_change_period', case when fp.eac is not null and f.eac is not null then f.eac - fp.eac end,
    'max_risk_score', coalesce(ra.max_score, 0),
    'risks_in_top_band', coalesce(ra.top_band, 0),
    'open_issues_high', coalesce(iss.high, 0),
    'open_decisions_for_forum', coalesce(dec.n, 0),
    'escalations_for_forum', 0,
    'open_change_requests', coalesce(cr.n, 0),
    'days_to_next_gate', g.days,
    'at_risk_dependencies', coalesce(dp.n, 0),
    'benefits_rating', coalesce(h.benefit::text, 'not_set'),
    'stale_update_days', case when d.reporting_date is not null then p_as_at - d.reporting_date end,
    'percent_complete', round(coalesce(t.avg_percent_complete, 0))
  ))
  from p
  left join h on h.project_id = p.id
  left join snap s on s.project_id = p.id
  left join prev_snap ps on ps.project_id = p.id
  left join declared d on d.project_id = p.id
  left join ms on ms.project_id = p.id
  left join fin f on f.project_id = p.id
  left join fin_prev fp on fp.project_id = p.id
  left join risk_agg ra on ra.project_id = p.id
  left join iss on iss.project_id = p.id
  left join dec on dec.project_id = p.id
  left join cr on cr.project_id = p.id
  left join gates g on g.project_id = p.id
  left join deps dp on dp.project_id = p.id
  left join tasks t on t.project_id = p.id
  left join prev pv on pv.project_id = p.id;
$$;

-- ============================================================ 9. Selection rules (§7.2)
-- Does a metric value satisfy op/threshold? Numbers compare as numbers, booleans and text by
-- equality, 'in' against an array, 'worse_than' by RAG rank. A missing value never matches.
-- Mirrored for previews in src/features/reports/engine/evaluateRules.ts; both run the cases in
-- src/features/reports/engine/selection-cases.json.
create function private.rule_matches(p_value jsonb, p_op text, p_threshold jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
  t numeric;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' or p_threshold is null or jsonb_typeof(p_threshold) = 'null' then
    return false;
  end if;
  if p_op = 'in' then
    return jsonb_typeof(p_threshold) = 'array' and exists (
      select 1 from jsonb_array_elements(p_threshold) e where e #>> '{}' = p_value #>> '{}');
  end if;
  if p_op = 'worse_than' then
    return coalesce(private.rag_rank(p_value #>> '{}') > private.rag_rank(p_threshold #>> '{}'), false);
  end if;
  if jsonb_typeof(p_value) = 'number' and (p_threshold #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then
    v := (p_value #>> '{}')::numeric;
    t := (p_threshold #>> '{}')::numeric;
    return case p_op when '>' then v > t when '>=' then v >= t when '<' then v < t when '<=' then v <= t
      when '=' then v = t when '!=' then v <> t else false end;
  end if;
  return case p_op when '=' then lower(p_value #>> '{}') = lower(p_threshold #>> '{}')
    when '!=' then lower(p_value #>> '{}') <> lower(p_threshold #>> '{}') else false end;
end;
$$;

-- Evaluate a rule set over [{project_id, name, metrics}] with forum tolerances. Returns every
-- project that matches (mode any: one rule; all: every enabled rule) with its reasons; capping
-- and ordering happen in compute_inclusions.
create function private.evaluate_selection(p_rules jsonb, p_metrics jsonb, p_tolerances jsonb)
returns table (project_id uuid, name text, reasons jsonb, severity integer, matched integer)
language sql
immutable
set search_path = ''
as $$
  with rules as (
    select r.value as rule,
      case when coalesce((r.value ->> 'useForumTolerance')::boolean, false) and coalesce(p_tolerances, '{}') ? (r.value ->> 'metric')
        then coalesce(p_tolerances -> (r.value ->> 'metric') -> 'value', p_tolerances -> (r.value ->> 'metric'))
        else r.value -> 'value' end as threshold
    from jsonb_array_elements(coalesce(p_rules -> 'rules', '[]')) r
    where coalesce((r.value ->> 'enabled')::boolean, true)
  ),
  hits as (
    select (m.value ->> 'project_id')::uuid as project_id, m.value ->> 'name' as name, r.rule, r.threshold,
      m.value -> 'metrics' -> (r.rule ->> 'metric') as actual
    from jsonb_array_elements(coalesce(p_metrics, '[]')) m cross join rules r
    where private.rule_matches(m.value -> 'metrics' -> (r.rule ->> 'metric'), r.rule ->> 'op', r.threshold)
  ),
  agg as (
    select h.project_id, h.name,
      jsonb_agg(jsonb_build_object('rule_id', h.rule ->> 'id', 'label', h.rule ->> 'label', 'metric', h.rule ->> 'metric',
        'op', h.rule ->> 'op', 'value', h.actual, 'threshold', h.threshold, 'severity', coalesce((h.rule ->> 'severity')::int, 1))
        order by coalesce((h.rule ->> 'severity')::int, 1) desc, h.rule ->> 'id') as reasons,
      max(coalesce((h.rule ->> 'severity')::int, 1)) as severity, count(*)::int as matched
    from hits h group by h.project_id, h.name
  )
  select a.project_id, a.name, a.reasons, a.severity, a.matched from agg a
  where coalesce(p_rules ->> 'mode', 'any') = 'any' or a.matched = (select count(*) from rules);
$$;

-- Recompute a report's rule inclusions, keeping pinned / excluded overrides (§7.2 steps 1–6).
create function private.compute_inclusions(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
  v_projects uuid[];
  v_metrics jsonb;
  v_tol jsonb;
  v_cap integer;
  v_order text;
begin
  select * into r from public.reports where id = p_report;
  v_projects := private.scope_project_ids(r.scope_type, r.scope_entity_id, r.scope_items);
  select coalesce(jsonb_agg(jsonb_build_object('project_id', pm.project_id, 'name', p.name, 'metrics', pm.metrics)), '[]')
    into v_metrics
  from public.project_metrics(v_projects, r.as_at, r.forum_id, r.previous_report_id) pm
  join public.projects p on p.id = pm.project_id;
  select coalesce(f.tolerances, '{}') into v_tol from public.forums f where f.id = r.forum_id;
  v_cap := nullif(r.selection_rules ->> 'maxAutoIncluded', '')::int;
  v_order := coalesce(r.selection_rules ->> 'orderBy', 'severity');

  create temp table if not exists rb_matches (project_id uuid, name text, reasons jsonb, severity int, matched int) on commit drop;
  truncate rb_matches;
  insert into rb_matches select * from private.evaluate_selection(r.selection_rules, v_metrics, v_tol);

  -- Overrides for projects no longer in scope go; rule rows are rebuilt.
  delete from public.report_inclusions i where i.report_id = r.id
    and (i.mode = 'rule' or not (i.entity_id = any (v_projects)));
  -- Pinned and excluded rows keep their mode and take the current would-be reasons.
  update public.report_inclusions i set reasons = coalesce(m.reasons, '[]'), severity = m.severity
  from (select i2.entity_id, x.reasons, x.severity from public.report_inclusions i2
        left join rb_matches x on x.project_id = i2.entity_id where i2.report_id = r.id) m
  where i.report_id = r.id and i.entity_id = m.entity_id;

  insert into public.report_inclusions (report_id, entity_type, entity_id, mode, reasons, severity)
  select r.id, 'project', x.project_id, 'rule', x.reasons, x.severity
  from (select x.*, row_number() over (order by x.severity desc, x.matched desc, x.name) as rn from rb_matches x
        where not exists (select 1 from public.report_inclusions i where i.report_id = r.id and i.entity_id = x.project_id)) x
  where v_cap is null or x.rn <= v_cap;

  if v_order <> 'manual' then
    update public.report_inclusions i set sort_order = o.rn
    from (select i2.entity_id, row_number() over (order by
            case when v_order = 'programme' then coalesce(pg.name, '') end,
            case when v_order = 'severity' then coalesce(i2.severity, 0) end desc,
            case when v_order = 'severity' then jsonb_array_length(i2.reasons) end desc,
            p.name) as rn
          from public.report_inclusions i2 join public.projects p on p.id = i2.entity_id
          left join public.programmes pg on pg.id = p.programme_id
          where i2.report_id = r.id and i2.mode <> 'excluded') o
    where i.report_id = r.id and i.entity_id = o.entity_id;
  end if;
end;
$$;

-- "Refresh selection" in a draft.
create function public.refresh_report_selection(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_edit_report(p_report_id) then
    raise exception 'You can''t change this report.' using errcode = '42501';
  end if;
  perform private.compute_inclusions(p_report_id);
  insert into public.report_events (report_id, event, actor) values (p_report_id, 'selection_refreshed', (select auth.uid()));
end;
$$;

-- Pin, exclude or clear an override (p_mode null), or set a manual order (p_order: ids).
create function public.set_report_inclusion(p_report_id uuid, p_entity_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
begin
  if not private.can_edit_report(p_report_id) then
    raise exception 'You can''t change this report.' using errcode = '42501';
  end if;
  select * into r from public.reports where id = p_report_id;
  if not (p_entity_id = any (private.scope_project_ids(r.scope_type, r.scope_entity_id, r.scope_items))) then
    raise exception 'That project isn''t in this report''s scope.' using errcode = '22023';
  end if;
  if p_mode is not null and p_mode not in ('pinned', 'excluded') then
    raise exception 'Pin or exclude.' using errcode = '22023';
  end if;
  delete from public.report_inclusions where report_id = r.id and entity_id = p_entity_id;
  if p_mode is not null then
    insert into public.report_inclusions (report_id, entity_type, entity_id, mode, pinned_by, sort_order)
    values (r.id, 'project', p_entity_id, p_mode, (select auth.uid()), 100000);
  end if;
  perform private.compute_inclusions(r.id);
end;
$$;

create function public.reorder_report_inclusions(p_report_id uuid, p_entity_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_edit_report(p_report_id) then
    raise exception 'You can''t change this report.' using errcode = '42501';
  end if;
  update public.report_inclusions i set sort_order = o.ord
  from unnest(p_entity_ids) with ordinality o(id, ord)
  where i.report_id = p_report_id and i.entity_id = o.id;
  update public.reports set selection_rules = selection_rules || '{"orderBy":"manual"}' where id = p_report_id;
end;
$$;

-- ==================================================================== 10. Create report
-- Who may create a report (RB-19, RB-20, RB-23): PMO / admin; the forum's chair or secretary;
-- for a Project Board pack the project's manager; ad hoc reports any contributor who can see
-- the whole scope.
create function public.create_report(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.forums;
  t public.report_templates;
  m public.meetings;
  v_id uuid;
  v_scope_type text := nullif(p ->> 'scope_type', '');
  v_scope_entity uuid := nullif(p ->> 'scope_entity_id', '')::uuid;
  v_items jsonb := p -> 'scope_items';
  v_org uuid;
  v_ws uuid;
  v_wss uuid[];
  v_projects uuid[];
  v_as_at date;
  v_is_pmo boolean;
  v_allowed boolean := false;
  v_title text := nullif(btrim(coalesce(p ->> 'title', '')), '');
  v_scheme uuid := nullif(p ->> 'rating_scheme_id', '')::uuid;
  v_today date;
  v_prev uuid;
begin
  if nullif(p ->> 'forum_id', '') is not null then
    select * into f from public.forums where id = (p ->> 'forum_id')::uuid;
    if f.id is null or not (f.organisation_id = any (private.my_org_ids())) then
      raise exception 'Forum not found.' using errcode = '42501';
    end if;
    v_scope_type := coalesce(v_scope_type, f.scope_type);
    v_scope_entity := coalesce(v_scope_entity, f.scope_entity_id);
    if v_scope_type = 'custom' and v_items is null then
      select jsonb_agg(jsonb_build_object('entity_type', s.entity_type, 'entity_id', s.entity_id)) into v_items
      from public.forum_scope_items s where s.forum_id = f.id;
    end if;
  end if;
  if nullif(p ->> 'meeting_id', '') is not null then
    select * into m from public.meetings where id = (p ->> 'meeting_id')::uuid;
    if m.id is null or m.forum_id is distinct from f.id then
      raise exception 'The meeting must be one of the forum''s meetings.' using errcode = '22023';
    end if;
  end if;
  if v_scope_type is null then
    raise exception 'Choose what the report covers.' using errcode = '22023';
  end if;
  if v_scope_type = 'custom' then v_scope_entity := null; end if;

  -- Organisation and workspace: the forum's, else the scope's.
  if v_scope_type = 'project' then select organisation_id, workspace_id into v_org, v_ws from public.projects where id = v_scope_entity;
  elsif v_scope_type = 'programme' then select organisation_id, workspace_id into v_org, v_ws from public.programmes where id = v_scope_entity;
  elsif v_scope_type = 'portfolio' then select organisation_id, workspace_id into v_org, v_ws from public.portfolios where id = v_scope_entity;
  else
    select min(x.organisation_id::text)::uuid, array_agg(distinct x.workspace_id) into v_org, v_wss from (
      select p2.organisation_id, p2.workspace_id from public.projects p2
      where p2.id in (select (i ->> 'entity_id')::uuid from jsonb_array_elements(coalesce(v_items, '[]')) i where i ->> 'entity_type' = 'project')
      union all
      select g.organisation_id, g.workspace_id from public.programmes g
      where g.id in (select (i ->> 'entity_id')::uuid from jsonb_array_elements(coalesce(v_items, '[]')) i where i ->> 'entity_type' = 'programme')) x;
    v_ws := case when cardinality(v_wss) = 1 then v_wss[1] end;
  end if;
  if f.id is not null then
    if v_org is not null and v_org <> f.organisation_id then
      raise exception 'The scope belongs to another organisation.' using errcode = '22023';
    end if;
    v_org := f.organisation_id;
    v_ws := coalesce(f.workspace_id, v_ws);
  end if;
  if v_org is null or not (v_org = any (private.my_org_ids())) then
    raise exception 'Choose a project, programme or portfolio you can see.' using errcode = '42501';
  end if;
  if v_scope_entity is not null and not private.can_view_entity(v_scope_type, v_scope_entity) then
    raise exception 'You can''t see that %.', v_scope_type using errcode = '42501';
  end if;
  if v_scope_type = 'custom' and exists (
      select 1 from jsonb_array_elements(coalesce(v_items, '[]')) i
      where not private.can_view_entity(i ->> 'entity_type', (i ->> 'entity_id')::uuid)) then
    raise exception 'You can''t see every item in that scope.' using errcode = '42501';
  end if;

  v_is_pmo := case when v_ws is null then v_org = any (private.my_org_ids('pmo')) else v_ws = any (private.my_workspace_ids('pmo')) end;
  if v_is_pmo then
    v_allowed := true;
  elsif f.id is not null then
    v_allowed := private.forum_role_of(f.id) in ('chair', 'secretary')
      or (f.forum_type = 'project_board' and v_scope_type = 'project' and exists (
            select 1 from public.projects p2 join public.resources res on res.id = p2.manager_id
            where p2.id = v_scope_entity and res.profile_id = (select auth.uid())));
  else
    v_allowed := case when v_ws is null then v_org = any (private.my_org_ids('contributor'))
                      else v_ws = any (private.my_workspace_ids('contributor')) end;
  end if;
  if not v_allowed then
    raise exception 'You can''t create a report here. PMO, the forum chair or secretary, or the project''s manager (for its project board) can.' using errcode = '42501';
  end if;

  v_today := private.org_today(v_org);
  v_as_at := coalesce(nullif(p ->> 'as_at', '')::date, m.papers_deadline, v_today);
  -- A meeting's pack waits for its papers deadline (the collection cut-off, RB-6); PMO can override.
  if m.id is not null and m.papers_deadline > v_today and not (v_is_pmo and coalesce((p ->> 'override_cutoff')::boolean, false)) then
    raise exception 'The pack can be created after the papers deadline (%).', to_char(m.papers_deadline, 'DD/MM/YYYY') using errcode = '22023';
  end if;

  if nullif(p ->> 'template_id', '') is not null then
    select * into t from public.report_templates where id = (p ->> 'template_id')::uuid
      and (organisation_id is null or organisation_id = v_org) and archived_at is null;
    if t.id is null then raise exception 'Template not found.' using errcode = '22023'; end if;
  elsif f.default_template_id is not null and not coalesce((p ->> 'ad_hoc')::boolean, false) then
    select * into t from public.report_templates where id = f.default_template_id and archived_at is null;
  end if;
  if v_scheme is null and t.rating_scheme_key is not null then
    select s.id into v_scheme from public.rating_schemes s where s.key = t.rating_scheme_key
      and (s.organisation_id = v_org or s.organisation_id is null) order by s.organisation_id nulls last limit 1;
  end if;

  if f.id is not null then
    select r.id into v_prev from public.reports r where r.forum_id = f.id and r.status = 'published'
    order by r.published_at desc limit 1;
  end if;
  v_title := coalesce(v_title, case when f.id is not null
    then f.name || coalesce(' — ' || to_char(m.meeting_date, 'DD Mon YYYY'), '') else 'Ad hoc report' end);

  insert into public.reports (organisation_id, workspace_id, title, template_id, template_version, forum_id, meeting_id,
    scope_type, scope_entity_id, scope_items, as_at, blocks, selection_rules, rating_scheme_id, previous_report_id)
  values (v_org, v_ws, v_title, t.id, t.version, f.id, m.id, v_scope_type, v_scope_entity,
    case when v_scope_type = 'custom' then coalesce(v_items, '[]') end, v_as_at,
    coalesce(t.blocks, p -> 'blocks', '[]'), coalesce(t.selection_rules, p -> 'selection_rules', '{}'), v_scheme, v_prev)
  returning id into v_id;
  perform private.compute_inclusions(v_id);
  insert into public.report_events (report_id, event, actor, payload)
  values (v_id, 'created', (select auth.uid()), jsonb_build_object('template_id', t.id, 'template_version', t.version));
  return v_id;
end;
$$;

-- Report-owned rows (inclusions, events) take organisation / workspace from the report.
create trigger report_events_00_tenant_guard before insert or update on public.report_events
  for each row execute function private.tenant_guard('report_id', 'reports');

-- Save a report's blocks and rules as a new organisation template ("Save as template").
create function public.save_report_as_template(p_report_id uuid, p_name text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reports;
  v_id uuid;
begin
  select * into r from public.reports where id = p_report_id;
  if r.id is null or not private.can_view_report(r.id) then
    raise exception 'Report not found.' using errcode = '42501';
  end if;
  if not private.can_manage_template(r.organisation_id, r.workspace_id) then
    raise exception 'PMO or admins save templates.' using errcode = '42501';
  end if;
  insert into public.report_templates (organisation_id, workspace_id, name, description, forum_type, scope_type, blocks, selection_rules)
  values (r.organisation_id, null, coalesce(nullif(btrim(p_name), ''), r.title), p_description,
    (select f.forum_type from public.forums f where f.id = r.forum_id), r.scope_type, r.blocks, r.selection_rules)
  returning id into v_id;
  return v_id;
end;
$$;

-- ==================================================================== 11. Block data
-- Each block is private.rb_<key>(ctx jsonb, cfg jsonb) → jsonb, security invoker (the caller's
-- RLS applies in drafts; publish runs them as the definer). ctx is report_context() plus
-- block_id and entity_id (deep-dive project). Ratings come back as RAG values; renderers map
-- them through the scheme in ctx (§8).

-- Projects a block covers: the deep-dive project, else the report's scope.
create function private.rb_projects(ctx jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select case when nullif(ctx ->> 'entity_id', '') is not null then array[(ctx ->> 'entity_id')::uuid]
    else coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(ctx -> 'project_ids') x), '{}') end;
$$;

create function private.rb_single_project(ctx jsonb)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when cardinality(private.rb_projects(ctx)) = 1 then (private.rb_projects(ctx))[1] end;
$$;

create function private.rb_report_cover(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'title', ctx ->> 'title', 'status', ctx ->> 'status', 'as_at', ctx ->> 'as_at',
    'forum_name', ctx -> 'forum' ->> 'name', 'meeting_date', ctx -> 'meeting' ->> 'meeting_date',
    'overall_rating', ctx ->> 'overall_rating', 'overall_rating_rationale', ctx ->> 'overall_rating_rationale',
    'author', (select pr.display_name from public.profiles pr where pr.id = (ctx ->> 'created_by')::uuid),
    'project_count', jsonb_array_length(coalesce(ctx -> 'project_ids', '[]')),
    'scope_label', case ctx ->> 'scope_type'
      when 'project' then (select p.code || ' ' || p.name from public.projects p where p.id = (ctx ->> 'scope_entity_id')::uuid)
      when 'programme' then (select g.name from public.programmes g where g.id = (ctx ->> 'scope_entity_id')::uuid)
      when 'portfolio' then (select f.name from public.portfolios f where f.id = (ctx ->> 'scope_entity_id')::uuid)
      else jsonb_array_length(coalesce(ctx -> 'project_ids', '[]')) || ' projects' end,
    'scope_type', ctx ->> 'scope_type');
$$;

create function private.rb_narrative(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('heading', cfg ->> 'heading', 'narrative', (
    select jsonb_build_object('body', n.body, 'source', n.source, 'updated_at', n.updated_at, 'id', n.id)
    from public.report_narratives n
    where n.report_id = nullif(ctx ->> 'report_id', '')::uuid and n.block_instance_id = ctx ->> 'block_id'
      and n.entity_id is not distinct from nullif(ctx ->> 'entity_id', '')::uuid));
$$;
create function private.rb_executive_summary(ctx jsonb, cfg jsonb) returns jsonb language sql stable set search_path = ''
  as $$ select private.rb_narrative(ctx, cfg); $$;
create function private.rb_free_text(ctx jsonb, cfg jsonb) returns jsonb language sql stable set search_path = ''
  as $$ select private.rb_narrative(ctx, cfg); $$;
create function private.rb_section_heading(ctx jsonb, cfg jsonb) returns jsonb language sql immutable set search_path = ''
  as $$ select jsonb_build_object('title', coalesce(cfg ->> 'title', 'Section')); $$;

create function private.rb_overall_status(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with one as (select private.rb_single_project(ctx) as id),
  m as (
    select pm.metrics from one, public.project_metrics(array[one.id], (ctx ->> 'as_at')::date, nullif(ctx ->> 'forum_id', '')::uuid,
      nullif(ctx ->> 'previous_report_id', '')::uuid) pm where one.id is not null
  ),
  trend as (
    select jsonb_agg(jsonb_build_object('month', t.month, 'rating', t.overall) order by t.month) as months from (
      select distinct on (date_trunc('month', hs.snapshot_date)) to_char(hs.snapshot_date, 'YYYY-MM') as month, hs.overall::text as overall
      from public.health_snapshots hs, one
      where hs.project_id = one.id and hs.snapshot_date <= (ctx ->> 'as_at')::date
        and hs.snapshot_date > (ctx ->> 'as_at')::date - make_interval(months => coalesce((cfg ->> 'months')::int, 6))
      order by date_trunc('month', hs.snapshot_date), hs.snapshot_date desc) t
  ),
  scope as (
    select count(*) filter (where pm.metrics ->> 'evidenced_rating' = 'green') as green,
      count(*) filter (where pm.metrics ->> 'evidenced_rating' = 'amber') as amber,
      count(*) filter (where pm.metrics ->> 'evidenced_rating' = 'red') as red,
      count(*) filter (where coalesce(pm.metrics ->> 'evidenced_rating', 'not_set') = 'not_set') as not_set,
      count(*) filter (where (pm.metrics ->> 'rating_rank_delta')::int > 0) as divergent
    from public.project_metrics(private.rb_projects(ctx), (ctx ->> 'as_at')::date) pm
  )
  select case when (select id from one) is not null then
    (select jsonb_build_object('mode', 'project', 'declared', m.metrics ->> 'declared_rating', 'evidenced', m.metrics ->> 'evidenced_rating',
       'divergence_days', (m.metrics ->> 'divergence_days')::int, 'rating_rank_delta', (m.metrics ->> 'rating_rank_delta')::int,
       'divergence_alert', h.divergence_alert, 'justified', h.justified, 'justification', h.justification,
       'last_report_date', h.last_report_date, 'report_overdue', h.report_overdue,
       'trend', coalesce((select months from trend), '[]'))
     from m left join public.project_health_current h on h.project_id = (select id from one))
  else
    (select jsonb_build_object('mode', 'scope', 'declared', ctx ->> 'overall_rating',
       'evidenced', case ctx ->> 'scope_type'
         when 'programme' then (select ph.overall::text from public.programme_health_current ph where ph.programme_id = (ctx ->> 'scope_entity_id')::uuid)
         when 'portfolio' then (select fh.overall::text from public.portfolio_health_current fh where fh.portfolio_id = (ctx ->> 'scope_entity_id')::uuid) end,
       'rationale', ctx ->> 'overall_rating_rationale',
       'counts', jsonb_build_object('green', s.green, 'amber', s.amber, 'red', s.red, 'not_set', s.not_set), 'divergent', s.divergent)
     from scope s) end;
$$;

create function private.rb_health_by_dimension(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with one as (select private.rb_single_project(ctx) as id),
  months as (
    select distinct on (date_trunc('month', hs.snapshot_date)) to_char(hs.snapshot_date, 'YYYY-MM') as month,
      jsonb_build_object('schedule', hs.schedule, 'financial', hs.financial, 'effort', hs.effort, 'issue', hs.issue,
        'benefit', hs.benefit, 'overall', hs.overall) as evidenced,
      (select jsonb_build_object('schedule', r.schedule, 'financial', r.financial, 'effort', r.effort, 'issue', r.issue,
         'benefit', r.declared_benefit, 'overall', r.overall)
       from public.status_reports r where r.project_id = hs.project_id and r.status = 'submitted'
         and r.reporting_date <= (date_trunc('month', hs.snapshot_date) + interval '1 month - 1 day')::date
       order by r.reporting_date desc, r.submitted_at desc limit 1) as declared
    from public.health_snapshots hs, one
    where hs.project_id = one.id and hs.snapshot_date <= (ctx ->> 'as_at')::date
      and hs.snapshot_date > (ctx ->> 'as_at')::date - make_interval(months => coalesce((cfg ->> 'months')::int, 6))
    order by date_trunc('month', hs.snapshot_date), hs.snapshot_date desc
  ),
  dims(dim) as (values ('schedule'), ('financial'), ('effort'), ('issue'), ('benefit'), ('overall')),
  cur as (select to_jsonb(h) as h from public.project_health_current h where h.project_id = any (private.rb_projects(ctx)))
  select case when (select id from one) is not null then jsonb_build_object('mode', 'project',
      'months', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'evidenced', evidenced, 'declared', declared) order by month) from months), '[]'),
      'current', (select jsonb_build_object('schedule', c.h ->> 'schedule', 'financial', c.h ->> 'financial', 'effort', c.h ->> 'effort',
         'issue', c.h ->> 'issue', 'benefit', c.h ->> 'benefit', 'overall', c.h ->> 'overall') from cur c))
  else jsonb_build_object('mode', 'scope', 'dimensions', (
    select jsonb_agg(jsonb_build_object('dimension', d.dim,
      'green', (select count(*) from cur where cur.h ->> d.dim = 'green'),
      'amber', (select count(*) from cur where cur.h ->> d.dim = 'amber'),
      'red', (select count(*) from cur where cur.h ->> d.dim = 'red'),
      'not_set', (select count(*) from cur where coalesce(cur.h ->> d.dim, 'not_set') = 'not_set'))) from dims d)) end;
$$;

create function private.rb_project_status_grid(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with rows as (
    select p.id, p.code, p.name, p.programme_id, coalesce(g.name, 'No programme') as programme_name,
      mgr.name as manager, lp.name as phase, p.state::text as state,
      pm.metrics ->> 'declared_rating' as declared, pm.metrics ->> 'evidenced_rating' as evidenced,
      h.schedule::text as schedule, h.financial::text as financial, h.effort::text as effort, h.issue::text as issue,
      h.benefit::text as benefit, (pm.metrics ->> 'divergence_days')::int as divergence_days,
      h.forecast_finish_date, h.finish_vs_baseline_days, (pm.metrics ->> 'budget_variance_pct')::numeric as budget_variance_pct,
      (pm.metrics ->> 'percent_complete')::numeric as percent_complete,
      i.mode as inclusion, coalesce(i.reasons, '[]') as reasons
    from public.project_metrics(private.rb_projects(ctx), (ctx ->> 'as_at')::date, nullif(ctx ->> 'forum_id', '')::uuid,
      nullif(ctx ->> 'previous_report_id', '')::uuid) pm
    join public.projects p on p.id = pm.project_id
    left join public.programmes g on g.id = p.programme_id
    left join public.resources mgr on mgr.id = p.manager_id
    left join public.lifecycle_phases lp on lp.id = p.phase_id
    left join public.project_health_current h on h.project_id = p.id
    left join public.report_inclusions i on i.report_id = nullif(ctx ->> 'report_id', '')::uuid and i.entity_id = p.id
  )
  select jsonb_build_object('group_by', coalesce(cfg ->> 'group_by', 'programme'), 'rows', coalesce(jsonb_agg(to_jsonb(r) order by
      case when coalesce(cfg ->> 'group_by', 'programme') = 'programme' then r.programme_name end,
      case when cfg ->> 'sort' = 'rating' then private.rag_rank(r.evidenced) end desc nulls last,
      case when cfg ->> 'sort' = 'code' then r.code end, r.name), '[]'),
    'total', (select count(*) from rows))
  from rows r
  where not coalesce((cfg ->> 'only_exceptions')::boolean, false) or r.inclusion in ('rule', 'pinned');
$$;

create function private.rb_project_summary(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(x) from (
    select p.id, p.code, p.name, p.tier::text as tier, p.priority::text as priority, p.state::text as state,
      lp.name as phase, p.phase_index, p.phase_count, p.start_date, p.finish_date, p.baseline_finish_date,
      h.forecast_finish_date, h.finish_vs_baseline_days, g.name as programme,
      mgr.name as manager, sp.name as sponsor, po.name as project_officer,
      round(coalesce(t.avg_percent_complete, 0)) as percent_complete
    from public.v_projects p
    left join public.lifecycle_phases lp on lp.id = p.phase_id
    left join public.project_health_current h on h.project_id = p.id
    left join public.programmes g on g.id = p.programme_id
    left join public.resources mgr on mgr.id = p.manager_id
    left join public.resources sp on sp.id = p.sponsor_id
    left join public.resources po on po.id = p.project_officer_id
    left join public.v_project_task_stats t on t.project_id = p.id
    where p.id = private.rb_single_project(ctx)) x;
$$;

create function private.rb_milestone_slippage(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('multi', cardinality(private.rb_projects(ctx)) > 1, 'rows', coalesce(jsonb_agg(to_jsonb(x) order by x.ord), '[]')) from (
    select m.id, m.ref, m.title, m.type::text as type, p.code as project_code, p.name as project_name,
      m.baseline_date, m.forecast_date, m.actual_date, m.slip_days, m.slip_band, m.status::text as status,
      row_number() over (order by (coalesce(m.slip_days, 0) > 0) desc, m.slip_days desc nulls last, m.forecast_date) as ord
    from public.v_milestones m join public.projects p on p.id = m.project_id
    where m.project_id = any (private.rb_projects(ctx)) and m.actual_date is null
      and (not coalesce((cfg ->> 'slipped_only')::boolean, false) or m.slip_days > 0)
    order by ord limit coalesce((cfg ->> 'limit')::int, 8)) x;
$$;

create function private.rb_budget_summary(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with rows as (
    select p.id, p.code, p.name, f.budget, f.actual_to_date, f.eac, f.eac - f.budget as variance, f.variance_percent, f.actuals_through,
      (pm.metrics ->> 'budget_change_period')::numeric as change_period
    from public.v_project_financials f join public.projects p on p.id = f.project_id
    left join public.project_metrics(private.rb_projects(ctx), (ctx ->> 'as_at')::date) pm on pm.project_id = p.id
    where f.project_id = any (private.rb_projects(ctx))
  )
  select jsonb_build_object('currency', ctx ->> 'currency',
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by abs(coalesce(r.variance, 0)) desc, r.name) from rows r), '[]'),
    'totals', (select jsonb_build_object('budget', sum(budget), 'actual_to_date', sum(actual_to_date), 'eac', sum(eac),
      'variance', sum(variance), 'variance_percent', case when sum(budget) > 0 then round(100 * sum(variance) / sum(budget), 1) end,
      'change_period', sum(change_period)) from rows));
$$;

create function private.rb_decisions_required(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(x) order by x.needed_by_date nulls last, x.ref), '[]')) from (
    select d.id, d.ref, d.title, d.context, d.needed_by_date, d.overdue, d.days_overdue, d.status::text as status,
      p.code as project_code, p.name as project_name, f.name as forum_name, d.target_meeting_date,
      d.impact_scope, d.impact_cost, d.impact_time, d.impact_benefits,
      d.impact_cost_note, d.impact_time_note, d.impact_scope_note, d.impact_benefits_note,
      (select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'pros', o.pros, 'cons', o.cons) order by o.sort_order)
       from public.decision_options o where o.decision_id = d.id) as options
    from public.v_decisions d
    left join public.projects p on p.id = d.project_id
    left join public.forums f on f.id = d.forum_id
    where d.status = 'pending'
      and ((nullif(ctx ->> 'forum_id', '') is not null and coalesce(cfg ->> 'source', 'forum') = 'forum'
            and d.forum_id = (ctx ->> 'forum_id')::uuid
            and (d.project_id is null or d.project_id = any (private.rb_projects(ctx)) or nullif(ctx ->> 'entity_id', '') is null))
        or ((nullif(ctx ->> 'forum_id', '') is null or cfg ->> 'source' = 'scope') and d.project_id = any (private.rb_projects(ctx))))
    limit coalesce((cfg ->> 'limit')::int, 20)) x;
$$;

create function private.rb_top_raid(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with items as (
    select 'risk' as kind, r.id, r.ref, r.title, p.code as project_code, r.probability::int as likelihood, r.impact::int as consequence,
      s.score, private.matrix_band(ctx -> 'matrix', s.score) as band, null::text as severity, r.review_date, r.updated_at,
      res.name as owner, (private.matrix_band(ctx -> 'matrix', s.score) ->> 'rank')::int as rank
    from public.risks r join public.projects p on p.id = r.project_id
    left join public.resources res on res.id = r.owner_id
    cross join lateral (select private.matrix_score(coalesce((select to_jsonb(x) from public.risk_matrices x where x.id = r.risk_matrix_id), ctx -> 'matrix'),
      r.probability, r.impact) as score) s
    where r.project_id = any (private.rb_projects(ctx)) and r.status = 'open'
      and coalesce(cfg -> 'types', '["risk","issue"]') ? 'risk'
    union all
    select 'issue', i.id, i.ref, i.title, p.code, null, null, null, null, i.severity::text, i.due_date, i.updated_at, res.name,
      -- severity rank on the matrix's band scale: high = top band, low = lowest
      case i.severity when 'high' then jsonb_array_length(ctx -> 'matrix' -> 'bands')
        when 'medium' then greatest(jsonb_array_length(ctx -> 'matrix' -> 'bands') - 1, 1) else 1 end
    from public.issues i join public.projects p on p.id = i.project_id
    left join public.resources res on res.id = i.owner_id
    where i.project_id = any (private.rb_projects(ctx)) and i.status = 'open'
      and coalesce(cfg -> 'types', '["risk","issue"]') ? 'issue'
  )
  select jsonb_build_object('matrix', jsonb_build_object('name', ctx -> 'matrix' ->> 'name', 'bands', ctx -> 'matrix' -> 'bands'),
    'rows', coalesce(jsonb_agg(to_jsonb(x) order by x.rank desc, x.score desc nulls last, x.updated_at), '[]'),
    'open_total', (select count(*) from items)) from (
    select * from items
    where cfg ->> 'min_band' is null or rank >= coalesce((select b.ordinality from jsonb_array_elements(ctx -> 'matrix' -> 'bands') with ordinality b
      where b.value ->> 'key' = cfg ->> 'min_band'), 0)
    order by rank desc, score desc nulls last, updated_at limit coalesce((cfg ->> 'limit')::int, 5)) x;
$$;

create function private.rb_change_requests(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(x) order by x.status = 'proposed' desc, x.created_at desc), '[]')) from (
    select c.id, c.ref, c.title, c.status::text as status, c.cost_impact, c.schedule_impact_days, c.created_at, c.updated_at,
      p.code as project_code, coalesce(lv.label, c.type_list) as change_type
    from public.change_requests c join public.projects p on p.id = c.project_id
    left join public.lookup_values lv on lv.id = c.type_id
    where c.project_id = any (private.rb_projects(ctx))
      and (c.status = 'proposed' or c.updated_at >= (ctx ->> 'as_at')::date - coalesce((cfg ->> 'since_days')::int, 90))
      and coalesce(cfg -> 'statuses', '["proposed","approved","rejected"]') ? c.status::text
    limit coalesce((cfg ->> 'limit')::int, 15)) x;
$$;

create function private.rb_highlight_report_summary(ctx jsonb, cfg jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('id', r.id, 'ref', r.ref, 'project_code', p.code, 'project_name', p.name,
      'reporting_date', r.reporting_date, 'submitted_at', r.submitted_at, 'author', res.name,
      'comments', r.comments, 'accomplished', r.accomplished, 'planned', r.planned, 'decisions_needed', r.decisions_needed,
      'declared', jsonb_build_object('overall', r.overall, 'schedule', r.schedule, 'financial', r.financial, 'effort', r.effort,
        'issue', r.issue, 'benefit', r.declared_benefit),
      'evidenced', jsonb_build_object('overall', r.evidenced_overall, 'schedule', r.evidenced_schedule, 'financial', r.evidenced_financial,
        'effort', r.evidenced_effort, 'issue', r.evidenced_issue, 'benefit', r.evidenced_benefit))
    from public.status_reports r join public.projects p on p.id = r.project_id
    left join public.resources res on res.id = r.submitter_id
    where r.project_id = private.rb_single_project(ctx) and r.status = 'submitted' and r.reporting_date <= (ctx ->> 'as_at')::date
    order by r.reporting_date desc, r.submitted_at desc limit 1), jsonb_build_object('id', null));
$$;

-- Dispatcher. p_input as report_context(); p_block a BlockInstance {id, blockKey, config,
-- placement}; p_entity the deep-dive project. Unknown keys give {"unavailable": true}.
create function public.report_block_data(p_input jsonb, p_block jsonb, p_entity uuid default null)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  ctx jsonb;
  v_key text := p_block ->> 'blockKey';
  v_out jsonb;
begin
  if v_key is null or v_key !~ '^[a-z_]{2,40}$' or to_regprocedure('private.rb_' || v_key || '(jsonb,jsonb)') is null then
    return jsonb_build_object('unavailable', true, 'blockKey', v_key);
  end if;
  ctx := public.report_context(p_input) || jsonb_build_object('block_id', p_block ->> 'id', 'entity_id', p_entity);
  if p_entity is not null and not (ctx -> 'project_ids' ? p_entity::text) then
    raise exception 'That project isn''t in this report''s scope.' using errcode = '22023';
  end if;
  execute format('select private.%I($1, $2)', 'rb_' || v_key) into v_out using ctx, coalesce(p_block -> 'config', '{}'::jsonb);
  return coalesce(v_out, '{}'::jsonb);
end;
$$;

-- Metrics for the selection panel (and diffs): every project in a report's scope.
create function public.report_scope_metrics(p_input jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with ctx as (select public.report_context(p_input) as c)
  select coalesce(jsonb_agg(jsonb_build_object('project_id', pm.project_id, 'code', p.code, 'name', p.name,
      'programme', g.name, 'metrics', pm.metrics) order by p.name), '[]')
  from ctx, public.project_metrics(private.rb_projects(ctx.c), (ctx.c ->> 'as_at')::date, nullif(ctx.c ->> 'forum_id', '')::uuid,
    nullif(ctx.c ->> 'previous_report_id', '')::uuid) pm
  join public.projects p on p.id = pm.project_id left join public.programmes g on g.id = p.programme_id;
$$;

-- =========================================================== 12. System templates (§6.4)
insert into public.report_templates (organisation_id, name, description, forum_type, scope_type, is_system, blocks, selection_rules)
values (null, 'Project Board', 'Monthly project board pack: status, schedule, money, decisions and RAID for one project.',
  'project_board', 'project', true, '[
  {"id":"cover","blockKey":"report_cover","blockVersion":1,"config":{},"placement":"report"},
  {"id":"exec","blockKey":"executive_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"overall","blockKey":"overall_status","blockVersion":1,"config":{"months":6},"placement":"report"},
  {"id":"health","blockKey":"health_by_dimension","blockVersion":1,"config":{"months":6},"placement":"report"},
  {"id":"summary","blockKey":"project_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"milestones","blockKey":"milestone_slippage","blockVersion":1,"config":{"limit":8},"placement":"report"},
  {"id":"budget","blockKey":"budget_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"resources","blockKey":"resource_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"decisions","blockKey":"decisions_required","blockVersion":1,"config":{},"placement":"report"},
  {"id":"raid","blockKey":"top_raid","blockVersion":1,"config":{"limit":5},"placement":"report"},
  {"id":"deps","blockKey":"dependencies","blockVersion":1,"config":{},"placement":"report"},
  {"id":"benefits","blockKey":"benefits_summary","blockVersion":1,"config":{},"placement":"report"},
  {"id":"changes","blockKey":"change_requests","blockVersion":1,"config":{},"placement":"report"},
  {"id":"actions","blockKey":"actions_log","blockVersion":1,"config":{},"placement":"report"},
  {"id":"since","blockKey":"changes_since_last","blockVersion":1,"config":{},"placement":"report"},
  {"id":"forward","blockKey":"free_text","blockVersion":1,"title":"Forward look","config":{"heading":"Forward look"},"placement":"report"}
]', '{"mode":"any","rules":[]}');

-- ========================================================================== 13. Grants
revoke all on function private.org_risk_matrix(uuid), private.matrix_score(jsonb, integer, integer), private.matrix_band(jsonb, integer),
  private.forum_role_of(uuid), private.report_template_version(), private.can_manage_template(uuid, uuid),
  private.can_view_entity(text, uuid), private.can_edit_report(uuid), private.can_view_report(uuid), private.is_partner_viewer(uuid),
  private.partner_hidden_blocks(uuid), private.reports_guard(), private.scope_project_ids(text, uuid, jsonb),
  private.report_scheme(uuid, uuid, text, uuid), private.rag_rank(text), private.previous_report_metrics(uuid),
  private.rule_matches(jsonb, text, jsonb), private.evaluate_selection(jsonb, jsonb, jsonb), private.compute_inclusions(uuid),
  private.rb_projects(jsonb), private.rb_single_project(jsonb), private.rb_report_cover(jsonb, jsonb), private.rb_narrative(jsonb, jsonb),
  private.rb_executive_summary(jsonb, jsonb), private.rb_free_text(jsonb, jsonb), private.rb_section_heading(jsonb, jsonb),
  private.rb_overall_status(jsonb, jsonb), private.rb_health_by_dimension(jsonb, jsonb), private.rb_project_status_grid(jsonb, jsonb),
  private.rb_project_summary(jsonb, jsonb), private.rb_milestone_slippage(jsonb, jsonb), private.rb_budget_summary(jsonb, jsonb),
  private.rb_decisions_required(jsonb, jsonb), private.rb_top_raid(jsonb, jsonb), private.rb_change_requests(jsonb, jsonb),
  private.rb_highlight_report_summary(jsonb, jsonb)
  from public, anon;
grant execute on function private.org_risk_matrix(uuid), private.matrix_score(jsonb, integer, integer), private.matrix_band(jsonb, integer),
  private.forum_role_of(uuid), private.can_manage_template(uuid, uuid), private.can_view_entity(text, uuid), private.can_edit_report(uuid),
  private.can_view_report(uuid), private.is_partner_viewer(uuid), private.partner_hidden_blocks(uuid),
  private.scope_project_ids(text, uuid, jsonb), private.report_scheme(uuid, uuid, text, uuid), private.rag_rank(text),
  private.previous_report_metrics(uuid), private.rule_matches(jsonb, text, jsonb), private.evaluate_selection(jsonb, jsonb, jsonb),
  private.rb_projects(jsonb), private.rb_single_project(jsonb), private.rb_report_cover(jsonb, jsonb), private.rb_narrative(jsonb, jsonb),
  private.rb_executive_summary(jsonb, jsonb), private.rb_free_text(jsonb, jsonb), private.rb_section_heading(jsonb, jsonb),
  private.rb_overall_status(jsonb, jsonb), private.rb_health_by_dimension(jsonb, jsonb), private.rb_project_status_grid(jsonb, jsonb),
  private.rb_project_summary(jsonb, jsonb), private.rb_milestone_slippage(jsonb, jsonb), private.rb_budget_summary(jsonb, jsonb),
  private.rb_decisions_required(jsonb, jsonb), private.rb_top_raid(jsonb, jsonb), private.rb_change_requests(jsonb, jsonb),
  private.rb_highlight_report_summary(jsonb, jsonb)
  to authenticated, service_role;
revoke all on function private.is_report_pmo(uuid), private.can_approve_report(uuid), private.can_publish_report(uuid),
  public.report_permissions(uuid) from public, anon;
grant execute on function private.is_report_pmo(uuid), private.can_approve_report(uuid), private.can_publish_report(uuid),
  public.report_permissions(uuid) to authenticated, service_role;
revoke all on function public.risk_score(uuid), public.risk_band(uuid), public.project_metrics(uuid[], date, uuid, uuid),
  public.report_context(jsonb), public.report_block_data(jsonb, jsonb, uuid), public.report_scope_metrics(jsonb),
  public.refresh_report_selection(uuid), public.set_report_inclusion(uuid, uuid, text), public.reorder_report_inclusions(uuid, uuid[]),
  public.create_report(jsonb), public.save_report_as_template(uuid, text, text)
  from public, anon;
grant execute on function public.risk_score(uuid), public.risk_band(uuid), public.project_metrics(uuid[], date, uuid, uuid),
  public.report_context(jsonb), public.report_block_data(jsonb, jsonb, uuid), public.report_scope_metrics(jsonb),
  public.refresh_report_selection(uuid), public.set_report_inclusion(uuid, uuid, text), public.reorder_report_inclusions(uuid, uuid[]),
  public.create_report(jsonb), public.save_report_as_template(uuid, text, text)
  to authenticated, service_role;
