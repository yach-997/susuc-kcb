-- 修复：function crypt(text, text) does not exist
-- 在 Supabase → SQL → 整段执行本文件即可

create extension if not exists pgcrypto with schema extensions;

-- 确保账密存在（admin / 123456）
create table if not exists public.admin_auth (
  id int primary key check (id = 1),
  username text not null default 'admin',
  password_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_auth add column if not exists username text;
update public.admin_auth set username = 'admin' where username is null;

insert into public.admin_auth (id, username, password_hash)
values (1, 'admin', extensions.crypt('123456', extensions.gen_salt('bf')))
on conflict (id) do update
set username = 'admin',
    password_hash = extensions.crypt('123456', extensions.gen_salt('bf')),
    updated_at = now();

create table if not exists public.admin_sessions (
  token text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

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
  from public.admin_auth
  where id = 1 and lower(username) = 'admin';

  if not coalesce(ok, false) then
    return json_build_object('ok', false, 'error', 'invalid_password');
  end if;

  tok := encode(gen_random_bytes(24), 'hex');
  insert into public.admin_sessions (token, expires_at)
  values (tok, now() + interval '7 days');

  delete from public.admin_sessions where expires_at < now();

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
    select 1 from public.admin_sessions
    where token = p_token and expires_at > now()
  ) into sess;

  if not sess then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select password_hash = extensions.crypt(p_old, password_hash)
    into pass_ok
  from public.admin_auth
  where id = 1;

  if not coalesce(pass_ok, false) then
    return json_build_object('ok', false, 'error', 'invalid_old_password');
  end if;

  update public.admin_auth
  set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf')),
      updated_at = now()
  where id = 1;

  return json_build_object('ok', true);
end;
$$;

grant execute on function public.admin_login(text, text) to anon, authenticated;
grant execute on function public.admin_change_password(text, text, text) to anon, authenticated;
