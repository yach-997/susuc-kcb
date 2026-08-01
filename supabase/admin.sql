-- 课表运营后台（Supabase SQL Editor 整段执行）
-- 初始管理员密码：KcbAdmin#0826
-- 登录后请立刻在后台改密

create extension if not exists pgcrypto;

create table if not exists admin_auth (
  id int primary key check (id = 1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  token text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists telemetry_events (
  id bigserial primary key,
  kind text not null check (kind in ('page', 'import')),
  visitor_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists telemetry_events_kind_created_idx
  on telemetry_events (kind, created_at desc);

create index if not exists telemetry_events_visitor_idx
  on telemetry_events (visitor_id);

alter table admin_auth enable row level security;
alter table admin_sessions enable row level security;
alter table telemetry_events enable row level security;

-- 禁止直接读敏感表；遥测仅允许匿名插入
drop policy if exists telemetry_insert_anon on telemetry_events;
create policy telemetry_insert_anon on telemetry_events
  for insert to anon, authenticated
  with check (kind in ('page', 'import'));

insert into admin_auth (id, password_hash)
values (1, crypt('KcbAdmin#0826', gen_salt('bf')))
on conflict (id) do nothing;

create or replace function public.admin_login(p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  ok boolean;
  tok text;
begin
  select password_hash = crypt(p_password, password_hash)
    into ok
  from admin_auth
  where id = 1;

  if not coalesce(ok, false) then
    return json_build_object('ok', false, 'error', 'invalid_password');
  end if;

  tok := encode(gen_random_bytes(24), 'hex');
  insert into admin_sessions (token, expires_at)
  values (tok, now() + interval '7 days');

  delete from admin_sessions where expires_at < now();

  return json_build_object('ok', true, 'token', tok);
end;
$$;

create or replace function public.admin_change_password(
  p_token text,
  p_old text,
  p_new text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  sess boolean;
  pass_ok boolean;
begin
  if p_new is null or char_length(p_new) < 8 then
    return json_build_object('ok', false, 'error', 'password_too_short');
  end if;

  select exists (
    select 1 from admin_sessions
    where token = p_token and expires_at > now()
  ) into sess;

  if not sess then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select password_hash = crypt(p_old, password_hash)
    into pass_ok
  from admin_auth
  where id = 1;

  if not coalesce(pass_ok, false) then
    return json_build_object('ok', false, 'error', 'invalid_old_password');
  end if;

  update admin_auth
  set password_hash = crypt(p_new, gen_salt('bf')),
      updated_at = now()
  where id = 1;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_stats(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  sess boolean;
  page_total bigint;
  import_total bigint;
  page_7d bigint;
  import_7d bigint;
  visitors bigint;
  visitors_7d bigint;
  recent json;
begin
  select exists (
    select 1 from admin_sessions
    where token = p_token and expires_at > now()
  ) into sess;

  if not sess then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select count(*) into page_total from telemetry_events where kind = 'page';
  select count(*) into import_total from telemetry_events where kind = 'import';
  select count(*) into page_7d
    from telemetry_events
    where kind = 'page' and created_at > now() - interval '7 days';
  select count(*) into import_7d
    from telemetry_events
    where kind = 'import' and created_at > now() - interval '7 days';
  select count(distinct visitor_id) into visitors
    from telemetry_events
    where visitor_id is not null and visitor_id <> '';
  select count(distinct visitor_id) into visitors_7d
    from telemetry_events
    where visitor_id is not null and visitor_id <> ''
      and created_at > now() - interval '7 days';

  select coalesce(json_agg(row_to_json(t)), '[]'::json)
    into recent
  from (
    select kind, visitor_id, created_at
    from telemetry_events
    order by created_at desc
    limit 30
  ) t;

  return json_build_object(
    'ok', true,
    'pageTotal', page_total,
    'importTotal', import_total,
    'page7d', page_7d,
    'import7d', import_7d,
    'visitors', visitors,
    'visitors7d', visitors_7d,
    'recent', recent
  );
end;
$$;

grant insert on table public.telemetry_events to anon, authenticated;
grant usage, select on sequence public.telemetry_events_id_seq to anon, authenticated;

grant execute on function public.admin_login(text) to anon, authenticated;
grant execute on function public.admin_change_password(text, text, text) to anon, authenticated;
grant execute on function public.admin_stats(text) to anon, authenticated;
