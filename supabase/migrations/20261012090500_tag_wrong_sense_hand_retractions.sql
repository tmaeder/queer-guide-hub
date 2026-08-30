-- Tag glossary content quality: hand-verified WRONG-SENSE retractions.
--
-- The wrong-entity repair (20261008100000) catches namesakes whose entity
-- CLASS is implausible for a glossary term. These four are the class it
-- structurally cannot catch: the article really is titled like the tag and
-- the entity class is perfectly plausible — it is simply the generic sense of
-- an ordinary English word, published on a kink/venue vocabulary page. All
-- four were read by hand on prod, 2026-08-29; the recurring detector for this
-- class is tag-enrichment-sweep mode='prose' (subject judge), and the
-- producer is sealed by the 'generic-sense' gate in tag-wiki-guard — this
-- migration only clears the rows whose wrongness is already established, so
-- the e2e fingerprints for the class are deterministic instead of waiting on
-- a cron.
--
-- Per row, ONLY the wrong fields are cleared (prefer null to a guess; the
-- weekly medical-codes/hierarchy syncs regenerate from wikidata_id, so a
-- wrong identifier rebuilds wrong data forever while a null one rebuilds
-- nothing):
--
--   vacuum-pump (Fetishes, Q745837 = the industrial device): description is
--     the import stamp "Toys tag", long_description is vacuum physics (Otto
--     von Guericke, 1650). Everything wrong — all cleared.
--   furniture (Gear, Q14745 = household furniture): description is scrape
--     junk ("Updated June 20, 2023 3:42pm..."), long_description is IKEA
--     prose. All cleared; the community sense (bondage furniture) re-enters
--     through the sense-anchored fill.
--   clothing-optional (Venue Features & Policies, Q5135565 = clothing-
--     optional BIKE RIDE): short/long describe nude cycling events on the
--     page for a venue policy. Cleared; titleAgrees refuses the bike-ride
--     article on re-fill (ratio bound), so it cannot come back.
--   casting (Q496098): description is CORRECT kink prose (plaster-cast
--     immobilization fetish) and is KEPT; long_description is metal casting
--     ("poured into a mold... 7,000-year-old process") and the wikidata link
--     is the manufacturing process — those are cleared.

select set_config('app.actor', 'admin:tag-wrong-sense-retractions-20260829', true);

update public.unified_tags
set description = null,
    short_description = null,
    long_description = null,
    wikidata_id = null,
    wikipedia_url = null,
    updated_at = now()
where status = 'active'
  -- Guarded on the audited identifier (the repair-migration pattern): a row a
  -- sibling session already relinked or fixed is skipped, not clobbered.
  and ((slug = 'vacuum-pump' and wikidata_id = 'Q745837')
    or (slug = 'furniture' and wikidata_id = 'Q14745'));

update public.unified_tags
set short_description = null,
    long_description = null,
    wikidata_id = null,
    wikipedia_url = null,
    updated_at = now()
where slug = 'clothing-optional'
  and status = 'active'
  and wikidata_id = 'Q5135565';

update public.unified_tags
set long_description = null,
    wikidata_id = null,
    wikipedia_url = null,
    updated_at = now()
where slug = 'casting'
  and status = 'active'
  and wikidata_id = 'Q496098';
