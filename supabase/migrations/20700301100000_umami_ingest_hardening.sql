-- Umami ingest hardening: refuse what is not our site, normalize the URL
-- server-side, and bound what one visitor can write.
--
-- `public.track_umami_event` is reached by the `umami-analytics` edge function,
-- which is `verify_jwt = false` — an anonymous first-party tracker carries no
-- user JWT, so that cannot change (flipping it would silently zero the pipeline
-- and every dashboard would read the result as "traffic fell"). EXECUTE is
-- already service_role-only, verified live 2026-09-12, so the RPC grant is not
-- the open door. The bounds have to live inside the function.
--
-- Three changes, each measured on prod 2026-09-12:
--
-- 1. HOSTNAME ALLOWLIST. `hostname` is whatever the browser reported and was
--    stored verbatim. 85,160 of 402,364 sessions (21%) are
--    `queer-guide.pages.dev` — the Cloudflare preview alias, still writing
--    today — plus 2,088 `localhost`, 33 `127.0.0.1`, 18 per-deploy pages.dev
--    subdomains and 3 leftover vercel.app previews. All of it was counted as
--    site traffic on /admin/analytics. Anything that is not the real site is
--    now refused before a session row is created.
--
-- 2. SERVER-SIDE URL NORMALIZATION. The tracker script already strips the
--    /:locale prefix and drops ?section=/?preview=, but `public/umami.js` is
--    served with a year-long cache (the `/*.js` rule in public/_headers), so
--    old copies keep posting the un-normalized form for as long as a browser
--    holds one. Doing it here as well means the normalization holds for every
--    writer, including any future one. ?section= is the editorial scroll-spy's
--    UI state, not a page; ?preview= is the CMS preview flag.
--
-- 3. PER-VISITOR HOURLY CAP. This is the structural bound on an
--    unauthenticated writer into a disk-constrained database. Sized from the
--    real distribution: across the last 30 days the 99.9th percentile visitor
--    produced well under 100 events/hour once the client-side page-view loop
--    is removed, and the loop itself peaked at 582 events in 233 seconds. 300
--    per hour leaves an ordinary reader an order of magnitude of headroom and
--    still caps a runaway at ~7k rows/day instead of unbounded.
--
-- The function keeps its `EXCEPTION WHEN OTHERS` envelope and its
-- `{success:false, error:...}` return shape: a refusal is a soft answer, not a
-- 500, because the caller is a fire-and-forget beacon and an HTTP error there
-- is invisible anyway.

