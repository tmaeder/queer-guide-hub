-- Monthly check: flag image assets whose Wikimedia source file has been deleted.
--
-- image_assets keeps serving a stored copy after Wikimedia Commons deletes the
-- source file, and nothing re-checks it. Commons deletes mostly for copyright:
-- "no permission", copyright violation, derivative of non-free content. A
-- one-off check on 2026-11-03 covered all 3,104 Wikimedia file names behind
-- active assets and found 10 deleted files, every one still status = 'active',
-- including two portraits that were live on public personality pages (a
-- book-cover portrait whose uploader never documented permission, and a
-- memorial photo whose banner portrait is copyrighted). They were flagged by
-- hand; this keeps the check running.
--
-- run_commons_deleted_asset_check() asks the MediaWiki API whether each file
-- still exists: 50 titles per request, Commons for /wikipedia/commons/ and
-- Special:FilePath URLs, English Wikipedia for /wikipedia/en/. Other wikis
-- (7 Wikinews files) are skipped. Titles the API normalizes are mapped back
-- through query.normalized, so coverage is exact.
--
-- An asset is flagged only when the API answers that its file is MISSING. A
-- request that fails flags nothing and is counted in chunk_failures, so an
-- outage cannot read as a mass deletion. If more than p_max_flags files come
-- back missing in one run it flags none and returns refused = true: that is an
-- API change or a parsing bug, not a month of deletions (the backlog was 10).
-- The deletion-log comment is recorded in flagged_reason when Commons has one.
--
-- Flagging is the existing convention (status = 'flagged' + flagged_reason) and
-- is reversible. personality_public_profiles and every other reader only use
-- status = 'active' assets, so a flagged asset stops being served.
--
-- Runs synchronous HTTP through the http extension: about 65 API requests with
-- a 0.3 s pause between them, roughly a minute. Monthly on the 3rd at 04:17 UTC.

create or replace function public.run_commons_deleted_asset_check(
  p_dry_run boolean default false,
  p_max_flags integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  rec record;
  r extensions.http_response;
  v_titles integer := 0;
  v_answered integer := 0;
  v_chunk_failures integer := 0;
  v_missing integer := 0;
  v_flagged integer := 0;
  v_refused boolean := false;
  v_reason text;
  v_list jsonb := '[]'::jsonb;
begin
  if p_max_flags is null or p_max_flags < 1 or p_max_flags > 1000 then
    raise exception 'p_max_flags must be between 1 and 1000, got %', p_max_flags using errcode = '22023';
  end if;

  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT', '20');

  create temp table if not exists _cdac_assets(id uuid, wiki text, title text) on commit drop;
  create temp table if not exists _cdac_seen(wiki text, title text, missing boolean) on commit drop;
  create temp table if not exists _cdac_norm(wiki text, f text, t text) on commit drop;
  truncate _cdac_assets, _cdac_seen, _cdac_norm;

  insert into _cdac_assets
  select s.id, s.wiki, 'File:' || replace(btrim((
      select convert_from(string_agg(
               case when m.t[1] ~ '^%' then decode(substr(m.t[1], 2, 2), 'hex') else convert_to(m.t[1], 'UTF8') end,
               ''::bytea order by m.o), 'UTF8')
      from regexp_matches(s.fname, '(%[0-9A-Fa-f]{2}|[^%]+)', 'g') with ordinality m(t, o))), '_', ' ')
  from (
    select ia.id,
           case when ia.url ~ '/wikipedia/en/' then 'en' else 'commons' end as wiki,
           coalesce(
             substring(split_part(ia.url, '?', 1) from '/wikipedia/(?:commons|en)/thumb/[0-9a-f]/[0-9a-f]{2}/([^/]+)/'),
             substring(split_part(ia.url, '?', 1) from '/wikipedia/(?:commons|en)/[0-9a-f]/[0-9a-f]{2}/([^/]+)$'),
             substring(split_part(ia.url, '?', 1) from 'Special:FilePath/([^?]+)$')) as fname
    from public.image_assets ia
    where ia.status = 'active'
      and (ia.url ~ 'wikimedia\.org/wikipedia/(commons|en)/' or ia.url ~ 'commons\.wikimedia\.org/wiki/Special:FilePath/')
  ) s
  where s.fname is not null;

  select count(distinct (wiki, title)) into v_titles from _cdac_assets;

  for rec in
    select wiki, array_agg(title) as chunk
    from (select wiki, title, (row_number() over (partition by wiki order by title) - 1) / 50 as b
          from (select distinct wiki, title from _cdac_assets) d) x
    group by wiki, b
  loop
    perform pg_sleep(0.3);
    begin
      r := extensions.http((
        'GET',
        'https://' || case when rec.wiki = 'en' then 'en.wikipedia.org' else 'commons.wikimedia.org' end
          || '/w/api.php?action=query&format=json&formatversion=2&titles='
          || extensions.urlencode(array_to_string(rec.chunk, '|')),
        array[extensions.http_header('User-Agent', 'queer.guide-commons-asset-check/1.0 (https://queer.guide)')],
        null, null)::extensions.http_request);
    exception when others then
      v_chunk_failures := v_chunk_failures + 1;
      continue;
    end;
    if r.status <> 200 then
      v_chunk_failures := v_chunk_failures + 1;
      continue;
    end if;
    insert into _cdac_seen
      select rec.wiki, p ->> 'title', coalesce((p ->> 'missing')::boolean, false)
      from jsonb_array_elements(r.content::jsonb -> 'query' -> 'pages') p;
    insert into _cdac_norm
      select rec.wiki, n ->> 'from', n ->> 'to'
      from jsonb_array_elements(coalesce(r.content::jsonb -> 'query' -> 'normalized', '[]'::jsonb)) n;
  end loop;

  select count(*) into v_answered
  from (select distinct wiki, title from _cdac_assets) t
  where exists (select 1 from _cdac_seen s
                where s.wiki = t.wiki
                  and s.title = coalesce((select n.t from _cdac_norm n where n.wiki = t.wiki and n.f = t.title limit 1), t.title));

  create temp table if not exists _cdac_missing(id uuid, wiki text, title text) on commit drop;
  truncate _cdac_missing;
  insert into _cdac_missing
  select a.id, a.wiki, a.title
  from _cdac_assets a
  join _cdac_seen s on s.wiki = a.wiki and s.missing
   and s.title = coalesce((select n.t from _cdac_norm n where n.wiki = a.wiki and n.f = a.title limit 1), a.title);

  select count(*) into v_missing from _cdac_missing;
  select coalesce(jsonb_agg(jsonb_build_object('asset', id, 'title', title)), '[]'::jsonb) into v_list
  from (select id, title from _cdac_missing order by title limit 50) l;

  if v_missing > p_max_flags then
    v_refused := true;
  elsif not p_dry_run then
    for rec in select * from _cdac_missing loop
      v_reason := null;
      begin
        perform pg_sleep(0.3);
        r := extensions.http((
          'GET',
          'https://' || case when rec.wiki = 'en' then 'en.wikipedia.org' else 'commons.wikimedia.org' end
            || '/w/api.php?action=query&format=json&formatversion=2&list=logevents&letype=delete&lelimit=1&letitle='
            || extensions.urlencode(rec.title),
          array[extensions.http_header('User-Agent', 'queer.guide-commons-asset-check/1.0 (https://queer.guide)')],
          null, null)::extensions.http_request);
        if r.status = 200 then
          select left((e ->> 'timestamp') || ': ' || (e ->> 'comment'), 300) into v_reason
          from jsonb_array_elements(r.content::jsonb -> 'query' -> 'logevents') e limit 1;
        end if;
      exception when others then
        v_reason := null;
      end;

      update public.image_assets
      set status = 'flagged',
          flagged_reason = 'Source file deleted from Wikimedia (' || rec.wiki || '): '
            || coalesce(v_reason, 'no deletion record found')
            || ' (run_commons_deleted_asset_check ' || to_char(now(), 'YYYY-MM-DD') || ')',
          updated_at = now()
      where id = rec.id and status = 'active';
      if found then
        v_flagged := v_flagged + 1;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'titles', v_titles,
    'answered', v_answered,
    'chunk_failures', v_chunk_failures,
    'missing', v_missing,
    'flagged', v_flagged,
    'refused', v_refused,
    'dry_run', p_dry_run,
    'missing_sample', v_list
  );
