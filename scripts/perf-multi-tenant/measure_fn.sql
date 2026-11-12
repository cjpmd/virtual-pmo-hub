create or replace function pg_temp.t(p_label text, p_sql text, p_runs int default 3, p_role text default null, p_uid uuid default null)
returns text language plpgsql as $$
declare
  ms numeric[] := '{}';
  t0 timestamptz;
  i int;
begin
  for i in 1 .. p_runs loop
    begin
      if p_role is not null then
        perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
        perform set_config('request.jwt.claim.sub', p_uid::text, true);
        execute format('set local role %I', p_role);
      end if;
      t0 := clock_timestamp();
      execute p_sql;
      ms := ms || round(extract(epoch from clock_timestamp() - t0) * 1000, 0);
      raise exception using errcode = 'P0042', message = 'rollback run';
    exception when sqlstate 'P0042' then
      null;
    end;
    execute 'reset role';
  end loop;
  select array_agg(x order by x) into ms from unnest(ms) x;
  return format('%s|%s|%s|%s|%s', p_label, p_runs, ms[(p_runs + 1) / 2], ms[1], ms[p_runs]);
end $$;
