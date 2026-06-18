-- Event Tag Vocabulary — populate events.tags (0/3307 before this) deterministically.
--
-- events.tags was empty corpus-wide: no writer ever filled it, so every event
-- rendered with zero topical/audience facets and the /resources/{tag} surface
-- carried no events. Meanwhile events.target_groups is a 200+-value free-text
-- mess (casing variants, sentences, source noise) — unusable as a facet.
--
-- Treatment (mirrors normalize_venue_tags / amenity default-reject, 20260613120000):
--   1. normalize_event_tags(event_type, target_groups, title, description):
--      a pure function that emits ONLY controlled slugs — the event category
--      (from the clean event_type enum) + audience facets matched by keyword
--      against title/description/target_groups. Default-reject everything else.
--   2. run_event_tags_backfill(batch, force): reversible, idempotent, batched
--      (≤300/call — trg_search_documents_event fires per UPDATE, disk-constrained
--      DB). Prior tags snapshotted into enrichment_status.event_tags_backfill.
-- Audience derivation from target_groups also gives us a clean, queryable signal
-- without trusting the raw free text.

-- 1 ── pure normalizer: controlled category + audience vocabulary ────────────
CREATE OR REPLACE FUNCTION public.normalize_event_tags(
  p_event_type   text,
  p_target_groups text[],
  p_title        text,
  p_description  text
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  -- event_type (clean enum) -> canonical category tag. 'other'/unknown emit none.
  v_type_map CONSTANT jsonb := '{
    "pride":"pride","protest":"protest","party":"party","fetish":"fetish",
    "drag":"drag","film":"film","festival":"festival","conference":"conference",
    "workshop":"workshop","meetup":"meetup","sports":"sports","art":"art",
    "concert":"concert","social":"social","fundraiser":"fundraiser",
    "theater":"theater","theatre":"theater","community":"community","fair":"fair",
    "comedy":"comedy","networking":"networking","performance":"performance",
    "exhibition":"exhibition","wellness":"wellness"
  }'::jsonb;
  -- substring pattern -> canonical audience tag. First-match-per-tag; deterministic.
  v_aud CONSTANT text[][] := ARRAY[
    ['transgender','trans'],['transfem','trans'],['transmasc','trans'],['transwom','trans'],['trans ','trans'],['trans-','trans'],
    ['sapphic','sapphic'],['wlw','sapphic'],
    ['lesbian','lesbian'],['dyke','lesbian'],
    ['gay men','gay'],['gay vegan','gay'],['gays','gay'],['gay,','gay'],['gbtq','gay'],
    ['bisexual','bisexual'],['bi men','bisexual'],['bi women','bisexual'],['bi+','bisexual'],['bi,','bisexual'],
    ['non-binary','nonbinary'],['nonbinary','nonbinary'],['non binary','nonbinary'],['enby','nonbinary'],['genderqueer','nonbinary'],['agender','nonbinary'],['gender non-conforming','nonbinary'],['gender-non-conforming','nonbinary'],['flinta','nonbinary'],
    ['intersex','intersex'],
    ['women','women'],['woman','women'],['femme','women'],['girlies','women'],['female','women'],
    ['bipoc','bipoc'],['qtbipoc','bipoc'],['qtpoc','bipoc'],['qt-poc','bipoc'],['people of colo','bipoc'],['poc','bipoc'],['black','bipoc'],['latinx','bipoc'],['latino','bipoc'],['asian','bipoc'],['south-asian','bipoc'],['south asian','bipoc'],['brown','bipoc'],
    ['kink','kink'],['fetish','kink'],['leather','kink'],['bdsm','kink'],['latex','kink'],['puppy','kink'],['perverts','kink'],
    ['family-friendly','family-friendly'],['family friendly','family-friendly'],['families','family-friendly'],['all ages','family-friendly'],['all-ages','family-friendly'],['children','family-friendly'],['kids','family-friendly'],
    ['youth','youth'],['young people','youth'],['young adults','youth'],['students','youth'],['teen','youth'],
    ['seniors','seniors'],['older adults','seniors'],['silver','seniors'],['over 40','seniors'],['40+','seniors'],
    ['sober','sober'],['alcohol-free','sober'],['alcohol free','sober'],
    ['disabled','disabled'],['deaf','disabled'],['hard of hearing','disabled'],['neurodivergent','disabled'],['wheelchair','disabled'],
    ['queer','queer'],['lgbtqia','queer'],['lgbtq','queer'],['lgbti','queer'],['lgbt','queer'],['2slgbtq','queer'],['2slgbtq','queer']
  ];
  -- title keyword -> category, for the large event_type='other' bucket (47%).
  -- Only consulted when event_type yields no category.
  v_title_cat CONSTANT text[][] := ARRAY[
    ['party','party'],['parade','protest'],['march','protest'],['rally','protest'],['demo','protest'],
    ['pride','pride'],['festival','festival'],['screening','film'],['film','film'],['cinema','film'],
    ['drag','drag'],['workshop','workshop'],['conference','conference'],['summit','conference'],
    ['meetup','meetup'],['meet-up','meetup'],['meet up','meetup'],['comedy','comedy'],
    ['concert','concert'],['gig','concert'],['exhibition','exhibition'],['market','fair'],
    ['gala','fundraiser'],['fundraiser','fundraiser'],['brunch','social'],['mixer','social'],
    ['social','social'],['quiz','social'],['bingo','social'],['karaoke','social']
  ];
  v_out  text[] := '{}';
  v_cat  text;
  v_hay  text;
  v_tl   text;
  i      int;
  v_tag  text;
  v_pat  text;
