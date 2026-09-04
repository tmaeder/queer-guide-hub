-- Close out the anorgasmia / orgasmic-dysfunction duplicate, and take a clinical
-- sexual dysfunction off the site's Fetishes shelf.
--
-- Held open since 20261217100000, which revived `footjob` and deliberately did
-- NOT revive `anorgasmia`, because `anorgasmia` and `orgasmic-dysfunction` are
-- the SAME concept — same Wikidata item Q1772397, and the live row's own
-- long_description opens "Anorgasmia is a type of sexual dysfunction…".
-- Reviving would have produced two live rows for one concept. That decision
-- stands; this migration records it in the schema instead of leaving it as a
-- comment in a migration nobody will re-read.
--
-- THE LIVE DEFECT IS THE CATEGORY, NOT THE DUPLICATE. `orgasmic-dysfunction` is
-- seo_indexable=true and filed under **Fetishes** — so a clinical condition
-- whose own description cites ICD-11 HA02 has been publishing to crawlers as a
-- fetish. `anorgasmia`, the deprecated twin, was filed correctly under Sexual
-- Health all along. That is the same shape as vaginismus vs
-- sexual-pain-penetration-disorder in the 2026-08-29 alias shadow cleanup,
-- where a medical condition was found publishing as a fetish.
--
-- DIRECTION. The earlier note left the merge direction deliberately open,
-- because the correctly-filed name losing to the misfiled one is exactly the
-- trap that pass documented. Resolved on the evidence:
--
--   orgasmic-dysfunction   active, seo_indexable, human_reviewed,
--                          verification_status='reviewed', description cites
--                          ICD-11 HA02 — and "orgasmic dysfunction" is the
--                          clinical umbrella, of which anorgasmia is one
--                          presentation.
--   anorgasmia             already deprecated, no assignments, no aliases of
--                          its own; its slug is ALREADY an approved alias of
--                          orgasmic-dysfunction.
--
-- So the live row keeps the concept and gains the right shelf; the deprecated
-- row is recorded as merged into it rather than left as a bare orphan. Making
-- `anorgasmia` canonical would mean deprecating an indexable, human-reviewed
-- row to revive a deprecated one — more disruption, no gain, and reviving it
-- was explicitly declined when 20261217100000 was written.
--
-- THE URL IS THE POINT OF THE REDIRECT. `resolve_tag_slug` consults
-- `unified_tags.slug` (active only) and then `tag_slug_redirects` — it does NOT
-- consult `tag_aliases`. So the existing `anorgasmia` alias makes the term
-- findable in SEARCH while /tags/anorgasmia still soft-404s. "Anorgasmia" is
-- the Wikipedia title and the more commonly searched word of the pair, so the
-- redirect is the half that actually reaches a reader.
--
-- Prose is NOT touched. `orgasmic-dysfunction`'s description and
-- long_description are correct, human-reviewed clinical text; this migration
-- moves a shelf and records a relationship. The programme's rule is that
-- rewriting prose clears the review flag, and there is nothing here worth
-- paying that for.

do $mig$
declare
  v_bad     int;
  v_anorg   uuid;
  v_orgdys  uuid;
  v_health  uuid;
