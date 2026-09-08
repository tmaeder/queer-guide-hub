-- Add the five substance pairs from rave it safe's "Gefährliche Mischungen" that
-- `substance_interactions` does not already hold.
--
-- READ THIS BEFORE ASSUMING THIS IS THE COMBICHECKER. IT IS NOT.
-- The CombiChecker (combi-checker.ch) is a separate tool by the SubsDance
-- association in Basel; raveitsafe merely links to it. It was unreachable when
-- this was written — DNS resolves (168.119.175.170) but TLS is refused from CI
-- and from the authoring environment, and a site: search returns zero indexed
-- pages — so its data was never seen, its licence was never established, and
-- NOTHING here comes from it. What this migration imports is rave it safe's own
-- PDF, which is a different and much smaller artifact. Naming it CombiChecker
-- in `source` would be a false attribution, and per-cell attribution on this
-- table is load-bearing: `substance_interaction_matrix()` credits the sources
-- computed from the cells it returns.
--
-- THE HEADLINE MEASUREMENT IS THAT THIS SOURCE IS ALMOST ENTIRELY REDUNDANT.
-- The PDF is 16 rows which expand to 33 pairs; 27 map onto tags we hold, and
-- **22 of those 27 already exist** — from tripsit (18) and eve&rave (4). It is
-- the standard harm-reduction consensus, not an independent dataset. That is
-- worth recording because it is the argument against ever importing it as a
-- corroborating voice: the unique index on (tag_a_id, tag_b_id) means a pair we
-- already hold CANNOT be duplicated under a second source name, so the schema
-- itself prevents the fake-corroboration failure — but only because nobody
-- works around it. Do not.
--
-- So this adds five rows and no more:
--   cannabis + psychedelics, cocaine + methcathinone, mdma + methcathinone,
--   ephedrine + caffeine, poppers + cannabis
--
-- GRADES COME FROM HOUSE PRECEDENT, NOT FROM THE SOURCE AND NOT FROM JUDGEMENT.
-- The PDF has no risk scale at all — every row in it is simply "dangerous" by
-- inclusion — so mapping it onto the seven-value `status` vocabulary had to be
-- anchored to the nearest existing sibling row, or this source would silently
-- re-grade the scale:
--   cannabis + psychedelics  caution   <- cannabis+lsd and cannabis+psilocybin are both caution
--   poppers + cannabis       caution   <- cocaine/mdma/methamphetamine + poppers are all caution
--   ephedrine + caffeine     caution   <- every caffeine+stimulant pair we hold is caution
--   cocaine + methcathinone  unsafe    <- cocaine+methamphetamine is unsafe; the PDF puts CAT in that same row
--   mdma + methcathinone     dangerous <- mdma+mephedrone is dangerous, same cathinone class, same
--                                         serotonin-syndrome mechanism the PDF describes
-- Note ephedrine+caffeine is graded DOWN from what the PDF's wording alone
-- ("bedrohliche Erhöhung") would suggest. Inflating one row above every one of
-- its siblings is how a risk scale stops meaning anything.
--
-- NOT ONE WORD IS TRANSLATED. The notes below are original English written from
-- the documented mechanism. The PDF supplied the PAIR LIST and the direction of
-- the interaction, which are facts; its prose is CONTACT Nightlife's.
--
-- NO `ingestion_sources` ROW IS ADDED, AND THAT IS DELIBERATE. §9 of
-- check-pipeline-health.mjs derives its watched set from
-- `ingestion_sources.target_table`, and only TripSit has a row there — which is
-- why eve&rave and FDA can only warn and never fail on staleness. There is no
-- automated refresher for a PDF, so `fetched_at` is frozen by design here
-- exactly as it is for those two. Adding a row would arm a 14-day staleness gate
-- against a source that can never satisfy it. The assertion at the bottom pins
-- the watched set to exactly one, so a later edit cannot arm it by accident.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:raveitsafe-mixtures', true);

do $mig$
declare
  r       record;
  v_bad   int;
  v_made  int := 0;
  v_a     uuid;
  v_b     uuid;
