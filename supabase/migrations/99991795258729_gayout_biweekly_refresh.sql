-- GayOut venue pages: refresh each known page every 2 weeks, half of them each week.
--
-- gayout_save_inventory re-queued every known detail page each new week: a
-- page was skipped only when fetched in the current week with an unchanged
-- lastmod, and the GayOut sitemap carries no lastmod. Every page needs the
-- Firecrawl stealth proxy (direct fetch, Jina and headless Chromium all get a
-- Cloudflare challenge), so ~1,337 venue pages cost ~1,337 credits a week and
-- the run of 2026-11-18 failed with E_GAYOUT_PROVIDER_QUOTA.
--
-- New rule for the places inventory: a known page fetched last week is kept
-- unless it falls in this week's half (stable per URL, alternating by week).
-- New pages, changed lastmod, pages older than two weeks, and every events
-- page are fetched as before. Patched from the live body (exactly-once anchor)
-- rather than restated.
do $patch$
declare
  v_def text := pg_get_functiondef('public.gayout_save_inventory'::regproc);
  v_from text := 'old.last_fetched_at>=week_start';
  v_to text := 'old.last_fetched_at>=week_start-case when p_inventory=''places'' and (((extract(epoch from week_start)/604800)::bigint+abs(hashtext(job->>''url''))::bigint)%2)=1 then interval ''7 days'' else interval ''0 days'' end';
begin
  if position(v_to in v_def) > 0 then
    raise notice 'gayout_save_inventory already patched';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'gayout_save_inventory: expected exactly one anchor %', v_from;
  end if;
  execute replace(v_def, v_from, v_to);
end
$patch$;

do $verify$
declare v_def text := regexp_replace(pg_get_functiondef('public.gayout_save_inventory'::regproc), '--[^' || chr(10) || ']*', '', 'g');
begin
  if position('hashtext(job->>''url'')' in v_def) = 0 or position('p_inventory=''places''' in v_def) = 0 then
    raise exception 'gayout_save_inventory: biweekly refresh rule missing after patch';
  end if;
end
$verify$;
