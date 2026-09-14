-- Link the rope vocabulary together, and reject three broader links that are
-- wrong in the DISOWNED entity's sense rather than the tag's.
--
-- The seven-glossary comparison (50500101100000-100700) added 16 rope terms and
-- revived 13, and every one of them landed as an island: `nerve-compression`
-- is the thing a reader needs while looking at `box-tie`, and nothing connected
-- them. This file is the "add links" half.
--
-- HAND-CURATED, AND THAT IS THE ONLY SANCTIONED WAY TO WRITE THESE. The LLM
-- relation verifier (`tag_relation_verify`) is DISABLED: 20261012090300
-- measured its `broader` arm at ~29% correct across its first 46 proposals,
-- asserting SIBLINGS as parent/child (`Heterosexual`->`Homosexual`), two
-- BACKWARDS, and `HIV Transmission`->`AIDS` — every one at confidence 1.000.
-- So `broader` here is restricted to links that are unambiguously "X is a kind
-- of Y", and anything where the honest answer is "these sit beside each other"
-- is `related` instead. Siblings-as-parent is the specific error being avoided:
-- `jute` and `hemp-rope` are both natural fibres and are RELATED, not one
-- under the other; `chest-harness` and `hip-harness` likewise.
--
-- DIRECTION. `get_tag_ontology` reads `broader` as source -> target where the
-- TARGET is the parent, and derives `narrower` by inverting the same rows. It
-- shows `broader` at review_status in ('auto','approved') and `related` at
-- 'approved' ONLY, so every row here is written `approved` — an `auto`
-- `related` row would be stored and never displayed.
--
-- ============================================================ the three rejects
--
-- THE 2026-04-27 SWEEP'S CONTAMINATION REACHED `tag_relations` TOO, AND NOTHING
-- HAS EVER LOOKED THERE. 53 relations sit on tags whose Wikidata entity a
-- repair later disowned; 21 of those are `broader` and currently DISPLAY.
--
-- All 21 were read by hand, and the result is the argument against a blanket
-- clear: 17 are CORRECT. The taxonomic parent usually survives a wrong QID,
-- because it was chosen from the tag's real category context rather than from
-- the entity — `salvia-divinorum`->`psychedelics` and `tobacco`->`stimulants`
-- are right even though both QIDs were botanical species, and
-- `fentanyl-test-strips`->`harm-reduction` is right even though the QID was a
-- journal article. Clearing the cohort would have destroyed all of them. This
-- is the same rule 20261008100000 recorded for the concept class: a broader
-- identifier does not make the row wrong.
--
-- What separates the three below is a sharp, statable signature: THE PARENT
-- MAKES SENSE ONLY FOR THE DISOWNED ENTITY, NOT FOR THE TAG.
--
--   suspension -> punishment      the QID was Q87406427, "account suspension",
--                                 and a suspension IS a punishment in that
--                                 sense. The tag is rope suspension. Same root
--                                 cause as the account-ban prose 50500101100000
--                                 replaces — and the prose fix alone would have
--                                 left this standing, which is the point.
--   aftercare -> recreational     the QID was "after-school activity", which is
--                                 recreation. Aftercare is the care people give
--                                 each other after an intense scene. This one
--                                 matters most: `aftercare` is core consent
--                                 vocabulary, active and seo_indexable.
--   vers -> genre-poetry          the QID was "poem" — vers, as in VERSE. The
--                                 tag is the queer term for versatile. An
--                                 indexable identity term filed under a book
--                                 genre.
--
-- REJECTED, NOT DELETED. `tag_relations` has a UNIQUE key on
-- (source_tag_id, target_tag_id, relation_type), so a row left at
-- review_status='rejected' is a TOMBSTONE that the verifier's ignoreDuplicates
-- upsert cannot re-propose — the mechanism 20261012090300 established for its
-- own 46 rejected proposals. Deleting them would let the link come back.
--
-- NOT REJECTED, each read and left alone rather than swept:
--   schoolgirl -> student   borderline. The tag is an age-play archetype, so
--                           `student` is the literal reading — but it is not
--                           wrong the way the three above are, and a borderline
--                           call is not grounds for a tombstone that blocks it
--                           forever.
--   workshop -> workshops   junk, but it is a singular/plural DUPLICATE-TAG
--                           problem, not a wrong-sense one. Rejecting the link
--                           would paper over the duplicate. Recorded here so
--                           the next pass sees it named rather than re-finding
--                           it.
--
-- Every insert is `on conflict do nothing`, so an existing row always wins —
-- including a rejected tombstone somebody else wrote. There are none among
-- these pairs today (checked), but a migration that can silently un-reject a
-- human's decision is the wrong shape regardless.

