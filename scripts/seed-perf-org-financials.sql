-- Financial data for the performance test organisation (included by seed-perf-org.sql, or run
-- on its own against an organisation seeded before Stage F2). Skips projects that already
-- have the four lines.
insert into public.budget_baselines (project_id, total, source)
select p.id, 100000 + (n % 40) * 25000, 'initial'
from generate_series(1, 500) n
join public.projects p on p.id = md5('virtual-pmo-perf:project:' || n)::uuid
where not exists (select 1 from public.budget_baselines b where b.project_id = p.id);

insert into public.cost_lines (project_id, name, category_id, spend_type, sort_order)
select p.id, l.name, lv.id, l.spend_type::public.spend_type, l.sort_order
from generate_series(1, 500) n
join public.projects p on p.id = md5('virtual-pmo-perf:project:' || n)::uuid
cross join (values ('Staff', 'Staff', 'operating', 1), ('Contractors', 'Contractors', 'operating', 2),
                   ('Licences', 'Licences', 'operating', 3), ('Hardware', 'Hardware', 'capital', 4)) l(name, category, spend_type, sort_order)
join public.lookup_values lv on lv.organisation_id = p.organisation_id and lv.list_key = 'cost_category' and lv.value = l.category
on conflict do nothing;

insert into public.financial_values (cost_line_id, period_month, kind, amount)
select cl.id, (c.cutoff + make_interval(months => m))::date, k.kind::public.financial_kind,
  -- Whole pounds, rounded down, so phasing never exceeds the baseline by rounding.
  floor(case k.kind
    when 'budget' then c.budget * sh.share / 24
    else c.budget * sh.share / 24 * case when n % 7 = 0 then 1.15 else 1 end
         * case when k.kind = 'actual' and m = 1 and n % 11 = 0 then 1.4 else 1 end
  end)
from generate_series(1, 500) n
join public.projects p on p.id = md5('virtual-pmo-perf:project:' || n)::uuid
cross join lateral (select 100000 + (n % 40) * 25000 as budget, private.financial_cutoff(p.organisation_id) as cutoff) c(budget, cutoff)
join public.cost_lines cl on cl.project_id = p.id and cl.name in ('Staff', 'Contractors', 'Licences', 'Hardware')
cross join lateral (select case cl.name when 'Staff' then 0.4 when 'Contractors' then 0.3 when 'Licences' then 0.2 else 0.1 end) sh(share)
cross join generate_series(-11, 12) m
cross join (values ('budget'), ('actual'), ('forecast')) k(kind)
where (k.kind = 'budget')
   or (k.kind = 'actual' and (m <= 0 or (m = 1 and n % 11 = 0)))
   or (k.kind = 'forecast' and m >= 1)
on conflict (cost_line_id, period_month, kind) do nothing;
