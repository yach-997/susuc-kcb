-- 课表运营后台（Supabase SQL Editor 整段执行 / 可重复执行）
-- 账号：admin
-- 初始密码：123456（登录后请尽快修改）

create extension if not exists pgcrypto with schema extensions;

create table if not exists admin_auth (
  id int primary key check (id = 1),
  username text not null default 'admin',
  password_hash text not null,
  updated_at timestamptz not null default now()
);

alter table admin_auth add column if not exists username text;
update admin_auth set username = 'admin' where username is null;
alter table admin_auth alter column username set default 'admin';
alter table admin_auth alter column username set not null;

create table if not exists admin_sessions (
  token text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists telemetry_events (
  id bigserial primary key,
  kind text not null,
  visitor_id text,
  meta jsonb,
  created_at timestamptz not null default now()
);

alter table telemetry_events drop constraint if exists telemetry_events_kind_check;
alter table telemetry_events
  add constraint telemetry_events_kind_check
  check (kind in ('page', 'import', 'import_fail'));

create index if not exists telemetry_events_kind_created_idx
  on telemetry_events (kind, created_at desc);

create index if not exists telemetry_events_visitor_idx
  on telemetry_events (visitor_id);

alter table admin_auth enable row level security;
alter table admin_sessions enable row level security;
alter table telemetry_events enable row level security;

drop policy if exists telemetry_insert_anon on telemetry_events;
create policy telemetry_insert_anon on telemetry_events
  for insert to anon, authenticated
  with check (kind in ('page', 'import', 'import_fail'));

-- 仅首次写入初始账密 admin / 123456；重复执行不会覆盖已改密码
-- 若需手动重置：update admin_auth set password_hash = extensions.crypt('新密码', extensions.gen_salt('bf')), updated_at = now() where id = 1;
insert into admin_auth (id, username, password_hash)
values (1, 'admin', extensions.crypt('123456', extensions.gen_salt('bf')))
on conflict (id) do nothing;

drop function if exists public.admin_login(text);
drop function if exists public.admin_login(text, text);

create or replace function public.admin_login(p_username text, p_password text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  ok boolean;
  tok text;
begin
  if lower(trim(coalesce(p_username, ''))) <> 'admin' then
    return json_build_object('ok', false, 'error', 'invalid_password');
  end if;

  select password_hash = extensions.crypt(p_password, password_hash)
    into ok
  from admin_auth
  where id = 1 and lower(username) = 'admin';

  if not coalesce(ok, false) then
    return json_build_object('ok', false, 'error', 'invalid_password');
  end if;

  tok := encode(gen_random_bytes(24), 'hex');
  insert into admin_sessions (token, expires_at)
  values (tok, now() + interval '30 days');

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
set search_path = public, extensions
as $$
declare
  sess boolean;
  pass_ok boolean;
begin
  if p_new is null or char_length(p_new) < 6 then
    return json_build_object('ok', false, 'error', 'password_too_short');
  end if;

  select exists (
    select 1 from admin_sessions
    where token = p_token and expires_at > now()
  ) into sess;

  if not sess then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select password_hash = extensions.crypt(p_old, password_hash)
    into pass_ok
  from admin_auth
  where id = 1;

  if not coalesce(pass_ok, false) then
    return json_build_object('ok', false, 'error', 'invalid_old_password');
  end if;

  update admin_auth
  set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf')),
      updated_at = now()
  where id = 1;

  -- 改密后踢掉其他会话，只保留当前 token
  delete from admin_sessions where token <> p_token;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.admin_stats(p_token text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess boolean;
  page_total bigint;
  import_total bigint;
  fail_total bigint;
  page_7d bigint;
  import_7d bigint;
  fail_7d bigint;
  visitors bigint;
  visitors_7d bigint;
  recent json;
  recent_fails json;
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
  select count(*) into fail_total from telemetry_events where kind = 'import_fail';
  select count(*) into page_7d
    from telemetry_events
    where kind = 'page' and created_at > now() - interval '7 days';
  select count(*) into import_7d
    from telemetry_events
    where kind = 'import' and created_at > now() - interval '7 days';
  select count(*) into fail_7d
    from telemetry_events
    where kind = 'import_fail' and created_at > now() - interval '7 days';
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
    select kind, visitor_id, created_at, meta
    from telemetry_events
    order by created_at desc
    limit 40
  ) t;

  select coalesce(json_agg(row_to_json(t)), '[]'::json)
    into recent_fails
  from (
    select kind, visitor_id, created_at, meta
    from telemetry_events
    where kind = 'import_fail'
    order by created_at desc
    limit 40
  ) t;

  return json_build_object(
    'ok', true,
    'pageTotal', page_total,
    'importTotal', import_total,
    'failTotal', fail_total,
    'page7d', page_7d,
    'import7d', import_7d,
    'fail7d', fail_7d,
    'visitors', visitors,
    'visitors7d', visitors_7d,
    'recent', recent,
    'recentFails', recent_fails
  );
end;
$$;

grant insert on table public.telemetry_events to anon, authenticated;
grant usage, select on sequence public.telemetry_events_id_seq to anon, authenticated;

grant execute on function public.admin_login(text, text) to anon, authenticated;
grant execute on function public.admin_change_password(text, text, text) to anon, authenticated;
grant execute on function public.admin_stats(text) to anon, authenticated;
