-- 后台：用户列表 + 问题反馈（可按日筛选）
-- Supabase SQL Editor 整段执行（需已有 admin.sql）

-- 1) 反馈表
create table if not exists public.user_feedback (
  id bigserial primary key,
  visitor_id text,
  content text not null check (char_length(trim(content)) between 2 and 2000),
  contact text,
  status text not null default 'new' check (status in ('new', 'read', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists user_feedback_created_idx
  on public.user_feedback (created_at desc);
create index if not exists user_feedback_status_idx
  on public.user_feedback (status, created_at desc);

alter table public.user_feedback enable row level security;

drop policy if exists feedback_insert_anon on public.user_feedback;
create policy feedback_insert_anon on public.user_feedback
  for insert to anon, authenticated
  with check (true);

drop policy if exists feedback_select_none on public.user_feedback;
create policy feedback_select_none on public.user_feedback
  for select to anon, authenticated
  using (false);

-- 2) 用户提交反馈
create or replace function public.submit_feedback(
  p_visitor_id text,
  p_content text,
  p_contact text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  body text;
  contact text;
  new_id bigint;
begin
  body := trim(coalesce(p_content, ''));
  if char_length(body) < 2 then
    return json_build_object('ok', false, 'error', 'content_too_short');
  end if;
  if char_length(body) > 2000 then
    return json_build_object('ok', false, 'error', 'content_too_long');
  end if;

  contact := nullif(trim(coalesce(p_contact, '')), '');
  if contact is not null and char_length(contact) > 120 then
    contact := left(contact, 120);
  end if;

  insert into public.user_feedback (visitor_id, content, contact)
  values (nullif(trim(coalesce(p_visitor_id, '')), ''), body, contact)
  returning id into new_id;

  return json_build_object('ok', true, 'id', new_id);
end;
$$;

grant execute on function public.submit_feedback(text, text, text) to anon, authenticated;

-- 3) 后台：访客列表（可按指定日 / 近 N 天）
drop function if exists public.admin_visitors(text, int);
drop function if exists public.admin_visitors(text, date, int);
create or replace function public.admin_visitors(
  p_token text,
  p_day date default null,
  p_days int default 1,
  p_limit int default 100
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  sess boolean;
  lim int;
  span int;
  day_start timestamptz;
  day_end timestamptz;
  total bigint;
  rows json;
begin
  select exists (
    select 1 from public.admin_sessions
    where token = p_token and expires_at > now()
  ) into sess;

  if not sess then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  lim := greatest(1, least(coalesce(p_limit, 100), 300));
  span := greatest(1, least(coalesce(p_days, 1), 90));

  if p_day is null then
    select count(distinct visitor_id) into total
    from telemetry_events
    where visitor_id is not null and visitor_id <> '';

    select coalesce(json_agg(row_to_json(t) order by t.last_seen desc), '[]'::json)
      into rows
    from (
      select
        visitor_id,
        count(*)::int as event_count,
        count(*) filter (where kind = 'page')::int as page_count,
        count(*) filter (where kind = 'import')::int as import_count,
        count(*) filter (where kind = 'import_fail')::int as fail_count,
        min(created_at) as first_seen,
        max(created_at) as last_seen
      from telemetry_events
      where visitor_id is not null and visitor_id <> ''
      group by visitor_id
      order by max(created_at) desc
      limit lim
    ) t;
  else
    day_end := ((p_day + 1)::timestamp AT TIME ZONE 'Asia/Shanghai');
    day_start := (((p_day - (span - 1))::timestamp) AT TIME ZONE 'Asia/Shanghai');

    select count(distinct visitor_id) into total
    from telemetry_events
    where visitor_id is not null and visitor_id <> ''
      and created_at >= day_start and created_at < day_end;

    select coalesce(json_agg(row_to_json(t) order by t.last_seen desc), '[]'::json)
      into rows
    from (
      select
        visitor_id,
        count(*)::int as event_count,
        count(*) filter (where kind = 'page')::int as page_count,
        count(*) filter (where kind = 'import')::int as import_count,
        count(*) filter (where kind = 'import_fail')::int as fail_count,
        min(created_at) as first_seen,
        max(created_at) as last_seen
      from telemetry_events
      where visitor_id is not null and visitor_id <> ''
        and created_at >= day_start and created_at < day_end
      group by visitor_id
      order by max(created_at) desc
      limit lim
    ) t;
  end if;

  return json_build_object(
    'ok', true,
    'total', total,
    'day', p_day,
    'days', span,
    'visitors', rows
  );
end;
$$;

grant execute on function public.admin_visitors(text, date, int, int) to anon, authenticated;

-- 4) 后台：反馈列表（可按日 + 状态）
drop function if exists public.admin_feedback_list(text, int);
drop function if exists public.admin_feedback_list(text, date, text, int);
create or replace function public.admin_feedback_list(
  p_token text,
  p_day date default null,
  p_status text default null,
  p_days int default 1,
  p_limit int default 80
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  sess boolean;
  lim int;
  span int;
  day_start timestamptz;
  day_end timestamptz;
  new_count bigint;
  rows json;
  st text;
begin
  select exists (
    select 1 from public.admin_sessions
    where token = p_token and expires_at > now()
  ) into sess;

  if not sess then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  lim := greatest(1, least(coalesce(p_limit, 80), 200));
  span := greatest(1, least(coalesce(p_days, 1), 90));
  st := nullif(trim(coalesce(p_status, '')), '');
  if st is not null and st not in ('new', 'read', 'done', 'all') then
    st := null;
  end if;
  if st = 'all' then st := null; end if;

  if p_day is null then
    select count(*) into new_count from user_feedback where status = 'new';

    select coalesce(json_agg(row_to_json(t)), '[]'::json)
      into rows
    from (
      select id, visitor_id, content, contact, status, created_at
      from user_feedback
      where (st is null or status = st)
      order by
        case status when 'new' then 0 when 'read' then 1 else 2 end,
        created_at desc
      limit lim
    ) t;
  else
    day_end := ((p_day + 1)::timestamp AT TIME ZONE 'Asia/Shanghai');
    day_start := (((p_day - (span - 1))::timestamp) AT TIME ZONE 'Asia/Shanghai');

    select count(*) into new_count
    from user_feedback
    where status = 'new'
      and created_at >= day_start and created_at < day_end;

    select coalesce(json_agg(row_to_json(t)), '[]'::json)
      into rows
    from (
      select id, visitor_id, content, contact, status, created_at
      from user_feedback
      where created_at >= day_start and created_at < day_end
        and (st is null or status = st)
      order by
        case status when 'new' then 0 when 'read' then 1 else 2 end,
        created_at desc
      limit lim
    ) t;
  end if;

  return json_build_object(
    'ok', true,
    'newCount', new_count,
    'day', p_day,
    'days', span,
    'items', rows
  );
end;
$$;

grant execute on function public.admin_feedback_list(text, date, text, int, int) to anon, authenticated;

-- 5) 后台：更新反馈状态
create or replace function public.admin_feedback_set_status(
  p_token text,
  p_id bigint,
  p_status text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  sess boolean;
begin
  select exists (
    select 1 from public.admin_sessions
    where token = p_token and expires_at > now()
  ) into sess;

  if not sess then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  if p_status not in ('new', 'read', 'done') then
    return json_build_object('ok', false, 'error', 'invalid_status');
  end if;

  update user_feedback
  set status = p_status
  where id = p_id;

  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_feedback_set_status(text, bigint, text) to anon, authenticated;
