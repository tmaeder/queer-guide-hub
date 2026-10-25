-- get_news_front: an unscored article no longer ranks as trust 0.
--
-- news_articles.trust_score has column DEFAULT 0 and is only computed by the
-- nightly run_news_trust_recompute. get_news_front multiplies hotness by
-- coalesce(trust_score, quality_score, 50)/100, and coalesce only falls through
-- on NULL, so every article ingested since the last recompute had hotness 0
-- and ranked LAST on the homepage for up to a day: the freshest stories were
-- the ones least likely to be shown.
--
-- Measured 2026-10-25: 37 rows carried trust_score = 0, every one with
-- last_verified_at IS NULL (never scored), and zero rows had a COMPUTED score
-- of 0. The recompute stamps last_verified_at on every row it writes, so
-- "0 and never verified" identifies the default exactly, and a genuinely
-- computed 0 still counts as 0.
--
-- The live body is patched via pg_get_functiondef with exactly-once anchors
-- rather than restated, so whatever else has changed in it since the last
-- migration that defined it is preserved.

do $patch$
declare
  v_src text;
  v_a1_from constant text := 'na.media_type, na.audio_url, na.duration_seconds, na.trust_score, na.quality_score,';
  v_a1_to   constant text := 'na.media_type, na.audio_url, na.duration_seconds, na.trust_score, na.quality_score, na.last_verified_at,';
  v_a2_from constant text := '(coalesce(b.trust_score, b.quality_score, 50)/100.0)';
  v_a2_to   constant text := '(coalesce(case when b.trust_score = 0 and b.last_verified_at is null then null else b.trust_score end, b.quality_score, 50)/100.0)';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api_private' and p.proname = 'get_news_front';

  if v_src is null then
    raise exception 'api_private.get_news_front not found';
  end if;

  -- Already applied: no-op (soft on preconditions).
  if position(v_a2_to in v_src) > 0 then
    raise notice 'get_news_front already treats unscored trust as missing; nothing to do';
    return;
  end if;

  if (length(v_src) - length(replace(v_src, v_a1_from, ''))) / length(v_a1_from) <> 1 then
    raise exception 'anchor 1 (base column list) not found exactly once in get_news_front';
  end if;
  if (length(v_src) - length(replace(v_src, v_a2_from, ''))) / length(v_a2_from) <> 1 then
    raise exception 'anchor 2 (hotness trust term) not found exactly once in get_news_front';
  end if;

  execute replace(replace(v_src, v_a1_from, v_a1_to), v_a2_from, v_a2_to);
end
$patch$;

do $verify$
declare
  v_src text;
  v_bad int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'api_private' and p.proname = 'get_news_front';

  if position('b.trust_score = 0 and b.last_verified_at is null then null' in v_src) = 0 then
    raise exception 'P1 failed: get_news_front does not treat unscored trust as missing';
  end if;
  if position('na.last_verified_at' in v_src) = 0 then
    raise exception 'P2 failed: base CTE does not select last_verified_at';
  end if;

  -- P3: behavioural. No eligible article that has never been scored may
  -- come back with hotness 0 while it carries a usable quality score.
  -- Scoped to the last 3 days: hotness is rounded to 5 decimals and halves
  -- every 24h, so a backfilled row with an old published_at legitimately
  -- rounds to 0 and must not abort the migration.
  select count(*) into v_bad
  from api_private.get_news_front(2000, null, null, 21, false) f
  join public.news_articles na on na.id = f.id
  where na.trust_score = 0 and na.last_verified_at is null
    and na.published_at > now() - interval '3 days'
    and coalesce(na.quality_score, 50) > 0
    and f.hotness = 0;
  if v_bad <> 0 then
    raise exception 'P3 failed: % unscored articles still rank with hotness 0', v_bad;
  end if;
end
$verify$;