BEGIN
  -- category from event_type (authoritative)
  v_cat := v_type_map ->> lower(btrim(coalesce(p_event_type, '')));
  -- fall back to title keywords for the 'other'/unknown bucket
  IF v_cat IS NULL THEN
    v_tl := lower(coalesce(p_title, ''));
    FOR i IN 1 .. array_length(v_title_cat, 1) LOOP
      IF position(v_title_cat[i][1] IN v_tl) > 0 THEN
        v_cat := v_title_cat[i][2];
        EXIT;
      END IF;
    END LOOP;
  END IF;
  IF v_cat IS NOT NULL THEN v_out := v_out || v_cat; END IF;

  -- haystack for audience keyword matching
  v_hay := lower(
    coalesce(p_title,'') || ' ' || coalesce(p_description,'') || ' ' ||
    coalesce(array_to_string(p_target_groups, ' '), '')
  );

  IF length(btrim(v_hay)) > 0 THEN
    FOR i IN 1 .. array_length(v_aud, 1) LOOP
      v_pat := v_aud[i][1];
      v_tag := v_aud[i][2];
      IF position(v_pat IN v_hay) > 0 AND NOT (v_tag = ANY(v_out)) THEN
        v_out := v_out || v_tag;
      END IF;
    END LOOP;
  END IF;

  RETURN (SELECT coalesce(array_agg(x ORDER BY x), '{}') FROM unnest(v_out) x);
END;
$$;

-- 2 ── reversible, idempotent, batched backfill ─────────────────────────────
CREATE OR REPLACE FUNCTION public.run_event_tags_backfill(
  p_batch integer DEFAULT 300,
  p_force boolean DEFAULT false
)
RETURNS TABLE(processed integer, tagged integer)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  r        RECORD;
  v_new    text[];
  v_proc   integer := 0;
  v_tagged integer := 0;
BEGIN
  FOR r IN
    SELECT id, event_type, target_groups, title, description, tags
    FROM public.events
    WHERE duplicate_of_id IS NULL
      AND (tags IS NULL OR cardinality(tags) = 0)
      -- exclude already-attempted rows (incl. those that normalize to no tags) so
      -- the cursor advances past empties instead of re-fetching the same window
      AND (p_force OR NOT (enrichment_status ? 'event_tags_backfill'))
    ORDER BY (start_date >= now()) DESC NULLS LAST, start_date DESC NULLS LAST, id
    LIMIT GREATEST(p_batch, 1)
  LOOP
    v_new := public.normalize_event_tags(r.event_type, r.target_groups, r.title, r.description);
    v_proc := v_proc + 1;
    IF cardinality(v_new) > 0 THEN v_tagged := v_tagged + 1; END IF;
    -- always stamp the attempt marker; only write tags when we derived some
    UPDATE public.events SET
      tags = CASE WHEN cardinality(v_new) > 0 THEN v_new ELSE tags END,
      enrichment_status = jsonb_set(
        coalesce(enrichment_status, '{}'::jsonb), '{event_tags_backfill}',
        jsonb_build_object('at', now(), 'raw', to_jsonb(r.tags), 'tagged', cardinality(v_new) > 0), true)
    WHERE id = r.id;
  END LOOP;
  processed := v_proc; tagged := v_tagged; RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_event_tags(text, text[], text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_event_tags_backfill(integer, boolean) TO service_role;

-- 3 ── daily cron: tag newly-ingested events (self-terminates via the attempt
--      marker, so steady-state cost is ~0 once the corpus is drained) ─────────
DO $$ BEGIN PERFORM cron.unschedule('event_tags_backfill'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('event_tags_backfill', '20 3 * * *', $$SELECT public.run_event_tags_backfill(300)$$);
