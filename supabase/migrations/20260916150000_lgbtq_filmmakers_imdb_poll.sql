-- LGBTQ Filmmakers — IMDb poll plOZ91NUvMo
-- https://www.imdb.com/poll/plOZ91NUvMo/  (created 2017-06-24 by user "yrnej")
--
-- THE POLL IS NOT AN IDENTITY SOURCE. Its title reads "LGBTQ Filmmakers" but the
-- question it actually asks is: "which screenwriters and/or directors who often tell
-- LGBTQ stories present the most interesting films?" — that is a statement about
-- subject matter, not about the filmmaker. Ang Lee is on the list for Brokeback
-- Mountain and has no public LGBTQ identity; treating the poll as a roster would
-- have asserted one for him as a DB fact. `lgbti_connection` is therefore set here
-- ONLY from a Wikidata statement (P91 sexual orientation / P21 gender identity),
-- recorded per row in field_provenance so every value can be traced and reverted.
-- Filmmakers with no such statement are QUEUED for human review, never written.
-- See personalities_lgbti_connection_vocab + the 2026-06-05 trust & safety audit.
--
-- 20 of the 21 already existed in `personalities`; only Ang Lee is new. Two QIDs had
-- to be resolved by IMDb id rather than by name — a first pass guessed Q170572 for
-- Ang Lee, which is Alec Baldwin.

-- ---------------------------------------------------------------------------
-- 1. Ang Lee — the one filmmaker not already in the corpus.
--    lgbti_connection = 'representation': his work depicts LGBTQ lives. This makes
--    no claim about him, which is the whole point.
-- ---------------------------------------------------------------------------
insert into public.personalities (
  name, slug, wikidata_qid, birth_date, is_living, profession, nationality,
  description, bio, visibility, review_status, verification_status,
  lgbti_connection, lgbti_connection_source, external_ids,
  field_provenance, enrichment_status
)
select
  'Ang Lee', 'ang-lee', 'Q160726', date '1954-10-23', true,
  'Regisseur/in; Autor/in; Produzent/in', 'Taiwan',
  'Taiwanese film director, screenwriter and producer',
  'Taiwanese director, screenwriter and producer. Directed Brokeback Mountain (2005) and The Wedding Banquet (1993), both central works of LGBTQ cinema, and won the Academy Award for Best Director twice.',
  'draft', 'pending', 'pending',
  'representation', 'imdb_poll:plOZ91NUvMo',
  jsonb_build_object('imdb', 'nm0000487'),
  jsonb_build_object('lgbti_connection', jsonb_build_object(
    'source', 'imdb_poll:plOZ91NUvMo',
    'basis', 'listed as a director who tells LGBTQ stories; no identity claim',
    'wikidata_p91', 'absent',
    'set_at', '2026-08-22')),
  jsonb_build_object('imdb_poll_lgbtq_filmmakers', jsonb_build_object(
    'state', 'imported', 'poll', 'plOZ91NUvMo', 'at', '2026-08-22'))
where not exists (
  select 1 from public.personalities where wikidata_qid = 'Q160726' or slug = 'ang-lee'
);

-- ---------------------------------------------------------------------------
-- 2. Lisa Cholodenko had no wikidata_qid at all — resolved via IMDb nm0158966.
-- ---------------------------------------------------------------------------
update public.personalities p set
  wikidata_qid = 'Q258525',
  birth_date   = coalesce(p.birth_date, date '1964-06-05'),
  external_ids = coalesce(p.external_ids, '{}'::jsonb) || jsonb_build_object('imdb', 'nm0158966')
where p.slug = 'lisa-cholodenko'
  and p.wikidata_qid is null
  and not exists (select 1 from public.personalities x where x.wikidata_qid = 'Q258525');

