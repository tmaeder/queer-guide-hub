-- get_news_front: an unscored article (trust_score = 0) ranks by its
-- quality_score instead of falling to hotness 0.
--
-- news_articles.trust_score has column DEFAULT 0 and run_news_trust_recompute
-- only scores rows nightly, so every article committed since the last run sat
-- at trust 0. api_private.get_news_front computed
--   coalesce(b.trust_score, b.quality_score, 50)/100 * decay ...
-- and coalesce never fires on 0, so the newest stories had hotness 0 and
-- dropped out of the homepage pool until the next night. Measured on prod
-- 2026-10-25: 35 live articles in the 21-day window at trust 0, all created
-- within ~12h, all with last_verified_at NULL; 0 of them in the top 200.
--
-- Why nullif(trust_score, 0) and not a NULL column default:
--   * Other readers of trust_score (get_rights_news, news_due_for_refresh,
--     search_documents_index_news) would all change behaviour on NULL. This
--     keeps the change inside the one surface with the defect.
--   * A genuine computed 0 is reachable only with quality_score 0 (completeness
--     weighs 0.30 and the other terms default to >0), and then the coalesce
--     falls through to quality_score = 0 — the same hotness 0. So treating 0 as
--     unscored changes nothing for a real zero. Measured: smallest positive
--     trust on prod is 12, and 0 rows at trust 0 have ever been verified.
--
-- Patched from pg_get_functiondef (exactly-once anchor) rather than restated
-- from an older migration file, so any live drift in the body is preserved.

do $patch$
declare
  v_src  text;
  v_from text := 'coalesce(b.trust_score, b.quality_score, 50)/100.0';
  v_to   text := 'coalesce(nullif(b.trust_score, 0), b.quality_score, 50)/100.0';
  v_n    int;
  v_code text;
begin
  v_src := pg_get_functiondef(
    'api_private.get_news_front(integer,uuid[],uuid[],integer,boolean)'::regprocedure);
  -- Assert on code only: pg_get_functiondef returns the body with comments.
  v_code := regexp_replace(v_src, '--[^' || chr(10) || ']*', '', 'g');

  if position(v_to in v_code) > 0 then
    raise notice 'get_news_front already treats trust 0 as unscored; nothing to do';
    return;
  end if;

  v_n := (length(v_code) - length(replace(v_code, v_from, ''))) / length(v_from);
  if v_n <> 1 then
    raise exception 'expected exactly one hotness coalesce in api_private.get_news_front, found %', v_n;
  end if;

  execute replace(v_src, v_from, v_to);
end
$patch$;

do $verify$
declare
  v_src text := regexp_replace(pg_get_functiondef(
    'api_private.get_news_front(integer,uuid[],uuid[],integer,boolean)'::regprocedure),
    '--[^' || chr(10) || ']*', '', 'g');
begin
  if position('coalesce(nullif(b.trust_score, 0), b.quality_score, 50)' in v_src) = 0 then
    raise exception 'P1 failed: get_news_front does not treat trust_score 0 as unscored';
  end if;
  if position('coalesce(b.trust_score, b.quality_score' in v_src) > 0 then
    raise exception 'P2 failed: the old hotness coalesce is still present';
  end if;
  -- The definer wrapper must still be what serves the public signature.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api_private' and p.proname = 'get_news_front' and p.prosecdef
  ) then
    raise exception 'P3 failed: api_private.get_news_front lost SECURITY DEFINER';
  end if;
end
$verify$;