set local statement_timeout = '600s';

select set_config('app.actor', 'migration:rope-glossary-links', true);

do $mig$
declare
  v_n        int;
  v_rejected int := 0;
  v_added    int := 0;
begin
  ------------------------------------------------------------- 1. the rejects
  -- Guarded on the CURRENT state: only a link that is still displaying
  -- (auto/approved) is tombstoned, so re-running is a no-op and a human who
  -- has already dispositioned one of these is not overridden.
  update public.tag_relations r set review_status = 'rejected'
    from public.unified_tags s, public.unified_tags t
   where r.source_tag_id = s.id and r.target_tag_id = t.id
     and r.relation_type = 'broader'
     and r.review_status in ('auto','approved')
     and (s.slug, t.slug) in (('suspension','punishment'),
                              ('aftercare','recreational'),
                              ('vers','genre-poetry'));
  get diagnostics v_rejected = row_count;
  raise notice 'rope glossary links: % wrong broader link(s) tombstoned', v_rejected;

  ------------------------------------------------------------ 2. broader links
  -- Only unambiguous "X is a kind of Y". Anything weaker is `related` below.
  insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
  select c.id, p.id, 'broader', 1.000, 'approved'
    from (values
      -- "A box tie is a chest harness with the arms bound into it" — the box
      -- tie's own body says so.
      ('box-tie',            'chest-harness'),
      ('partial-suspension', 'suspension'),
      ('newaza',             'rope-bondage'),
      ('semenawa',           'shibari'),
      -- matches the existing pony-play -> pet-play and puppy-play -> pet-play
      ('kitten-play',        'pet-play'),
      ('day-collar',         'collar')
    ) as v(child, parent)
    join public.unified_tags c on c.slug = v.child  and c.status = 'active'
    join public.unified_tags p on p.slug = v.parent and p.status = 'active'
  on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
  get diagnostics v_n = row_count; v_added := v_added + v_n;

  ------------------------------------------------------------ 3. related links
  -- Symmetric: get_tag_ontology matches on source OR target, so one row per
  -- pair is enough and a mirror row would only be a duplicate to maintain.
  insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
  select a.id, b.id, 'related', 1.000, 'approved'
    from (values
      -- The safety cluster. These are the links that actually matter: the
      -- reader looking at a box tie is the reader who needs to know what
      -- wrist drop is.
      ('nerve-compression', 'box-tie'),
      ('nerve-compression', 'chest-harness'),
      ('nerve-compression', 'suspension'),
      ('nerve-compression', 'rope-marks'),
      ('safety-shears',     'suspension'),
      ('safety-shears',     'mummification'),
      ('hard-point',         'suspension'),
      ('hard-point',         'partial-suspension'),
      -- Technique. Siblings, deliberately NOT broader.
      ('single-column-tie', 'double-column-tie'),
      ('chest-harness',     'hip-harness'),
      ('futomomo',          'partial-suspension'),
      ('kikkou',            'karada'),
      ('jute',              'hemp-rope'),
      ('newaza',            'suspension'),
      -- Headspaces, all three siblings.
      ('topspace',          'subspace'),
      ('topspace',          'domspace')
    ) as v(lhs, rhs)
    join public.unified_tags a on a.slug = v.lhs and a.status = 'active'
    join public.unified_tags b on b.slug = v.rhs and b.status = 'active'
  on conflict (source_tag_id, target_tag_id, relation_type) do nothing;
  get diagnostics v_n = row_count; v_added := v_added + v_n;

  raise notice 'rope glossary links: % relation(s) added', v_added;

  ---------------------------------------------------------- 4. postconditions
  -- The three wrong links must no longer display. Asserted on the DISPLAY
  -- predicate (auto/approved) rather than on row count, because the fix is a
  -- status change and the row deliberately survives as a tombstone.
  select count(*) into v_n
    from public.tag_relations r
    join public.unified_tags s on s.id = r.source_tag_id
    join public.unified_tags t on t.id = r.target_tag_id
   where r.relation_type = 'broader'
     and r.review_status in ('auto','approved')
     and (s.slug, t.slug) in (('suspension','punishment'),
                              ('aftercare','recreational'),
                              ('vers','genre-poetry'));
  if v_n > 0 then
    raise exception 'rope glossary links: % wrong broader link(s) still display', v_n;
  end if;

  -- …and they must still EXIST, or the tombstone is gone and the verifier can
  -- re-propose them.
  select count(*) into v_n
    from public.tag_relations r
    join public.unified_tags s on s.id = r.source_tag_id
    join public.unified_tags t on t.id = r.target_tag_id
   where r.relation_type = 'broader' and r.review_status = 'rejected'
     and (s.slug, t.slug) in (('suspension','punishment'),
                              ('aftercare','recreational'),
                              ('vers','genre-poetry'));
  if v_n <> 3 then
    raise exception 'rope glossary links: expected 3 tombstones, found %', v_n;
  end if;

  -- Every link written must be reachable through the RPC the page actually
  -- reads. A `related` row at review_status <> 'approved' is stored and never
  -- displayed, which is the failure this assertion exists to catch.
  select count(*) into v_n
    from public.tag_relations r
    join public.unified_tags s on s.id = r.source_tag_id
   where s.slug in ('box-tie','partial-suspension','newaza','semenawa','kitten-play','day-collar',
                    'nerve-compression','safety-shears','hard-point','single-column-tie',
                    'chest-harness','futomomo','kikkou','jute','topspace')
     and r.review_status not in ('approved','rejected');
  if v_n > 0 then
    raise exception 'rope glossary links: % row(s) would never display', v_n;
  end if;

  -- THE END-STATE ASSERTION, and the one this file most needed. `on conflict
  -- do nothing` makes the inserts idempotent, which also means they can add
  -- NOTHING and still succeed — so counting insertions proves nothing on a
  -- re-run, and a join that silently matched zero rows would look identical to
  -- a clean second apply. Assert that every link EXISTS in the exact direction
  -- instead. (Found by dry-running: the insert reported 20 of 22 added, and
  -- establishing that the other 2 already existed rather than being dropped
  -- took a separate query the migration should not have needed.)
  select count(*) into v_n
    from (values
      ('broader','box-tie','chest-harness'),('broader','partial-suspension','suspension'),
      ('broader','newaza','rope-bondage'),('broader','semenawa','shibari'),
      ('broader','kitten-play','pet-play'),('broader','day-collar','collar'),
      ('related','nerve-compression','box-tie'),('related','nerve-compression','chest-harness'),
      ('related','nerve-compression','suspension'),('related','nerve-compression','rope-marks'),
      ('related','safety-shears','suspension'),('related','safety-shears','mummification'),
      ('related','hard-point','suspension'),('related','hard-point','partial-suspension'),
      ('related','single-column-tie','double-column-tie'),('related','chest-harness','hip-harness'),
      ('related','futomomo','partial-suspension'),('related','kikkou','karada'),
      ('related','jute','hemp-rope'),('related','newaza','suspension'),
      ('related','topspace','subspace'),('related','topspace','domspace')
    ) as v(kind, lhs, rhs)
   where not exists (
     select 1 from public.tag_relations r
       join public.unified_tags a on a.id = r.source_tag_id
       join public.unified_tags b on b.id = r.target_tag_id
      where a.slug = v.lhs and b.slug = v.rhs and r.relation_type = v.kind);
  if v_n > 0 then
    raise exception 'rope glossary links: % of 22 curated link(s) are missing', v_n;
  end if;

  -- A broader link must never point a tag at itself: get_tag_ontology would
  -- render the term as its own parent AND its own child.
  select count(*) into v_n from public.tag_relations
   where source_tag_id = target_tag_id;
  if v_n > 0 then
    raise exception 'rope glossary links: % self-referential relation(s)', v_n;
  end if;
end
$mig$;
