-- ============================================================
-- Phase 3b — Source-side data normalization sweep + nightly guard
--
-- Three fix families, applied once here and kept clean by a nightly re-runnable
-- guard (run_data_normalization_guard, registered in admin_automations + pg_cron
-- like the city truth loop recompute):
--   1. ''-as-missing → NULL (NULLIF(trim(col),'')) across the content tables
--   2. placeholder addresses → NULL (venue address===name, hotel address===city)
--   3. bare-domain URLs get an https:// scheme prefix
--
-- Column lists verified against the live schema (baseline CREATE TABLE +
-- twenty-sync select strings). marketplace_listings has no scalar image-URL
-- column (images is text[]) so only description/brand are swept there.
-- Every UPDATE is WHERE-guarded so untouched rows are not rewritten (updated_at
-- touch triggers + search-sync triggers stay quiet for clean rows).
-- ============================================================

-- ── 1. one-time '' → NULL sweep ────────────────────────────────────────────
UPDATE public.organizations SET
  email = NULLIF(trim(email), ''), phone = NULLIF(trim(phone), ''),
  description = NULLIF(trim(description), ''), editorial_hook = NULLIF(trim(editorial_hook), ''),
  editorial_long = NULLIF(trim(editorial_long), ''), website = NULLIF(trim(website), ''),
  logo_url = NULLIF(trim(logo_url), '')
WHERE (email IS NOT NULL AND trim(email) = '') OR (phone IS NOT NULL AND trim(phone) = '')
   OR (description IS NOT NULL AND trim(description) = '') OR (editorial_hook IS NOT NULL AND trim(editorial_hook) = '')
   OR (editorial_long IS NOT NULL AND trim(editorial_long) = '') OR (website IS NOT NULL AND trim(website) = '')
   OR (logo_url IS NOT NULL AND trim(logo_url) = '');

UPDATE public.venues SET
  email = NULLIF(trim(email), ''), phone = NULLIF(trim(phone), ''),
  website = NULLIF(trim(website), ''), description = NULLIF(trim(description), ''),
  address = NULLIF(trim(address), ''), instagram = NULLIF(trim(instagram), ''),
  booking_url = NULLIF(trim(booking_url), '')
WHERE (email IS NOT NULL AND trim(email) = '') OR (phone IS NOT NULL AND trim(phone) = '')
   OR (website IS NOT NULL AND trim(website) = '') OR (description IS NOT NULL AND trim(description) = '')
   OR (address IS NOT NULL AND trim(address) = '') OR (instagram IS NOT NULL AND trim(instagram) = '')
   OR (booking_url IS NOT NULL AND trim(booking_url) = '');

UPDATE public.events SET
  venue_name = NULLIF(trim(venue_name), ''), organizer_name = NULLIF(trim(organizer_name), ''),
  website = NULLIF(trim(website), ''), address = NULLIF(trim(address), ''),
  description = NULLIF(trim(description), ''), ticket_url = NULLIF(trim(ticket_url), '')
WHERE (venue_name IS NOT NULL AND trim(venue_name) = '') OR (organizer_name IS NOT NULL AND trim(organizer_name) = '')
   OR (website IS NOT NULL AND trim(website) = '') OR (address IS NOT NULL AND trim(address) = '')
   OR (description IS NOT NULL AND trim(description) = '') OR (ticket_url IS NOT NULL AND trim(ticket_url) = '');

UPDATE public.hotels SET
  email = NULLIF(trim(email), ''), phone = NULLIF(trim(phone), ''),
  website = NULLIF(trim(website), ''), address = NULLIF(trim(address), ''),
  description = NULLIF(trim(description), ''), booking_url = NULLIF(trim(booking_url), '')
WHERE (email IS NOT NULL AND trim(email) = '') OR (phone IS NOT NULL AND trim(phone) = '')
   OR (website IS NOT NULL AND trim(website) = '') OR (address IS NOT NULL AND trim(address) = '')
   OR (description IS NOT NULL AND trim(description) = '') OR (booking_url IS NOT NULL AND trim(booking_url) = '');

UPDATE public.cities SET
  description = NULLIF(trim(description), ''), editorial_hook = NULLIF(trim(editorial_hook), ''),
  safety_notes = NULLIF(trim(safety_notes), ''), image_url = NULLIF(trim(image_url), ''),
  official_website = NULLIF(trim(official_website), '')
WHERE (description IS NOT NULL AND trim(description) = '') OR (editorial_hook IS NOT NULL AND trim(editorial_hook) = '')
   OR (safety_notes IS NOT NULL AND trim(safety_notes) = '') OR (image_url IS NOT NULL AND trim(image_url) = '')
   OR (official_website IS NOT NULL AND trim(official_website) = '');

