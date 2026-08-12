-- 前台访问量：共享真实计数 + 今日独立访客
-- Supabase SQL Editor 整段执行

create table if not exists public.site_counters (
  id text primary key,
  value bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_visit_days (
  visitor_id text not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (visitor_id, day)
);

create index if not exists site_visit_days_day_idx
  on public.site_visit_days (day);

insert into public.site_counters (id, value)
values ('unique_days', 0)
on conflict (id) do nothing;

alter table public.site_counters enable row level security;
alter table public.site_visit_days enable row level security;

drop policy if exists site_counters_deny on public.site_counters;
create policy site_counters_deny on public.site_counters
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists site_visit_days_deny on public.site_visit_days;
create policy site_visit_days_deny on public.site_visit_days
  for all to anon, authenticated
  using (false)
  with check (false);

-- 每访客每天只给累计 +1；返回累计真实天数访问与今日人数
create or replace function public.bump_pageview(p_visitor_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  vid text;
  d date;
  inserted int;
  real_total bigint;
  today_n bigint;
begin
  vid := left(trim(coalesce(p_visitor_id, '')), 80);
  if vid = '' or length(vid) < 8 then
    vid := 'anon-unknown';
  end if;

  d := (timezone('Asia/Shanghai', now()))::date;

  insert into public.site_visit_days (visitor_id, day)
  values (vid, d)
  on conflict (visitor_id, day) do nothing;
  get diagnostics inserted = row_count;

  if inserted > 0 then
    insert into public.site_counters (id, value, updated_at)
    values ('unique_days', 1, now())
    on conflict (id) do update
    set value = public.site_counters.value + 1,
        updated_at = excluded.updated_at;
  end if;

  select coalesce(value, 0) into real_total
  from public.site_counters
  where id = 'unique_days';

  select count(*)::bigint into today_n
  from public.site_visit_days
  where day = d;

  return json_build_object(
    'ok', true,
    'realTotal', coalesce(real_total, 0),
    'todayVisitors', coalesce(today_n, 0)
  );
end;
$$;

grant execute on function public.bump_pageview(text) to anon, authenticated;
