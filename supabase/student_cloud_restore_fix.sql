-- 只改找回函数：账号（学号）+ 密码 123456
-- 在 Supabase → SQL Editor 整段执行这一份即可

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

  if hit > 20 then
    return json_build_object('ok', false, 'error', 'too_many');
  end if;

  if sid !~ '^[0-9A-Z]{8,16}$' then
    return json_build_object('ok', false, 'error', 'mismatch');
  end if;

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

grant execute on function public.restore_student_timetable(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