begin
  create temp table _pair (
    slug_a text, slug_b text, status text, note text, source_pair text
  ) on commit drop;

  insert into _pair (slug_a, slug_b, status, note, source_pair) values
    ('cannabis', 'psychedelics', 'caution',
     'Cannabis amplifies psychedelics unpredictably, and the combination raises the chance of a frightening experience rather than simply a stronger one. The specific concern is that it increases the risk of triggering psychosis in people who are susceptible.',
     'Cannabis + Psychedelika'),

    ('cocaine', 'methcathinone', 'unsafe',
     'Two potent stimulants raising dopamine together. The load on the heart and circulation is far greater than either alone, and impaired breathing is reported. Neither wears off in a way that makes the other safe to continue.',
     'Kokain + CAT'),

    ('mdma', 'methcathinone', 'dangerous',
     'Both raise serotonin sharply, so the combination carries a real risk of serotonin syndrome, and both raise dopamine on top of that. Expect a heavier body load, a longer and worse comedown, and a higher chance of overheating.',
     'Ecstasy + CAT'),

    ('ephedrine', 'caffeine', 'caution',
     'Additive stimulant effect on the heart and circulation, raising heart rate and blood pressure together. Dizziness is common. This pairing has a documented history of cardiovascular adverse events when taken at high doses.',
     'Ephedrin + Koffein'),

    ('poppers', 'cannabis', 'caution',
     'Poppers drop blood pressure abruptly and the heart speeds up to compensate; cannabis raises heart rate too. Together that means dizziness or fainting and a heavier load on the heart than either produces alone.',
     'Poppers + Cannabis');

  ------------------------------------------------------------------ guards
  -- Every tag must exist and be ACTIVE. A deprecated tag would produce a row
  -- that renders nowhere, which is worse than a missing row: it looks imported.
  select count(*) into v_bad from _pair p
   where not exists (select 1 from public.unified_tags t where t.slug = p.slug_a and t.status = 'active')
      or not exists (select 1 from public.unified_tags t where t.slug = p.slug_b and t.status = 'active');
  if v_bad > 0 then
    raise exception 'raveitsafe mixtures: % pair(s) name a tag that is missing or not active', v_bad;
  end if;

  -- Refuse to touch a pair another source already established. The unique index
  -- would reject it anyway; failing here says WHY instead of surfacing as a
  -- constraint violation, and keeps the redundancy measurement in the header
  -- honest over time.
  select count(*) into v_bad
    from _pair p
    join public.unified_tags ta on ta.slug = p.slug_a
    join public.unified_tags tb on tb.slug = p.slug_b
    join public.substance_interactions si
      on si.tag_a_id = least(ta.id, tb.id) and si.tag_b_id = greatest(ta.id, tb.id);
  if v_bad > 0 then
    raise exception 'raveitsafe mixtures: % pair(s) already exist from another source — re-measure, do not overwrite', v_bad;
  end if;

  ------------------------------------------------------------------ insert
  for r in select * from _pair loop
    select t.id into v_a from public.unified_tags t where t.slug = r.slug_a;
    select t.id into v_b from public.unified_tags t where t.slug = r.slug_b;

    -- least/greatest, never the authored order: substance_interactions_canonical_order
    -- CHECKs tag_a_id < tag_b_id, and that inequality is what makes the pair
    -- unordered. Writing the columns in the order they appear above would abort
    -- on roughly half the rows at random, depending on how the uuids sorted.
    insert into public.substance_interactions
      (tag_a_id, tag_b_id, status, note, source, source_url, source_pair, fetched_at, updated_at)
    values
      (least(v_a, v_b), greatest(v_a, v_b), r.status, r.note,
       'rave it safe',
       'https://www.raveitsafe.ch/wp-content/uploads/2016/12/raveitsafe_Gefahrliche-Mischungen.pdf',
       r.source_pair, now(), now());
    v_made := v_made + 1;
  end loop;

  if v_made <> 5 then
    raise exception 'raveitsafe mixtures: expected 5 inserts, made %', v_made;
  end if;

  ------------------------------------------------------------------ assertions
  select count(*) into v_bad from public.substance_interactions where source = 'rave it safe';
  if v_bad <> 5 then
    raise exception 'raveitsafe mixtures: expected 5 rows for this source, found %', v_bad;
  end if;

  -- The canonical-order CHECK is declarative, but assert it held for these rows
  -- so a future edit that hand-writes the ids fails here with a readable message.
  select count(*) into v_bad from public.substance_interactions
   where source = 'rave it safe' and tag_a_id >= tag_b_id;
  if v_bad > 0 then
    raise exception 'raveitsafe mixtures: % row(s) violate canonical pair order', v_bad;
  end if;

  -- No other source lost or gained rows.
  select count(*) into v_bad from public.substance_interactions where source = 'tripsit';
  if v_bad <> 421 then
    raise exception 'raveitsafe mixtures: tripsit row count moved to % (expected 421)', v_bad;
  end if;

  -- The staleness gate must not have armed. Only TripSit has a refresher, so it
  -- must remain the only watched source; see the header.
  select count(*) into v_bad from public.ingestion_sources
   where target_table = 'substance_interactions';
  if v_bad <> 1 then
    raise exception 'raveitsafe mixtures: % watched interaction source(s) — a source with no refresher must not be watched', v_bad;
  end if;

  raise notice 'raveitsafe mixtures: % rows added', v_made;
end
$mig$;
