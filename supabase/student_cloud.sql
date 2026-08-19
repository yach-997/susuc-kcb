-- 课表云端备份：账号（学号）+ 密码 123456 找回
-- Supabase SQL Editor 整段执行

create table if not exists public.student_cloud (
  student_id text primary key,
  student_name text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.student_restore_hits (
  student_id text not null,
  bucket timestamptz not null,
  hits int not null default 0,
  primary key (student_id, bucket)
);

alter table public.student_cloud enable row level security;
alter table public.student_restore_hits enable row level security;

drop policy if exists student_cloud_deny on public.student_cloud;
create policy student_cloud_deny on public.student_cloud
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists student_restore_hits_deny on public.student_restore_hits;
create policy student_restore_hits_deny on public.student_restore_hits
  for all to anon, authenticated
  using (false)
  with check (false);

create or replace function public.save_student_timetable(
  p_student_id text,
  p_student_name text,
  p_payload jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  sid text;
  sname text;
begin
  sid := regexp_replace(upper(trim(coalesce(p_student_id, ''))), '\s+', '', 'g');
  sname := regexp_replace(trim(coalesce(p_student_name, '')), '\s+', '', 'g');

  if sid !~ '^[0-9A-Z]{8,16}$' then
    return json_build_object('ok', false, 'error', 'bad_id');
  end if;
  if char_length(sname) < 2 or char_length(sname) > 8 then
    return json_build_object('ok', false, 'error', 'bad_name');
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    return json_build_object('ok', false, 'error', 'bad_payload');
  end if;
  if jsonb_typeof(p_payload -> 'courses') <> 'array'
     or jsonb_array_length(p_payload -> 'courses') < 1 then
    return json_build_object('ok', false, 'error', 'bad_payload');
  end if;

  insert into public.student_cloud (student_id, student_name, payload, updated_at)
  values (sid, sname, p_payload, now())
  on conflict (student_id) do update
    set student_name = excluded.student_name,
        payload = excluded.payload,
        updated_at = excluded.updated_at;

  return json_build_object('ok', true);
end;
$$;

-- 旧版按姓名找回，换成账号 + 密码 123456
drop function if exists public.restore_student_timetable(text, text);

create or replace function public.restore_student_timetable(
  p_student_id text,
  p_password text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  sid text;
  pwd text;
  hit_bucket timestamptz;
  hit int;
  rec public.student_cloud%rowtype;
begin
  sid := regexp_replace(upper(trim(coalesce(p_student_id, ''))), '\s+', '', 'g');
  pwd := coalesce(p_password, '');
  hit_bucket := date_trunc('hour', now());

  insert into public.student_restore_hits (student_id, bucket, hits)
  values (coalesce(nullif(sid, ''), '-'), hit_bucket, 1)
  on conflict (student_id, bucket) do update
    set hits = public.student_restore_hits.hits + 1
  returning hits into hit;

  if hit > 8 then
    return json_build_object('ok', false, 'error', 'too_many');
  end if;

  if sid !~ '^[0-9A-Z]{8,16}$' then
    return json_build_object('ok', false, 'error', 'mismatch');
  end if;

  -- 统一默认密码，方便浏览器「保存密码」一键填入
  if pwd is distinct from '123456' then
    return json_build_object('ok', false, 'error', 'mismatch');
  end if;

  select * into rec from public.student_cloud where student_id = sid;
  if not found then
    return json_build_object('ok', false, 'error', 'missing');
  end if;

  return json_build_object('ok', true, 'payload', rec.payload);
end;
$$;

grant execute on function public.save_student_timetable(text, text, jsonb) to anon, authenticated;
grant execute on function public.restore_student_timetable(text, text) to anon, authenticated;
