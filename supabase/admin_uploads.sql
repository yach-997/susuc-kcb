-- 后台：静默收 PDF + 按日查看/下载
-- Supabase SQL Editor 整段执行

-- 1) 存储桶（私有；下载用签名链接）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'timetable-uploads',
  'timetable-uploads',
  false,
  5242880,
  array['application/pdf']::text[]
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    public = false;

drop policy if exists timetable_uploads_insert on storage.objects;
create policy timetable_uploads_insert on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'timetable-uploads'
    and name like 'pdf/%'
  );

drop policy if exists timetable_uploads_select on storage.objects;
create policy timetable_uploads_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'timetable-uploads');

-- 2) 按日 / 近 N 日报表（需已登录 token）
drop function if exists public.admin_day_report(text, date);
create or replace function public.admin_day_report(
  p_token text,
  p_day date,
  p_days int default 1
)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  sess boolean;
  span int;
  day_start timestamptz;
  day_end timestamptz;
  page_count bigint;
  import_count bigint;
  fail_count bigint;
  imports json;
  fails json;
  events json;
begin
  select exists (
    select 1 from public.admin_sessions
    where token = p_token and expires_at > now()
  ) into sess;

  if not sess then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;

  span := greatest(1, least(coalesce(p_days, 1), 90));
  day_end := ((p_day + 1)::timestamp AT TIME ZONE 'Asia/Shanghai');
  day_start := (((p_day - (span - 1))::timestamp) AT TIME ZONE 'Asia/Shanghai');

  select count(*) into page_count
    from telemetry_events
    where kind = 'page' and created_at >= day_start and created_at < day_end;
  select count(*) into import_count
    from telemetry_events
    where kind = 'import' and created_at >= day_start and created_at < day_end;
  select count(*) into fail_count
    from telemetry_events
    where kind = 'import_fail' and created_at >= day_start and created_at < day_end;

  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json)
    into imports
  from (
    select id, kind, visitor_id, created_at, meta
    from telemetry_events
    where kind = 'import' and created_at >= day_start and created_at < day_end
    order by created_at desc
    limit 400
  ) t;

  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json)
    into fails
  from (
    select id, kind, visitor_id, created_at, meta
    from telemetry_events
    where kind = 'import_fail' and created_at >= day_start and created_at < day_end
    order by created_at desc
    limit 400
  ) t;

  select coalesce(json_agg(row_to_json(t) order by t.created_at desc), '[]'::json)
    into events
  from (
    select id, kind, visitor_id, created_at, meta
    from telemetry_events
    where created_at >= day_start and created_at < day_end
    order by created_at desc
    limit 500
  ) t;

  return json_build_object(
    'ok', true,
    'day', p_day,
    'days', span,
    'pageCount', page_count,
    'importCount', import_count,
    'failCount', fail_count,
    'imports', imports,
    'fails', fails,
    'events', events
  );
end;
$$;

grant execute on function public.admin_day_report(text, date, int) to anon, authenticated;