create or replace function public.track_umami_event(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'umami', 'public'
as $function$
DECLARE
  v_website_id   uuid;
  v_session_id   uuid;
  v_event_id     uuid;
  v_hostname     text;
  v_visitor      text;
  v_url          text;
  v_url_path     text;
  v_url_query    text;
  v_params       text[];
  v_param        text;
  v_kept         text[];
  v_referrer     text;
  v_ref_path     text;
  v_ref_query    text;
  v_ref_domain   text;
  v_event_name   text;
  v_event_type   int;
  v_data         jsonb;
  v_key          text;
  v_val          jsonb;
  v_data_type    int;
  v_str_val      text;
  v_num_val      numeric;
  v_recent       bigint;
  -- Locales from src/i18n/languages.ts. Enumerated, never a bare [a-z]{2},
  -- which would rewrite /go/:slug to /:slug and merge unrelated pages.
  c_locales      text[] := array['en','es','fr','de','pt','it','ru','zh','ja','ko','ar'];
  -- Query keys that are UI state rather than a different page.
  c_drop_params  text[] := array['section','preview'];
  c_hostnames    text[] := array['queer.guide','www.queer.guide'];
  c_hourly_cap   int    := 300;
BEGIN
  -- (1) Only the real site. Preview aliases and localhost are not traffic.
  v_hostname := lower(coalesce(payload->>'hostname', ''));
  IF NOT (v_hostname = ANY (c_hostnames)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'hostname_not_allowed');
  END IF;

  SELECT website_id INTO v_website_id
  FROM umami.website
  WHERE name = 'Queer Guide'
  LIMIT 1;

  IF v_website_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Website not found');
  END IF;

  -- (3) Bound one visitor's write rate. Checked BEFORE the session upsert so a
  -- runaway cannot mint session rows either. The daily-rotating visitor hash is
  -- computed in the edge function; a payload without one skips the cap rather
  -- than sharing a bucket with every other anonymous writer.
  v_visitor := nullif(payload->>'visitor_id', '');
  IF v_visitor IS NOT NULL THEN
    SELECT count(*) INTO v_recent
    FROM umami.website_event e
    JOIN umami.session s ON s.session_id = e.session_id
    WHERE s.website_id = v_website_id
      AND s.distinct_id = v_visitor
      AND e.created_at > now() - interval '1 hour';

    IF v_recent >= c_hourly_cap THEN
      RETURN jsonb_build_object('success', false, 'error', 'rate_limited');
    END IF;
  END IF;

  v_session_id := umami.get_or_create_session(
    v_website_id,
    v_hostname,
    COALESCE(payload->>'browser', 'Unknown'),
    COALESCE(payload->>'os', 'Unknown'),
    COALESCE(payload->>'device', 'desktop'),
    COALESCE(payload->>'screen', '1920x1080'),
    COALESCE(payload->>'language', 'en'),
    NULLIF(payload->>'country', ''),
    v_visitor
  );

  v_url := COALESCE(payload->>'url', '/');
  v_url_path  := split_part(v_url, '?', 1);
  v_url_query := CASE WHEN position('?' in v_url) > 0
                      THEN split_part(v_url, '?', 2)
                      ELSE NULL END;

  -- (2a) Strip a leading locale segment. The locale is already recorded
  -- independently on umami.session.language, so keeping it in the path splits
  -- one page into eleven rows that nothing ever re-joins.
  v_url_path := regexp_replace(
    v_url_path,
    '^/(' || array_to_string(c_locales, '|') || ')(/|$)',
    '/'
  );
  IF v_url_path IS NULL OR v_url_path = '' THEN
    v_url_path := '/';
  END IF;

  -- (2b) Drop UI-state query keys, keep everything else in order.
  IF v_url_query IS NOT NULL THEN
    v_params := string_to_array(v_url_query, '&');
    v_kept := array[]::text[];
    FOREACH v_param IN ARRAY v_params LOOP
      IF v_param <> '' AND NOT (split_part(v_param, '=', 1) = ANY (c_drop_params)) THEN
        v_kept := v_kept || v_param;
      END IF;
    END LOOP;
    v_url_query := CASE WHEN cardinality(v_kept) > 0
                        THEN '?' || array_to_string(v_kept, '&')
                        ELSE NULL END;
  END IF;

  v_referrer := NULLIF(payload->>'referrer', '');
  IF v_referrer IS NOT NULL THEN
    BEGIN
      v_ref_domain := (regexp_match(v_referrer, '^https?://([^/?#]+)'))[1];
      v_ref_path   := COALESCE((regexp_match(v_referrer, '^https?://[^/]+(/[^?#]*)'))[1], '/');
      v_ref_query  := CASE WHEN position('?' in v_referrer) > 0
                           THEN '?' || split_part(split_part(v_referrer, '?', 2), '#', 1)
                           ELSE NULL END;
    EXCEPTION WHEN OTHERS THEN
      v_ref_domain := NULL; v_ref_path := NULL; v_ref_query := NULL;
    END;
  END IF;

  v_event_name := NULLIF(payload->>'name', '');
  v_event_type := CASE WHEN v_event_name IS NOT NULL THEN 2 ELSE 1 END;

  INSERT INTO umami.website_event (
    website_id, session_id, url_path, url_query,
    referrer_path, referrer_query, referrer_domain,
    page_title, event_type, event_name
  ) VALUES (
    v_website_id, v_session_id, v_url_path, v_url_query,
    v_ref_path, v_ref_query, v_ref_domain,
    COALESCE(payload->>'title', 'Unknown'), v_event_type, v_event_name
  )
  RETURNING event_id INTO v_event_id;

  v_data := payload->'data';
  IF v_event_name IS NOT NULL AND v_data IS NOT NULL AND jsonb_typeof(v_data) = 'object' THEN
    FOR v_key, v_val IN SELECT * FROM jsonb_each(v_data)
    LOOP
      v_str_val := NULL; v_num_val := NULL; v_data_type := 1;
      IF jsonb_typeof(v_val) = 'number' THEN
        v_data_type := 2;
        v_num_val := (v_val)::text::numeric;
      ELSE
        v_str_val := CASE jsonb_typeof(v_val)
                       WHEN 'string' THEN v_val #>> '{}'
                       ELSE v_val::text
                     END;
      END IF;

      INSERT INTO umami.event_data (
        event_id, event_key, event_string_value, event_numeric_value, event_data_type
      ) VALUES (
        v_event_id, v_key, v_str_val, v_num_val, v_data_type
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('success', true, 'event_id', v_event_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

comment on function public.track_umami_event(jsonb) is
  'Umami ingest. Refuses any hostname that is not the live site (21% of historical sessions were preview/localhost), normalizes the locale prefix and UI-state query keys out of the URL, and caps one visitor hash at 300 events/hour. Reached only by the umami-analytics edge function; EXECUTE is service_role-only.';

revoke all on function public.track_umami_event(jsonb) from public, anon, authenticated;
grant execute on function public.track_umami_event(jsonb) to service_role;

-- Postconditions. Asserted against the live function rather than trusted,
-- because every one of these is silent when it is wrong: a broken allowlist
-- refuses ALL traffic and the dashboards read it as a traffic collapse, and a
-- broken normalizer just produces slightly different strings forever.
do $verify$
declare
  v jsonb;
  v_leaked bigint;
  -- A marker only this block writes. The first draft compared count(*) over
  -- the whole table instead, and the dry run failed with "a refused payload
  -- still wrote 2 rows" — those 2 rows were live traffic arriving during the
  -- check. A postcondition on a table other writers are using has to be
  -- scoped to rows this block could itself have produced.
  c_probe constant text := 'umami-hardening-probe-20520301';
begin
  -- A preview-alias payload is refused, and writes nothing.
  v := public.track_umami_event(jsonb_build_object(
    'hostname', 'queer-guide.pages.dev', 'url', '/travel', 'title', c_probe));
  if coalesce(v->>'error','') <> 'hostname_not_allowed' then
    raise exception 'preview hostname was not refused: %', v;
  end if;
  v := public.track_umami_event(jsonb_build_object(
    'hostname', 'localhost', 'url', '/', 'title', c_probe));
  if coalesce(v->>'error','') <> 'hostname_not_allowed' then
    raise exception 'localhost was not refused: %', v;
  end if;
  select count(*) into v_leaked
    from umami.website_event where page_title = c_probe;
  if v_leaked <> 0 then
    raise exception 'a refused payload still wrote % rows', v_leaked;
  end if;

  -- Positive control: the real hostname is still accepted, and the URL it
  -- stores is normalized. Without this the two assertions above also pass on a
  -- function that refuses everything.
  v := public.track_umami_event(jsonb_build_object(
    'hostname', 'queer.guide',
    'url', '/de/travel?section=stay&q=berlin&preview=1',
    'title', c_probe));
  if coalesce((v->>'success')::boolean, false) is not true then
    raise exception 'the live hostname was refused: %', v;
  end if;

  perform 1 from umami.website_event
   where event_id = (v->>'event_id')::uuid
     and url_path = '/travel'
     and url_query = '?q=berlin';
  if not found then
    raise exception 'URL was not normalized: %',
      (select jsonb_build_object('path', url_path, 'query', url_query)
         from umami.website_event where event_id = (v->>'event_id')::uuid);
  end if;

  -- Leave no verification rows behind. Keyed on the marker rather than the id
  -- so a partially-written probe cannot survive either.
  delete from umami.website_event where page_title = c_probe;
  raise notice 'track_umami_event hardening verified (allowlist, normalization, positive control)';
end
$verify$;