end;
$function$;

revoke all on function public.run_commons_deleted_asset_check(boolean, integer) from public, anon, authenticated;
grant execute on function public.run_commons_deleted_asset_check(boolean, integer) to service_role;

insert into public.admin_automations (slug, name, description, managed_by, enabled, "trigger", schedule, action)
values (
  'commons_deleted_asset_check',
  'commons_deleted_asset_check',
  'Monthly: asks the Wikimedia Commons / English Wikipedia API whether the source file behind each active Wikimedia-sourced image asset still exists, and flags assets whose file was deleted (usually for copyright), recording the deletion-log reason. Flags nothing for failed requests; refuses to flag if more than 100 files come back missing in one run.',
  'system',
  true,
  jsonb_build_object('type', 'schedule'),
  '17 4 3 * *',
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'commons_deleted_asset_check',
    'command', 'select public.run_commons_deleted_asset_check();'
  )
)
on conflict (slug) do nothing;

select cron.schedule(
  'commons_deleted_asset_check',
  '17 4 3 * *',
  public.admin_automation_effective_command(
    'commons_deleted_asset_check',
    (select action ->> 'command' from public.admin_automations where slug = 'commons_deleted_asset_check')))
where not exists (select 1 from cron.job where jobname = 'commons_deleted_asset_check');

do $verify$
begin
  -- P1: scheduled and registered.
  if not exists (select 1 from cron.job where jobname = 'commons_deleted_asset_check' and active) then
    raise exception 'P1 failed: cron job commons_deleted_asset_check is not scheduled';
  end if;
  if not exists (select 1 from public.admin_automations where slug = 'commons_deleted_asset_check' and enabled) then
    raise exception 'P1 failed: admin_automations row commons_deleted_asset_check missing or disabled';
  end if;

  -- P2: not reachable by anon or authenticated.
  if has_function_privilege('anon', 'public.run_commons_deleted_asset_check(boolean, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.run_commons_deleted_asset_check(boolean, integer)', 'execute') then
    raise exception 'P2 failed: run_commons_deleted_asset_check is executable by anon or authenticated';
  end if;

  -- P3: the circuit-breaker bound is validated.
  begin
    perform public.run_commons_deleted_asset_check(true, 0);
    raise exception 'P3 failed: p_max_flags = 0 was accepted';
  exception when sqlstate '22023' then
    null;
  end;
end;
$verify$;
