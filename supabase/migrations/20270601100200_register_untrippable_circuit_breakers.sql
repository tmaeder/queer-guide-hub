-- TWENTY-ONE CIRCUIT BREAKERS CAN NEVER TRIP, AND THE MECHANISM IS NOT
-- "UNGUARDED UNTIL FIRST FAILURE" -- IT IS PERMANENT.
--
-- Both halves of the breaker protocol no-op on a missing row, and they do it in
-- opposite directions, which is why nothing ever surfaced:
--
--   checkCircuit()                  absent row -> { allowed: true }.  Never blocks.
--   circuit_breaker_record_failure  UPDATE api_circuit_breakers ... WHERE api_name = $1;
--                                   IF NOT FOUND THEN RETURN circuit_opened:false;
--
-- The failure recorder is a bare UPDATE with an early return. It does NOT insert.
-- So an unregistered breaker never counts a failure, never creates its own row,
-- and therefore never reaches its threshold -- not on the first failure, not on
-- the ten-thousandth. Registration is the entire mechanism; the call sites are
-- decoration without it. CLAUDE.md records this for wikipedia.api / wikidata.api
-- / osm.nominatim ("checkCircuit allows by default, so they could never trip; now
-- seeded") and the same hole was still open on twenty more names.
--
-- HOW THEY WERE FOUND, AND WHY THE OBVIOUS SCAN IS NOT ENOUGH. Grepping for a
-- string literal in the breaker-argument position finds 16. Four more are passed
-- through a module-level constant (`const BREAKER = 'llm.editorial'`) and are
-- invisible to that scan:
--
--     llm.cf.feedback-autotriage      llm.openai.classify-personhood
--     llm.editorial                   llm.venue-contact-enrich
--
-- A guard that only reads literals would have reported this fixed while a fifth
-- of it was still broken. The companion test resolves single-file constants for
-- exactly this reason.
--
-- WHAT WAS ACTUALLY UNPROTECTED. Thirteen of the twenty-one are LLM/Workers-AI
-- breakers, i.e. most of the enrichment spend on this platform ran with no
-- circuit at all -- agentic-enrich, amenity-extract, city-enrich,
-- milestone-discovery, quality-enhance, village-enrich, marketplace-tag,
-- classify-personhood, venue-contact-enrich, editorial, feedback-autotriage,
-- cf-ai-vision and cf-ai-safety-relevance. The other eight are external
-- commerce/content APIs (airbnb, booking, etsy, shopify, misterbnb, wikinews) and
-- the two affiliate reconciliation endpoints.
--
-- cf-ai-safety-relevance was NOT in the first pass of this migration. It surfaced
-- only when the companion test scanned the whole tree rather than the names this
-- header already knew about -- which is the argument for the test existing at
-- all.
--
-- INSERT ... ON CONFLICT DO NOTHING, never register_circuit_breaker(). The plain
-- registrar is ON CONFLICT DO UPDATE and would reset threshold/reset_timeout on
-- any row that already exists -- that is how llm.nvidia lost its deliberate 3/900
-- tuning to a *success*. Nothing here may touch an existing row.
--
-- Thresholds follow the shipped convention rather than inventing one:
--   LLM + Workers-AI  5 / 120s   (matches llm.openai.enrich-news, enrich-venue,
--                                 cf-ai-image-aesthetic)
--   External HTTP     5 / 300s   (matches ticketmaster, tomtom, rest_countries,
--                                 refuge_restrooms)

insert into public.api_circuit_breakers (api_name, state, threshold, reset_timeout_seconds)
values
  -- LLM / Workers AI — 5 failures, 2 minute cool-off.
  ('llm.marketplace-tag',              'closed', 5, 120),
  ('llm.openai.agentic-enrich',        'closed', 5, 120),
  ('llm.openai.amenity-extract',       'closed', 5, 120),
  ('llm.openai.city-enrich',           'closed', 5, 120),
  ('llm.openai.milestone-discovery',   'closed', 5, 120),
  ('llm.openai.quality-enhance',       'closed', 5, 120),
  ('llm.openai.village-enrich',        'closed', 5, 120),
  ('llm.openai.classify-personhood',   'closed', 5, 120),
  ('llm.cf.feedback-autotriage',       'closed', 5, 120),
  ('llm.editorial',                    'closed', 5, 120),
  ('llm.venue-contact-enrich',         'closed', 5, 120),
  ('cf-ai-vision',                     'closed', 5, 120),
  ('cf-ai-safety-relevance',           'closed', 5, 120),
  -- External HTTP — 5 failures, 5 minute cool-off.
  ('airbnb',                           'closed', 5, 300),
  ('booking',                          'closed', 5, 300),
  ('etsy',                             'closed', 5, 300),
  ('shopify',                          'closed', 5, 300),
  ('misterbnb',                        'closed', 5, 300),
  ('wikinews',                         'closed', 5, 300),
  ('affiliate.awin.transactions',      'closed', 5, 300),
  ('affiliate.travelpayouts.actions',  'closed', 5, 300)
on conflict (api_name) do nothing;

-- ---------------------------------------------------------------------------
do $verify$
declare
  v_missing text[];
  v_clobbered int;
begin
  select array_agg(nm order by nm) into v_missing
  from (values
    ('llm.marketplace-tag'),('llm.openai.agentic-enrich'),('llm.openai.amenity-extract'),
    ('llm.openai.city-enrich'),('llm.openai.milestone-discovery'),('llm.openai.quality-enhance'),
    ('llm.openai.village-enrich'),('llm.openai.classify-personhood'),('llm.cf.feedback-autotriage'),
    ('llm.editorial'),('llm.venue-contact-enrich'),('cf-ai-vision'),
    ('cf-ai-safety-relevance'),('airbnb'),('booking'),
    ('etsy'),('shopify'),('misterbnb'),('wikinews'),('affiliate.awin.transactions'),
    ('affiliate.travelpayouts.actions')
  ) as t(nm)
  where not exists (select 1 from public.api_circuit_breakers b where b.api_name = t.nm);

  if v_missing is not null then
    raise exception 'breakers still unregistered: %', v_missing;
  end if;

  -- NOTICE, not EXCEPTION -- and the demotion is not caution, it is that the
  -- assertion cannot mean what it says. `llm.nvidia` is NOT in this migration's
  -- VALUES list, and the INSERT is `on conflict (api_name) do nothing`, so there
  -- is no conflict clause by which this file could reach that row: the check can
  -- never observe its own effect. What it actually asserts is a LITERAL 3/900
  -- about a row production runtime owns and has silently reset before
  -- (20261128100000 records it reading 5/120 after a SUCCESS did the resetting).
  --
  -- So an exception here aborts db push -- stranding every later migration -- on
  -- a value this migration neither wrote nor can repair. That is the class that
  -- held the queue down for seven hours on 2026-09-05. The DO NOTHING is verified
  -- by reading the statement above, which is where that property actually lives;
  -- drift in the tuning is still worth SAYING, so it is still reported.
  select count(*) into v_clobbered
  from public.api_circuit_breakers
  where api_name = 'llm.nvidia' and (threshold <> 3 or reset_timeout_seconds <> 900);
  if v_clobbered > 0 then
    raise notice
      'llm.nvidia is not at its deliberate 3/900 tuning. This migration cannot have caused that (it does not list the row), but something reset it — see 20261128100000.';
  end if;

  raise notice 'registered 21 previously un-trippable circuit breakers';
end
$verify$;