UPDATE public.countries SET
  description = NULLIF(trim(description), ''), editorial_hook = NULLIF(trim(editorial_hook), ''),
  editorial_long = NULLIF(trim(editorial_long), ''), image_url = NULLIF(trim(image_url), '')
WHERE (description IS NOT NULL AND trim(description) = '') OR (editorial_hook IS NOT NULL AND trim(editorial_hook) = '')
   OR (editorial_long IS NOT NULL AND trim(editorial_long) = '') OR (image_url IS NOT NULL AND trim(image_url) = '');

UPDATE public.queer_villages SET
  description = NULLIF(trim(description), ''), website = NULLIF(trim(website), ''),
  image_url = NULLIF(trim(image_url), '')
WHERE (description IS NOT NULL AND trim(description) = '') OR (website IS NOT NULL AND trim(website) = '')
   OR (image_url IS NOT NULL AND trim(image_url) = '');

UPDATE public.news_articles SET
  excerpt = NULLIF(trim(excerpt), ''), author = NULLIF(trim(author), ''),
  image_url = NULLIF(trim(image_url), ''), canonical_url = NULLIF(trim(canonical_url), '')
WHERE (excerpt IS NOT NULL AND trim(excerpt) = '') OR (author IS NOT NULL AND trim(author) = '')
   OR (image_url IS NOT NULL AND trim(image_url) = '') OR (canonical_url IS NOT NULL AND trim(canonical_url) = '');

UPDATE public.marketplace_listings SET
  description = NULLIF(trim(description), ''), brand = NULLIF(trim(brand), '')
WHERE (description IS NOT NULL AND trim(description) = '') OR (brand IS NOT NULL AND trim(brand) = '');

-- ── 2. one-time placeholder-address sweep ──────────────────────────────────
UPDATE public.venues SET address = NULL
WHERE address IS NOT NULL AND name IS NOT NULL
  AND lower(trim(address)) = lower(trim(name));

UPDATE public.hotels SET address = NULL
WHERE address IS NOT NULL AND city IS NOT NULL
  AND lower(trim(address)) = lower(trim(city));