begin
  -- Load-bearing, not hygiene: `orgasmic-dysfunction` is human_reviewed=true and
  -- log_unified_tag_change RAISEs when an actor matching 'system:%' modifies
  -- such a row. 'system:trigger' is the default when nothing is declared, so
  -- without this the category fix alone aborts the migration.
  perform set_config('app.actor', 'migration:anorgasmia-merge-and-refile', true);

  select id into v_anorg  from public.unified_tags where slug='anorgasmia';
  select id into v_orgdys from public.unified_tags where slug='orgasmic-dysfunction' and status='active';
  select id into v_health from public.tag_categories where slug='sexual-health';

  if v_anorg is null or v_orgdys is null or v_health is null then
    raise exception 'anorgasmia merge: a required tag or the Sexual Health category is missing';
  end if;

  ---------------------------------------------------------------- preconditions
  -- The premise, asserted rather than assumed. A sibling session was working
  -- this same pair; if it already resolved it, this must stop rather than
  -- fight its decision.
  if not exists (select 1 from public.unified_tags
                  where id=v_anorg and status='deprecated' and merged_into_id is null) then
    raise exception 'anorgasmia merge: anorgasmia is no longer an unmerged deprecated row — re-read before proceeding';
  end if;

  -- Both rows must still name the same concept, which is the entire basis for
  -- merging them rather than keeping both.
  if not exists (select 1 from public.unified_tags a, public.unified_tags b
                  where a.id=v_anorg and b.id=v_orgdys
                    and a.wikidata_id = b.wikidata_id and a.wikidata_id = 'Q1772397') then
    raise exception 'anorgasmia merge: the two rows no longer share Q1772397 — the premise is gone';
  end if;

  ------------------------------------------------------------ re-file the shelf
  -- category_id ALONE. The BEFORE trigger derives the denormalized `category`
  -- text (what the search facet renders) and the AFTER trigger moves the
  -- primary junction row (what /tags/:slug renders). Writing either directly
  -- propagates nothing.
  update public.unified_tags set category_id = v_health where id = v_orgdys;

  ------------------------------------------------------------- record the merge
  -- deprecated_at is deliberately LEFT SET: unified_tags_status_matches_deprecated_at
  -- requires (status='active') = (deprecated_at IS NULL), so a non-active row
  -- must keep it. Clearing it here would abort — the same coupling that makes
  -- a revive clear all three together.
  --
  -- THE REDIRECT IS CREATED BY A TRIGGER, NOT BY THIS MIGRATION.
  -- `trg_unified_tags_merge_redirect` (AFTER UPDATE OF status, merged_into_id →
  -- log_unified_tag_merge_redirect) writes the `tag_slug_redirects` row on its
  -- own. A draft of this migration also INSERTed it explicitly, under a comment
  -- claiming that insert was what "gives the slug a home". That was false, and
  -- the MUTATION TEST is what exposed it: deleting the INSERT left the redirect
  -- assertion still PASSING, which can only happen if something else creates the
  -- row. Measured directly afterwards — before the update
  -- `resolve_tag_slug('anorgasmia')` returns 0 rows; after this UPDATE alone it
  -- returns orgasmic-dysfunction with redirected=true.
  --
  -- The redundant INSERT was deleted rather than kept "for safety": a statement
  -- that appears to cause an effect it does not cause teaches the next reader
  -- something untrue, and would have made the assertion below look like it was
  -- guarding this migration's own work when it is really guarding the trigger's.
  update public.unified_tags
     set status = 'merged',
         merged_into_id = v_orgdys
   where id = v_anorg;

  ------------------------------------------------------------------ assertions
  -- The shelf, on BOTH representations the two reader surfaces use. Asserting
  -- one would pass while the other stayed stale.
  if not exists (select 1 from public.unified_tags where id=v_orgdys and category='Sexual Health') then
    raise exception 'anorgasmia merge: denormalized category text did not follow category_id';
  end if;
  if not exists (select 1 from public.tag_category_assignments tca
                   join public.tag_categories c on c.id=tca.category_id
                  where tca.tag_id=v_orgdys and tca.is_primary and c.name='Sexual Health') then
    raise exception 'anorgasmia merge: the PRIMARY junction row is not Sexual Health';
  end if;
  select count(*) into v_bad from (
    select tca.tag_id from public.tag_category_assignments tca
     where tca.tag_id=v_orgdys and tca.is_primary group by tca.tag_id having count(*) <> 1) x;
  if v_bad > 0 then
    raise exception 'anorgasmia merge: orgasmic-dysfunction does not have exactly one primary category';
  end if;

  -- The merge is recorded and the CHECK it interacts with still holds.
  if not exists (select 1 from public.unified_tags
                  where id=v_anorg and status='merged' and merged_into_id=v_orgdys
                    and deprecated_at is not null) then
    raise exception 'anorgasmia merge: the merge was not recorded on the anorgasmia row';
  end if;

  -- The URL now resolves, and resolves as a REDIRECT to the live row. This is
  -- the half a reader actually meets, and it is asserted through the same RPC
  -- the app calls rather than by inspecting the table.
  if not exists (select 1 from public.resolve_tag_slug('anorgasmia')
                  where slug='orgasmic-dysfunction' and redirected) then
    raise exception 'anorgasmia merge: /tags/anorgasmia does not resolve to the live row';
  end if;

  -- The live row kept everything that made it the winner.
  if not exists (select 1 from public.unified_tags
                  where id=v_orgdys and status='active' and seo_indexable
                    and human_reviewed and wikidata_id='Q1772397'
                    and description ilike '%HA02%') then
    raise exception 'anorgasmia merge: orgasmic-dysfunction lost status, indexability, review, QID or its prose';
  end if;

  -- Still exactly one live row for the concept.
  select count(*) into v_bad from public.unified_tags
   where status='active' and wikidata_id='Q1772397';
  if v_bad <> 1 then
    raise exception 'anorgasmia merge: % active row(s) on Q1772397, want exactly 1', v_bad;
  end if;

  -- No clinical row left publishing under Fetishes by way of THIS pair.
  if exists (select 1 from public.unified_tags
              where id=v_orgdys and category='Fetishes') then
    raise exception 'anorgasmia merge: the clinical row is still shelved under Fetishes';
  end if;

  -- Corpus-wide CI zero-invariant.
  select count(*) into v_bad from public.unified_tags
   where status='active' and seo_indexable
     and coalesce(nullif(btrim(description),''), short_description) is null;
  if v_bad > 0 then
    raise exception 'anorgasmia merge: % indexable row(s) corpus-wide have no description', v_bad;
  end if;

  raise notice 'anorgasmia merge: recorded merge, re-filed orgasmic-dysfunction to Sexual Health, /tags/anorgasmia now redirects';
end
$mig$;
