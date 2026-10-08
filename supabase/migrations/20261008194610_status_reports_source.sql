-- status_reports.source (seed | user), like health_snapshots.source, so seeded reports can be
-- purged with the other seed data: delete from public.status_reports where source = 'seed';
alter table public.status_reports
  add column source text not null default 'user' check (source in ('seed', 'user'));