-- ---------------------------------------------------------------------------
-- 3. lgbti_connection from Wikidata — fill-if-unset ONLY.
--    A row already carrying a curated value (Almodóvar 'community_member',
--    Waters / Black 'activist') is never overwritten: 'community_member' is the
--    weaker statement and would discard editorial work.
-- ---------------------------------------------------------------------------
with evidence(qid, connection, prop, claim) as (values
  ('Q505580', 'community_member', 'P91', 'Q6636'),   -- Kenneth Anger — gay
  ('Q708899', 'community_member', 'P91', 'Q6636'),   -- Gregg Araki — gay
  ('Q441722', 'community_member', 'P91', 'Q6649'),   -- Jamie Babbit — lesbian
  ('Q258525', 'community_member', 'P91', 'Q6649'),   -- Lisa Cholodenko — lesbian
  ('Q551861', 'community_member', 'P91', 'Q6636'),   -- Xavier Dolan — gay
  ('Q44426',  'community_member', 'P91', 'Q43200'),  -- R. W. Fassbinder — bisexual
  ('Q446580', 'community_member', 'P91', 'Q6636'),   -- Todd Haynes — gay
  ('Q282787', 'community_member', 'P91', 'Q6636'),   -- Derek Jarman — gay
  ('Q443995', 'community_member', 'P21', 'Q48270'),  -- J. C. Mitchell — non-binary
  ('Q266535', 'community_member', 'P91', 'Q6636'),   -- François Ozon — gay
  ('Q25120',  'community_member', 'P91', 'Q6636'),   -- Pier Paolo Pasolini — gay
  ('Q270620', 'community_member', 'P91', 'Q6649'),   -- Rose Troche — lesbian
  ('Q25186',  'community_member', 'P91', 'Q6636'),   -- Gus Van Sant — gay
  ('Q445198', 'community_member', 'P91', 'Q6636')    -- A. Weerasethakul — gay
)
update public.personalities p set
  lgbti_connection        = e.connection,
  lgbti_connection_source = 'wikidata:' || e.prop,
  field_provenance = coalesce(p.field_provenance, '{}'::jsonb) || jsonb_build_object(
    'lgbti_connection', jsonb_build_object(
      'source', 'wikidata', 'property', e.prop, 'statement', e.claim,
      'qid', e.qid, 'set_at', '2026-08-22')),
  enrichment_status = coalesce(p.enrichment_status, '{}'::jsonb) || jsonb_build_object(
    'imdb_poll_lgbtq_filmmakers', jsonb_build_object(
      'state', 'enriched', 'poll', 'plOZ91NUvMo', 'at', '2026-08-22'))
from evidence e
where p.wikidata_qid = e.qid
  and (p.lgbti_connection is null or p.lgbti_connection = 'unclear');

-- ---------------------------------------------------------------------------
-- 4. Todd Haynes carried lgbti_connection_source = 'Gay adult performer' —
--    residue of the adult-cohort pollution, factually wrong about him.
--    Step 3 rewrites it only if it also moved his connection off 'unclear';
--    this clears the string in the case where it did not.
-- ---------------------------------------------------------------------------
update public.personalities
set lgbti_connection_source = 'wikidata:P91'
where wikidata_qid = 'Q446580'
  and lgbti_connection_source = 'Gay adult performer';

-- ---------------------------------------------------------------------------
-- 5. Two dead filmmakers were flagged is_living = true. Kenneth Anger died
--    2023-05-11 and John Schlesinger 2003-07-25 (both Wikidata P570).
--    death_date must be set together with is_living or the consistency trigger
--    and personalities_birth_before_death disagree.
-- ---------------------------------------------------------------------------
update public.personalities set
  death_date = date '2023-05-11', is_living = false,
  field_provenance = coalesce(field_provenance, '{}'::jsonb) || jsonb_build_object(
    'death_date', jsonb_build_object('source', 'wikidata', 'property', 'P570', 'qid', 'Q505580'))
where wikidata_qid = 'Q505580' and death_date is null;

update public.personalities set
  death_date = date '2003-07-25',
  birth_date = coalesce(birth_date, date '1926-02-16'),
  is_living  = false,
  field_provenance = coalesce(field_provenance, '{}'::jsonb) || jsonb_build_object(
    'death_date', jsonb_build_object('source', 'wikidata', 'property', 'P570', 'qid', 'Q55303'))
where wikidata_qid = 'Q55303' and death_date is null;

update public.personalities set birth_date = date '1970-11-16'
where wikidata_qid = 'Q441722' and birth_date is null;

-- ---------------------------------------------------------------------------
-- 6. IMDb ids for the whole cohort — a stable external key that is not a name,
--    so a future refresh cannot re-acquire the wrong human.
-- ---------------------------------------------------------------------------
with ids(qid, imdb) as (values
  ('Q55171','nm0000264'),   ('Q505580','nm0001910'), ('Q708899','nm0000777'),
  ('Q717302','nm0085257'),  ('Q441722','nm0044803'), ('Q258525','nm0158966'),
  ('Q551861','nm0230859'),  ('Q1381702','nm0258531'),('Q44426','nm0001202'),
  ('Q446580','nm0001331'),  ('Q282787','nm0418746'), ('Q328137','nm0432264'),
  ('Q160726','nm0000487'),  ('Q443995','nm0593463'), ('Q266535','nm0654830'),
  ('Q25120','nm0001596'),   ('Q55303','nm0772259'),  ('Q270620','nm0873266'),
  ('Q25186','nm0001814'),   ('Q314926','nm0000691'), ('Q445198','nm0917405')
)
update public.personalities p
set external_ids = coalesce(p.external_ids, '{}'::jsonb) || jsonb_build_object('imdb', i.imdb)
from ids i
where p.wikidata_qid = i.qid
  and coalesce(p.external_ids->>'imdb', '') is distinct from i.imdb;

