-- news_articles.content_hash stops rotting.
--
-- WHAT IT ACTUALLY IS (the plan for this phase guessed wrong, so the finding is
-- recorded here). content_hash is not garbage and it is not boilerplate-derived:
-- it is STALE. news_commit_staging_batch computes it once, at INSERT, as
--   encode(extensions.digest(convert_to(coalesce(content, title, ''),'UTF8'),'sha256'),'hex')
-- and nothing has ever recomputed it. Meanwhile news_resanitize (*/5 min) and
-- news_fulltext_backfill (*/10 min) rewrite `content` continuously. So the
-- column records what the article looked like at first commit -- usually the
-- paywall teaser (". Want to read our hottest showbiz scoops for free? ...") --
-- while `content` moved on without it.
--
-- Measured: 35,781 of 38,299 rows (93%) carry a hash that does not match their
-- own current content. The two mega-buckets that made it look degenerate are
-- both explained by this:
--   d79f1889... 7,656 rows over 6,364 DISTINCT content values (one outlet's
--               teaser blob, hashed before the full text arrived)
--   e3b0c442... 1,135 rows = sha256(''), of which only 91 actually have
--               content = '' today. coalesce() does not treat '' as null, so an
--               empty-string body at commit time hashed the empty string even
--               though the row had a perfectly good title.
--
-- FIX: a BEFORE trigger, so the hash is derived rather than remembered. Rows
-- self-heal for free the next time the re-sanitize / full-text crons touch them.
--
-- DELIBERATELY NOT BACKFILLED. trg_search_documents_news is AFTER INSERT OR
-- DELETE OR UPDATE FOR EACH ROW, so rewriting the 35,872 stale rows means 35,872
-- search_documents syncs on a disk-constrained database -- and the column has
-- ZERO readers (the only find_exact_duplicates in the schema reads
-- image_assets.content_hash, not this one). 20260809100000's news gate compares
-- `a.content = b.content` directly, which is correct whatever the hash says.
-- run_news_content_hash_repair below exists for an operator who wants the
-- backfill anyway; it is intentionally NOT registered in admin_automations and
-- NOT scheduled.
--
-- nullif(...,'') is the one semantic change: an empty body now falls back to the
-- title instead of hashing the empty string, so the degenerate all-empty bucket
-- cannot re-form.

CREATE OR REPLACE FUNCTION public.tg_news_articles_content_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $fn$
BEGIN
  NEW.content_hash := encode(
    extensions.digest(
      convert_to(coalesce(nullif(NEW.content, ''), nullif(NEW.title, ''), ''), 'UTF8'),
      'sha256'),
    'hex');
  RETURN NEW;
END;
$fn$;

-- Name matters. BEFORE triggers fire in NAME order, and
-- news_articles_decode_entities (BEFORE INSERT OR UPDATE OF title, excerpt,
-- content) rewrites both inputs. Anything sorting before it would hash the
-- pre-decoded text and be wrong from the first write; the zz_ prefix puts this
-- last, after every existing BEFORE trigger on the table.
DROP TRIGGER IF EXISTS news_articles_zz_content_hash ON public.news_articles;
CREATE TRIGGER news_articles_zz_content_hash
BEFORE INSERT OR UPDATE OF content, title ON public.news_articles
FOR EACH ROW EXECUTE FUNCTION public.tg_news_articles_content_hash();

-- Manual, on-demand only. Batch cap is load-bearing: every row here costs one
-- trg_search_documents_news sync.
CREATE OR REPLACE FUNCTION public.run_news_content_hash_repair(p_batch int DEFAULT 300)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_fixed int := 0;
  v_remaining bigint;
BEGIN
  PERFORM public.assert_admin_or_internal();

  WITH stale AS (
    SELECT id FROM public.news_articles
    WHERE content_hash IS DISTINCT FROM encode(
      extensions.digest(convert_to(coalesce(nullif(content,''), nullif(title,''), ''),'UTF8'),'sha256'),'hex')
    LIMIT LEAST(GREATEST(p_batch, 0), 300)
  )
  UPDATE public.news_articles n
     SET content_hash = encode(
       extensions.digest(convert_to(coalesce(nullif(n.content,''), nullif(n.title,''), ''),'UTF8'),'sha256'),'hex')
   FROM stale WHERE n.id = stale.id;
  GET DIAGNOSTICS v_fixed = ROW_COUNT;

  SELECT count(*) INTO v_remaining FROM public.news_articles
   WHERE content_hash IS DISTINCT FROM encode(
     extensions.digest(convert_to(coalesce(nullif(content,''), nullif(title,''), ''),'UTF8'),'sha256'),'hex');

  RETURN jsonb_build_object('fixed', v_fixed, 'remaining', v_remaining);
END;
$fn$;

REVOKE ALL ON FUNCTION public.run_news_content_hash_repair(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_news_content_hash_repair(int) TO service_role;

COMMENT ON COLUMN public.news_articles.content_hash IS
  'sha256 hex of the article body (falls back to title), maintained by trigger news_articles_zz_content_hash. Historical rows may still be stale -- it was insert-only until 20260809120000 and has no readers. Not a merge key: the dedup sweep compares content directly.';
