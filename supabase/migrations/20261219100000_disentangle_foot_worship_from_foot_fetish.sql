-- Disentangle `foot-worship` (a PRACTICE) from `foot-fetish` (an ATTRACTION).
--
-- Both were active and both carried Wikidata Q463859 — the duplicate surfaced
-- by 20261217100000's dry run, which is how it was found: an assertion written
-- for a different pair failed on the clean corpus and reported this one.
--
-- `foot-worship` is a CHIMERA. Its name denotes the practice of adoring or
-- serving a partner's feet, but every machine-readable thing about it belongs
-- to foot fetishism:
--
--   wikidata_id     Q463859 "foot fetishism — pronounced sexual attraction to feet"
--   wikipedia_url   .../Foot_fetishism
--   long_desc       "Foot worship is a fetish where individuals derive sexual
--                    pleasure or arousal from feet…"
--   12 aliases      fétichisme-du-pied, fetichismo-del-pie, podofilia,
--                   podophilie, fußfetischismus, fußerotik … — the Wikidata
--                   SITELINK DUMP for Q463859, i.e. translations of "foot
--                   fetishism", not of "foot worship"
--
-- plus three that belong to NEITHER row — `toejob`, `foot-fuck`, `footfuck` —
-- which are synonyms of `footjob`, the act revived in 20261217100000. That row
-- has now yielded wrong-concept aliases three times (`footjob`/`foot-job` went
-- in the previous migration), which is itself the signal: a tag whose alias set
-- describes a different concept is not a tag with messy aliases, it is a tag
-- filed under the wrong identity.
--
-- `foot-fetish` is the row that legitimately owns Q463859: its prose is real
-- foot-fetishism content (partialism, podophilia, the 14% figure), it is
-- human_reviewed, and it is the seo_indexable one of the pair.
--
-- RESOLUTION: keep both, because they are genuinely two concepts — the
-- attraction and the practice — and the corpus already distinguishes that pair
-- elsewhere (footjob the act vs foot fetishism the attraction, Q107417158 vs
-- Q463859). A merge was considered and rejected: it would collapse a real
-- distinction to tidy an identifier.
--
-- `foot-worship` therefore gives up the identifiers that were never its own and
-- gets prose about the practice. Its wikidata_id becomes NULL rather than some
-- nearer-looking item, because THERE IS NO Wikidata item for foot worship as a
-- distinct practice, and a plausible-but-wrong QID regenerates wrong data
-- forever — tag_medical_codes_sync and the wikidata hierarchy sync both rebuild
-- from that identifier weekly, so NULL regenerates nothing and a guess
-- regenerates a lie. Prefer NULL to a guess.
--
-- THE CATEGORIES WERE ALSO SWAPPED, on all three rows, which is the same defect
-- wearing different clothes: the attraction sat in Practices & Play while both
-- practices sat in Fetishes.
--
--   foot-fetish   Practices & Play → Fetishes          (an attraction)
--   foot-worship  Fetishes         → Practices & Play  (a practice)
--   foot-play     Fetishes         → Practices & Play  (a practice; its own
--                                    description calls it "an umbrella term for
--                                    many activities")
--
-- foot-play is included deliberately. It is not part of the duplicate, but
-- moving one practice out of Fetishes and leaving its sibling behind would
-- leave the taxonomy less coherent than it was found, and this is a
-- category-only change to a row whose prose already says what it is.
--
-- Re-filing is done by writing `category_id` ALONE. The BEFORE trigger derives
-- the denormalized `category` text from it and the AFTER trigger demotes the
-- old primary junction row and promotes the new one — and the junction is what
-- /tags/:slug renders, while the text is what the search facet renders. Writing
-- either of those directly propagates nothing.
--
-- NEW PROSE IS NOT PUBLISHED PROSE. `foot-worship` is currently
-- human_reviewed=true, but that flag was earned by prose this migration
-- replaces, so it is cleared along with verification_status. It stays
-- seo_indexable=false. `foot-fetish` keeps its review flags and its prose
-- untouched — it only changes category.

do $mig$
declare
  v_bad       int;
  v_worship   uuid;
  v_fetish    uuid;
  v_job       uuid;
  v_play      uuid;
  v_fetishes  uuid;
  v_practices uuid;
  v_moved_f   int;
  v_moved_j   int;
begin
  -- Declared inside the block so it shares the transaction with the writes.
  -- Load-bearing here, unlike in the previous migration: `foot-worship` and
  -- `foot-fetish` are BOTH human_reviewed=true, and log_unified_tag_change
  -- RAISEs when an actor matching 'system:%' modifies such a row. The default
  -- when nothing is declared is 'system:trigger', so without this the whole
  -- migration aborts.
  perform set_config('app.actor', 'migration:disentangle-foot-worship', true);

  select id into v_worship from public.unified_tags where slug='foot-worship' and status='active';
  select id into v_fetish  from public.unified_tags where slug='foot-fetish'  and status='active';
  select id into v_job     from public.unified_tags where slug='footjob'      and status='active';
  select id into v_play    from public.unified_tags where slug='foot-play'    and status='active';

  select id into v_fetishes  from public.tag_categories where slug='fetishes-interests';
  select id into v_practices from public.tag_categories where slug='practices-play';

  if v_worship is null or v_fetish is null or v_job is null or v_play is null
     or v_fetishes is null or v_practices is null then
    raise exception 'disentangle foot-worship: a required tag or category is missing or inactive — re-read before proceeding';
  end if;

  ---------------------------------------------------------------- precondition
  -- The duplicate this migration exists to resolve must actually be present.
  -- If a sibling session already merged or re-pointed one of them, the premise
  -- is gone and guessing from here would fight their decision.
  select count(*) into v_bad
    from public.unified_tags where status='active' and wikidata_id='Q463859';
  if v_bad <> 2 then
    raise exception
      'disentangle foot-worship: expected exactly 2 active tags on Q463859, found % — resolve by hand', v_bad;
  end if;

  ------------------------------------------------------- re-parent the aliases
  -- The nine foot-fetishism translations follow the concept they name, onto the
  -- row that now solely owns it. trg_tag_alias_reject_shadow fires on UPDATE OF
  -- canonical_tag_id, so this would abort if any alias_slug were itself an
  -- active tag slug; verified none is, and the trigger is the backstop.
  update public.tag_aliases
     set canonical_tag_id = v_fetish
   where canonical_tag_id = v_worship
     and lower(alias_slug) not in ('toejob','foot-fuck','footfuck');
  get diagnostics v_moved_f = row_count;

  -- The three footjob synonyms go to footjob. They describe an act performed
  -- WITH the feet, not an attraction to them and not a devotional practice.
  update public.tag_aliases
     set canonical_tag_id = v_job
   where canonical_tag_id = v_worship
     and lower(alias_slug) in ('toejob','foot-fuck','footfuck');
  get diagnostics v_moved_j = row_count;

  ------------------------------------------------------------ foot-worship row
  update public.unified_tags set
    wikidata_id       = null,
    wikipedia_url     = null,
    description       = 'The practice of adoring, attending to or serving a partner''s feet.',
    short_description = 'Devotional or service-oriented attention to a partner''s feet.',
    long_description  = 'Foot worship is a practice rather than an attraction: massaging, kissing, licking or otherwise attending to a partner''s feet, usually framed as devotion, service or submission. It appears most often in dominance and submission dynamics, where the meaning comes from the deference the act expresses as much as from the contact itself. It is distinct from a foot fetish, which is the attraction to feet — the two often go together and neither requires the other, and plenty of foot worship happens because one partner enjoys receiving it and the other enjoys serving. Feet carry ordinary skin-contact infection risks; athlete''s foot, verrucas and small cuts are the practical considerations.',
    category_id       = v_practices,
    human_reviewed    = false,
    verification_status = 'unverified',
    seo_indexable     = false
  where id = v_worship;

  ------------------------------------------------------- category-only re-files
  -- Prose and review flags untouched on both: these rows are correct, they were
  -- merely filed under the wrong heading.
  update public.unified_tags set category_id = v_fetishes  where id = v_fetish;
  update public.unified_tags set category_id = v_practices where id = v_play;

  ------------------------------------------------------------------ assertions
  -- The defect itself: exactly one active tag may carry Q463859.
  select count(*) into v_bad
    from public.unified_tags where status='active' and wikidata_id='Q463859';
  if v_bad <> 1 then
    raise exception 'disentangle foot-worship: % active tag(s) still carry Q463859, want exactly 1', v_bad;
  end if;

  if exists (select 1 from public.unified_tags
              where id=v_worship and (wikidata_id is not null or wikipedia_url is not null)) then
    raise exception 'disentangle foot-worship: the practice row still carries an identifier that names the attraction';
  end if;

  -- No alias may remain on foot-worship, and the moves must have landed. Both
  -- directions are asserted: a guarded no-op reads exactly like success.
  if exists (select 1 from public.tag_aliases where canonical_tag_id = v_worship) then
    raise exception 'disentangle foot-worship: aliases still hang off the practice row';
  end if;
  if v_moved_f <> 9 or v_moved_j <> 3 then
    raise exception
      'disentangle foot-worship: moved % alias(es) to foot-fetish and % to footjob, want 9 and 3', v_moved_f, v_moved_j;
  end if;
  if not exists (select 1 from public.tag_aliases
                  where canonical_tag_id=v_job and lower(alias_slug)='toejob') then
    raise exception 'disentangle foot-worship: toejob did not land on footjob';
  end if;

  -- Categories, checked on BOTH representations the two reader surfaces use:
  -- the denormalized text (search facet) and the primary junction row
  -- (/tags/:slug). Asserting only one would pass while the other stayed stale.
  select count(*) into v_bad from public.unified_tags t
   where (t.id = v_fetish  and t.category <> 'Fetishes')
      or (t.id = v_worship and t.category <> 'Practices & Play')
      or (t.id = v_play    and t.category <> 'Practices & Play');
  if v_bad > 0 then
    raise exception 'disentangle foot-worship: % row(s) have the wrong denormalized category text', v_bad;
  end if;

  select count(*) into v_bad
    from (values (v_fetish, 'Fetishes'), (v_worship, 'Practices & Play'), (v_play, 'Practices & Play'))
         as want(tag_id, cat)
   where not exists (
     select 1 from public.tag_category_assignments tca
       join public.tag_categories c on c.id = tca.category_id
      where tca.tag_id = want.tag_id and tca.is_primary and c.name = want.cat);
  if v_bad > 0 then
    raise exception 'disentangle foot-worship: % row(s) have the wrong PRIMARY junction category', v_bad;
  end if;

  -- Exactly one primary per tag. The documented two-primaries hazard fires when
  -- a re-file crosses categories, which all three of these do.
  select count(*) into v_bad from (
    select tca.tag_id from public.tag_category_assignments tca
     where tca.tag_id in (v_fetish, v_worship, v_play, v_job) and tca.is_primary
     group by tca.tag_id having count(*) <> 1
  ) x;
  if v_bad > 0 then
    raise exception 'disentangle foot-worship: % row(s) do not have exactly one primary category', v_bad;
  end if;

  -- The fetishism prose is gone from the practice row.
  if exists (select 1 from public.unified_tags
              where id=v_worship and long_description ilike '%is a fetish where%') then
    raise exception 'disentangle foot-worship: the practice row still carries the fetishism long_description';
  end if;

  -- Rewritten prose is unpublished prose.
  if exists (select 1 from public.unified_tags
              where id=v_worship
                and (seo_indexable or coalesce(human_reviewed,false) or verification_status <> 'unverified')) then
    raise exception 'disentangle foot-worship: the rewritten row is publishable — it must wait for a human';
  end if;

  -- foot-fetish keeps its review status and its indexability: it changed shelf,
  -- not content.
  if not exists (select 1 from public.unified_tags
                  where id=v_fetish and human_reviewed and seo_indexable
                    and wikidata_id='Q463859') then
    raise exception 'disentangle foot-worship: foot-fetish lost review status, indexability or its QID';
  end if;

  -- Corpus-wide CI zero-invariant.
  select count(*) into v_bad from public.unified_tags
   where status='active' and seo_indexable
     and coalesce(nullif(btrim(description),''), short_description) is null;
  if v_bad > 0 then
    raise exception 'disentangle foot-worship: % indexable row(s) corpus-wide have no description', v_bad;
  end if;

  raise notice 'disentangle foot-worship: % alias(es) → foot-fetish, % → footjob, 3 rows re-filed',
    v_moved_f, v_moved_j;
end
$mig$;
