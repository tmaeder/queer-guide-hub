-- Sentinel for the revision trail.
--
-- The thing this has to get right is the one `accessibility_contradictions`
-- already taught: an UNATTACHED trigger and a QUIET WEEK both produce zero
-- revisions, and if the check reports a single number those two are the same
-- answer. Attachment is therefore reported separately from volume, and the
-- script fails on the former while only describing the latter.
--
-- The failure this is really guarding against is the one the whole feature
-- exists to fix: `cms_revisions` sat at 28 rows for seven months and nothing
-- anywhere said so. A trail nobody checks is a trail that quietly stops.

BEGIN;

CREATE OR REPLACE FUNCTION public.content_revision_signals()
RETURNS jsonb
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH reg AS (
    SELECT t.registry_key, t.table_name, t.enabled, t.ignore_columns,
           to_regclass('public.' || quote_ident(t.table_name)) AS oid
      FROM public.content_versioned_tables t
  ),
  trg AS (
    SELECT r.table_name, r.enabled, r.registry_key,
           g.tgenabled,
           (g.tgname IS NOT NULL) AS attached
      FROM reg r
      LEFT JOIN pg_trigger g
        ON g.tgrelid = r.oid
       AND NOT g.tgisinternal
       AND g.tgfoid = 'public.log_content_revision()'::regprocedure
  ),
  gen AS (
    SELECT count(*) AS n
      FROM reg r
      JOIN pg_attribute a
        ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
       AND (a.attgenerated <> '' OR a.attidentity <> '')
     WHERE NOT (a.attname = ANY (r.ignore_columns))
  )
  SELECT jsonb_build_object(
    'registered',        (SELECT count(*) FROM reg),
    'enabled',           (SELECT count(*) FROM reg WHERE enabled),
    -- Attachment, reported on its own. Zero here with zero revisions is a
    -- dead trail; zero revisions with attachment is a quiet week.
    'triggers_attached', (SELECT count(*) FROM trg WHERE attached),
    'enabled_without_trigger',
      (SELECT coalesce(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb)
         FROM trg WHERE enabled AND NOT attached),
    'trigger_disabled_in_pg',
      (SELECT coalesce(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb)
         FROM trg WHERE attached AND tgenabled = 'D'),
    -- Attached but switched off in the registry. Legitimate — it is how a
    -- table is taken out of the trail — so it is reported, never failed on.
    'attached_not_enabled',
      (SELECT coalesce(jsonb_agg(table_name ORDER BY table_name), '[]'::jsonb)
         FROM trg WHERE attached AND NOT enabled),
    'generated_not_ignored', (SELECT n FROM gen),
    'revisions_total',   (SELECT count(*) FROM public.content_revisions),
    'revisions_24h',     (SELECT count(*) FROM public.content_revisions
                           WHERE created_at > now() - interval '24 hours'),
    'by_kind_24h',
      (SELECT coalesce(jsonb_object_agg(actor_kind, n), '{}'::jsonb)
         FROM (SELECT actor_kind, count(*) AS n FROM public.content_revisions
                WHERE created_at > now() - interval '24 hours'
                GROUP BY actor_kind) k),
    'bytes',             pg_total_relation_size('public.content_revisions'),
    -- Retention health: if the prune cron stops, this climbs past the horizon
    -- and the disk argument in 50010101100000 stops holding.
    'oldest_system_days',
      (SELECT coalesce(round(extract(epoch FROM now() - min(created_at)) / 86400)::int, 0)
         FROM public.content_revisions WHERE actor_kind = 'system'),
    'prune_cron_scheduled',
      EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'content_revision_prune')
  );
$$;

COMMENT ON FUNCTION public.content_revision_signals() IS
  'Health of the content revision trail. Reports trigger ATTACHMENT separately from revision VOLUME: an unattached trigger and a quiet week both produce zero, and conflating them is how a dead trail reads as a clean one.';

REVOKE ALL ON FUNCTION public.content_revision_signals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_revision_signals() TO authenticated, service_role;

DO $verify$
DECLARE v jsonb;
BEGIN
  v := public.content_revision_signals();
  IF NOT (v ? 'triggers_attached' AND v ? 'revisions_24h' AND v ? 'enabled_without_trigger') THEN
    RAISE EXCEPTION 'content_revision_signals returned an unexpected shape: %', v;
  END IF;
  -- Nothing is armed yet, so these are all legitimately zero. Asserting it
  -- here is what makes the first non-zero reading mean something.
  IF (v ->> 'triggers_attached')::int <> 0 THEN
    RAISE EXCEPTION 'expected no triggers attached yet, got %', v ->> 'triggers_attached';
  END IF;
  RAISE NOTICE 'content revision signals: %', v;
END $verify$;

COMMIT;
