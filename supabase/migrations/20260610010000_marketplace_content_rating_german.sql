-- Marketplace Tagging Truth Engine — German keyword hardening for content_rating.
-- 53% of the catalog (ohmyfantasy) is German; the keyword-escalation tier of
-- marketplace_content_rating() was English-only, so a German adult item misfiled in a
-- SFW department would rate sfw (under-gating — the harmful direction). Extend the
-- regexes with German stems and rebuild the STORED generated column. A generated-column
-- DROP+ADD is a DDL table rewrite — it does NOT fire the per-row search trigger, so no
-- storm on the disk-constrained DB. Department bases are slug-keyed and unchanged.

CREATE OR REPLACE FUNCTION public.marketplace_content_rating(
  p_subcategory text, p_title text, p_description text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  WITH s AS (
    SELECT
      lower(regexp_replace(coalesce(p_subcategory,''), '[\s\-]+', '_', 'g')) AS slug,
      lower(coalesce(p_title,'') || ' ' || coalesce(p_description,'')) AS txt
  ),
  ranked AS (
    SELECT GREATEST(
      CASE
        WHEN slug IN ('sex_toys','anal_toys','cock_rings_and_stretchers',
                      'pumps_and_enlargement','chastity','bdsm_and_bondage','pup_and_pet_play')
          THEN 4
        WHEN slug IN ('fetish_wear','fetish_gear')                  THEN 3
        WHEN slug IN ('underwear_and_swimwear','underwear','swimwear') THEN 2
        ELSE 1
      END,
      CASE
        WHEN txt ~ '(dildo|butt ?plug|vibrator|cock ?ring|ball ?stretch|chastity|bondage|\mbdsm\M|fisting|prostate|masturbat|fleshlight|strap[- ]?on|anal (plug|bead|douche|hook)|nipple clamp|urethral|e-?stim|stroker|onanism|analplug|analkette|analkugel|analdusche|penisring|hodenring|keuschheit|peniskäfig|handschellen|peitsche|\mfessel|\mknebel\M|nippelklemme|liebeskugel|penispumpe|prostata|umschnall|spreizstange)'
          THEN 4
        WHEN txt ~ '(fetish|leather harness|pup hood|puppy hood|\mlube\M|lubricant|enema|latex (gear|suit)|rubber (gear|suit)|erotic|\mkink\M|fetisch|gleitgel|gleitmittel|catsuit|wetlook|erotik)'
          THEN 3
        WHEN txt ~ '(jockstrap|jock strap|\mthong\M|lingerie|harness|\msexy\M|dessous|\mtanga\M|reizwäsche)'
          THEN 2
        ELSE 1
      END
    ) AS rank
    FROM s
  )
  SELECT CASE (SELECT rank FROM ranked)
           WHEN 4 THEN 'explicit'
           WHEN 3 THEN 'adult'
           WHEN 2 THEN 'suggestive'
           ELSE 'sfw'
         END;
$$;

-- Rebuild the stored column so existing rows pick up the extended regexes.
ALTER TABLE public.marketplace_listings DROP COLUMN IF EXISTS content_rating;
ALTER TABLE public.marketplace_listings
  ADD COLUMN content_rating text
  GENERATED ALWAYS AS (
    public.marketplace_content_rating(subcategory, title, description)
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_content_rating
  ON public.marketplace_listings (content_rating)
  WHERE status = 'active';

COMMENT ON COLUMN public.marketplace_listings.content_rating IS
  'Derived browse-safety tier: sfw < suggestive < adult < explicit. STORED generated from '
  'subcategory + title + description via marketplace_content_rating() (German+English keywords). '
  'Canonical adult signal. Frontend hides adult/explicit by default.';