-- ── 3. one-time https:// prefix for bare-domain URLs ──────────────────────
-- Guarded: only values with no scheme at all (mailto:, ftp:// etc. untouched),
-- looking domain-like (leading alnum, contains a dot, no whitespace).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('organizations',   'website'),
    ('venues',          'website'),
    ('venues',          'booking_url'),
    ('events',          'website'),
    ('events',          'ticket_url'),
    ('hotels',          'website'),
    ('hotels',          'booking_url'),
    ('cities',          'official_website'),
    ('queer_villages',  'website')
  ) AS v(tbl, col)
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = ''https://'' || %I
        WHERE %I IS NOT NULL
          AND %I !~* ''^[a-z][a-z0-9+.-]*://''
          AND %I ~* ''^[a-z0-9]'' AND %I ~ ''\.'' AND %I !~ ''\s''',
      t.tbl, t.col, t.col, t.col, t.col, t.col, t.col, t.col);
  END LOOP;
END $$;

-- ── 4. nightly re-runnable guard (mirrors run_city_trust_recompute shape) ──
CREATE OR REPLACE FUNCTION public.run_data_normalization_guard(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_automation_id uuid;
  v_run_id        bigint;
  v_enabled       boolean;
  v_started_at    timestamptz := now();
  v_n             int;
  v_empty         int := 0;
  v_addr          int := 0;
  v_url           int := 0;
  t               record;
BEGIN
  SELECT id, enabled INTO v_automation_id, v_enabled
  FROM public.admin_automations WHERE slug = 'data_normalization_guard';

  INSERT INTO public.admin_automation_runs
    (automation_id, automation_slug, started_at, status, items_examined, items_changed)
  VALUES (v_automation_id, 'data_normalization_guard', v_started_at, 'success', 0, 0)
  RETURNING id INTO v_run_id;

  IF (v_enabled IS DISTINCT FROM true) AND NOT p_force THEN
    UPDATE public.admin_automation_runs
      SET finished_at=now(), summary=jsonb_build_object('skipped',true,'reason','paused') WHERE id=v_run_id;
    UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='paused' WHERE id=v_automation_id;
    RETURN jsonb_build_object('skipped',true,'reason','paused');
  END IF;

  -- fix 1: ''-as-missing → NULL (same table/column matrix as the one-time sweep)
  FOR t IN SELECT * FROM (VALUES
    ('organizations',        ARRAY['email','phone','description','editorial_hook','editorial_long','website','logo_url']),
    ('venues',               ARRAY['email','phone','website','description','address','instagram','booking_url']),
    ('events',               ARRAY['venue_name','organizer_name','website','address','description','ticket_url']),
    ('hotels',               ARRAY['email','phone','website','address','description','booking_url']),
    ('cities',               ARRAY['description','editorial_hook','safety_notes','image_url','official_website']),
    ('countries',            ARRAY['description','editorial_hook','editorial_long','image_url']),
    ('queer_villages',       ARRAY['description','website','image_url']),
    ('news_articles',        ARRAY['excerpt','author','image_url','canonical_url']),
    ('marketplace_listings', ARRAY['description','brand'])
  ) AS v(tbl, cols)
  LOOP
    EXECUTE format('UPDATE public.%I SET %s WHERE %s',
      t.tbl,
      (SELECT string_agg(format('%I = NULLIF(trim(%I), '''')', c, c), ', ') FROM unnest(t.cols) c),
      (SELECT string_agg(format('(%I IS NOT NULL AND trim(%I) = '''')', c, c), ' OR ') FROM unnest(t.cols) c));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_empty := v_empty + v_n;
  END LOOP;

  -- fix 2: placeholder addresses
  UPDATE public.venues SET address = NULL
  WHERE address IS NOT NULL AND name IS NOT NULL AND lower(trim(address)) = lower(trim(name));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_addr := v_addr + v_n;

  UPDATE public.hotels SET address = NULL
  WHERE address IS NOT NULL AND city IS NOT NULL AND lower(trim(address)) = lower(trim(city));
  GET DIAGNOSTICS v_n = ROW_COUNT; v_addr := v_addr + v_n;

  -- fix 3: https:// prefix for bare-domain URLs
  FOR t IN SELECT * FROM (VALUES
    ('organizations',   'website'),
    ('venues',          'website'),
    ('venues',          'booking_url'),
    ('events',          'website'),
    ('events',          'ticket_url'),
    ('hotels',          'website'),
    ('hotels',          'booking_url'),
    ('cities',          'official_website'),
    ('queer_villages',  'website')
  ) AS v(tbl, col)
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET %I = ''https://'' || %I
        WHERE %I IS NOT NULL
          AND %I !~* ''^[a-z][a-z0-9+.-]*://''
          AND %I ~* ''^[a-z0-9]'' AND %I ~ ''\.'' AND %I !~ ''\s''',
      t.tbl, t.col, t.col, t.col, t.col, t.col, t.col, t.col);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_url := v_url + v_n;
  END LOOP;

  UPDATE public.admin_automation_runs
    SET finished_at=now(), items_examined=v_empty+v_addr+v_url, items_changed=v_empty+v_addr+v_url,
        summary=jsonb_build_object('empty_string_nulled',v_empty,'placeholder_addresses',v_addr,'url_scheme_fixed',v_url)
    WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='success' WHERE id=v_automation_id;
  RETURN jsonb_build_object('empty_string_nulled',v_empty,'placeholder_addresses',v_addr,'url_scheme_fixed',v_url);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.admin_automation_runs SET finished_at=now(), status='error', error=SQLERRM WHERE id=v_run_id;
  UPDATE public.admin_automations SET last_run_at=v_started_at, last_run_status='error' WHERE id=v_automation_id;
  RAISE;
END; $$;

COMMENT ON FUNCTION public.run_data_normalization_guard(boolean) IS
  'Nightly normalization guard: ''''-as-missing → NULL, placeholder addresses '
  '(venue address=name, hotel address=city) → NULL, https:// prefix for bare-'
  'domain URLs. Idempotent, WHERE-guarded (clean rows untouched). Returns '
  'jsonb counts per fix family.';

ALTER FUNCTION public.run_data_normalization_guard(boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_data_normalization_guard(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_data_normalization_guard(boolean) TO service_role, authenticated;

-- ── 5. register automation + cron (city truth loop pattern) ────────────────
-- Enabled from day one: pure normalization, idempotent, no-op once clean.
INSERT INTO public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
VALUES
  ('data_normalization_guard','Nightly data normalization guard',
   'Re-runs the Phase-3 normalization sweep: empty-string-to-NULL across the 9 content tables, placeholder-address nulling (venues/hotels), https:// prefix for bare-domain URLs. Idempotent; cheap no-op once clean.',
   'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
   '{"type":"rpc","fn":"run_data_normalization_guard"}'::jsonb, '35 2 * * *')
ON CONFLICT (slug) DO UPDATE
  SET description=EXCLUDED.description, action=EXCLUDED.action, schedule=EXCLUDED.schedule;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='data_normalization_guard') THEN
    PERFORM cron.unschedule('data_normalization_guard');
  END IF;
END $$;
SELECT cron.schedule('data_normalization_guard', '35 2 * * *', 'SELECT public.run_data_normalization_guard();');