-- ---------------------------------------------------------------------------
-- 7. Rob Epstein, Isaac Julien and John Schlesinger carry no Wikidata P91.
--    All three are widely described as gay, but "widely described" is not a
--    citation and this column is an outing surface. Queue for a human instead.
--    personality_review_queue is a VIEW over entity_review_queue since the five
--    queues were folded together — a view cannot carry ON CONFLICT, so the
--    insert targets the base table and its uq_erq_open arbiter.
-- ---------------------------------------------------------------------------
insert into public.entity_review_queue (entity_type, entity_id, field, proposed_value, citations, confidence, model)
select 'personality', p.id, 'lgbti_connection',
       to_jsonb('community_member'::text),
       jsonb_build_array(jsonb_build_object(
         'url', 'https://www.imdb.com/poll/plOZ91NUvMo/',
         'note', 'Listed in the IMDb poll "LGBTQ Filmmakers". The poll asks who TELLS '
              || 'LGBTQ stories, so it does not evidence identity. Wikidata carries no '
              || 'P91 for this person. Needs a named, citable source before publishing.')),
       null, 'manual:imdb-poll-import'
from public.personalities p
where p.wikidata_qid in ('Q1381702', 'Q328137', 'Q55303')
  and (p.lgbti_connection is null or p.lgbti_connection = 'unclear')
  and not exists (
    select 1 from public.entity_review_queue q
    where q.entity_type = 'personality' and q.entity_id = p.id
      and q.field = 'lgbti_connection' and q.status = 'open'
  );

-- ---------------------------------------------------------------------------
-- 8. Films → filmmakers. NO listings are created: marketplace_listings is a
--    shop catalogue (0 of 61,627 active rows lack a buy link) and there is no
--    source that turns an IMDb title into a priced, purchasable product. What
--    follows links the films these directors made that the catalogue ALREADY
--    stocks.
--
--    Every pairing was verified against the merchant's own product page rather
--    than by title match. That was load-bearing: salzgeber's "Fireworks" is
--    Giuseppe Fiorello's 2023 Italian film, NOT Kenneth Anger's 1947 short, and
--    a title match would have attributed it to Anger. "Pedro" is directed by
--    Nick Oceano and only WRITTEN by Dustin Lance Black, hence 'screenwriter'.
-- ---------------------------------------------------------------------------
alter table public.personality_relationships
  drop constraint personality_relationships_target_type_check;

alter table public.personality_relationships
  add constraint personality_relationships_target_type_check
  check (target_type = any (array['personality','venue','event','queer_village','marketplace']));

insert into public.personality_relationships
  (source_personality_id, target_type, target_entity_id, relationship_type, weight, source, detail)
select p.id, 'marketplace', f.listing_id, f.rel, 1.0, 'manual:imdb-poll-import',
       jsonb_build_object('film', f.film, 'year', f.yr,
                          'verified_against', 'merchant product page')
from (values
  ('Q282787', '31b9c885-b203-469e-9448-bb7104629bf6'::uuid, 'director',   'Caravaggio',                 1986),
  ('Q282787', '68baad2f-35e4-4784-9002-8cab649e98f5'::uuid, 'director',   'Sebastiane',                 1976),
  ('Q282787', 'b70bba43-75ca-4e01-b7cf-0e1ac632aab8'::uuid, 'director',   'Edward II',                  1991),
  ('Q328137', 'f08dd9b7-9de9-4021-9923-a258c116dae9'::uuid, 'director',   'Derek',                      2008),
  ('Q1381702','097ffde3-ff9e-4cbc-8ec8-f3fc0fcebd7f'::uuid, 'director',   'The Celluloid Closet',       1995),
  ('Q1381702','33565f88-b29f-41c3-8527-199971aef468'::uuid, 'director',   'The Times of Harvey Milk',   1984),
  ('Q441722', 'b602e204-6caf-445a-9623-9a5b76364120'::uuid, 'director',   'Itty Bitty Titty Committee', 2007),
  ('Q551861', '0d2fc0fd-e96f-47cb-9079-31e7fbb0b808'::uuid, 'director',   'Herzensbrecher (Heartbeats)',2010),
  ('Q717302', '60eb7a67-1a73-4e6b-9fb1-bf99939b5c70'::uuid, 'screenwriter','Pedro',                     2008)
) as f(qid, listing_id, rel, film, yr)
join public.personalities p on p.wikidata_qid = f.qid
where exists (select 1 from public.marketplace_listings m where m.id = f.listing_id)
  and not exists (
    select 1 from public.personality_relationships r
    where r.source_personality_id = p.id
      and r.target_type = 'marketplace'
      and r.target_entity_id = f.listing_id
  );
