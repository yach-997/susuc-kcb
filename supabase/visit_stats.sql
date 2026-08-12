-- 前台访问量：每次打开/刷新 +1；另按日统计今日次数
-- Supabase SQL Editor 整段执行

create table if not exists public.site_counters (
  id text primary key,
  value bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_daily_views (
  day date primary key,
  views bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.site_counters (id, value)
values ('pageviews', 0)
on conflict (id) do nothing;

alter table public.site_counters enable row level security;
alter table public.site_daily_views enable row level security;

drop policy if exists site_counters_deny on public.site_counters;
create policy site_counters_deny on public.site_counters
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists site_daily_views_deny on public.site_daily_views;
create policy site_daily_views_deny on public.site_daily_views
  for all to anon, authenticated
  using (false)
  with check (false);

-- 兼容旧版：若曾建 site_visit_days 可保留，本函数不再依赖
drop function if exists public.bump_pageview(text);
drop function if exists public.bump_pageview();

create or replace function public.bump_pageview(p_visitor_id text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  d date;
  real_total bigint;
  today_n bigint;
begin
  d := (timezone('Asia/Shanghai', now()))::date;

  insert into public.site_counters (id, value, updated_at)
  values ('pageviews', 1, now())
  on conflict (id) do update
  set value = public.site_counters.value + 1,
      updated_at = excluded.updated_at
  returning value into real_total;

  insert into public.site_daily_views (day, views, updated_at)
  values (d, 1, now())
  on conflict (day) do update
  set views = public.site_daily_views.views + 1,
      updated_at = excluded.updated_at
  returning views into today_n;

  return json_build_object(
    'ok', true,
    'realTotal', coalesce(real_total, 0),
    'todayVisitors', coalesce(today_n, 0)
  );
end;
$$;

grant execute on function public.bump_pageview(text) to anon, authenticated;
