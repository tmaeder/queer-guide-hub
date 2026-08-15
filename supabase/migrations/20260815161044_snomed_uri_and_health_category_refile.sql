-- Two follow-ups to the diagnostic-codes band (20260815111727).
--
-- ===========================================================================
-- 1. SNOMED CT links move to the OFFICIAL concept URI
-- ===========================================================================
-- The band shipped pointing at
--   https://browser.ihtsdotools.org/?perspective=full&conceptId1={code}
-- which is the URL SNOMED International's own Confluence uses, so the shape
-- was right. But it is an APP url: `perspective=full` is a query parameter of
-- one browser implementation, and it is the only enabled system whose link
-- could not be verified end-to-end (browser.ihtsdotools.org and snomed.info
-- share one IP, 3.225.65.37, which refuses connections from our egress —
-- ECONNREFUSED from two independent clients, so it is a network path issue,
-- not a bad URL).
--
-- The SNOMED CT URI Standard defines the persistent identifier instead:
--
--   "SNOMED International resolves URIs for concepts from the SNOMED CT
--    International Edition (of the form http://snomed.info/id/{SCTID}) to the
--    public SNOMED CT browser."
--   — docs.snomed.org, SNOMED CT URI Standard §3, "SNOMED CT URIs in Use"
--
-- So it lands the reader in the same browser, but through the identifier the
-- standard guarantees rather than through one app's query string. It also
-- content-negotiates (Accept: application/fhir+json) for machine clients,
-- which the app URL does not.
update public.medical_code_systems
   set url_template = 'https://snomed.info/id/{code}',
       home_url     = 'https://browser.ihtsdotools.org/'
 where slug = 'snomed_ct';

-- ===========================================================================
-- 2. Re-file tags that are not health topics out of the health subtree
-- ===========================================================================
-- `unified_tags.category` cannot answer "is this clinical" — which is why the
-- diagnostic-codes band is driven by whether a tag carries an ICD/SNOMED/ATC
-- code, never by its category. That design decision stands. This migration
-- fixes the underlying data anyway, because the noise is user-visible on
-- /tags/c/substances-harm-reduction and in the glossary's category rail.
--
-- THREE GROUPS, ALL DELIBERATELY NON-ADULT-AFFECTING.
--
-- `is_adult` is DERIVED from whether a tag has any assignment under the
-- 'Sexuality & Kink' subtree (see 20260803035527). Nothing here moves into or
-- out of that subtree, so no tag changes its Safe Mode visibility or its
-- seo_indexable state. The genuinely kink-filed tags sitting in Sexual Health
-- (dick-on-a-stick 2,024 uses, e-stim-machine 1,612, chastity-belt/cage,
-- fisting, ball-busting, TPE, RACK) ARE misfiled, but re-filing them would
-- flip ~3,600 taggings to adult and hide them in Safe Mode. That is a product
-- decision, not a data fix, so it is deliberately NOT done here.
--
-- (a) Venue-scrape noise filed under Substances & Harm Reduction. These are
--     the amenity-garbage class documented for venues: mayonnaise and popcorn
--     are venue food (4 and 6 venue taggings), shipping is 2 venues. Wildlife
--     is 3 news + 1 venue, so it goes to travel rather than nightlife.
--
-- (b) Activism and generic terms filed under Sexual Health. The largest,
--     disability-justice-in-queer-activism, carries 1,137 taggings — it is
--     activism, and filing it under a health category misrepresents both.
--
-- (c) Recreational drugs carrying a DUPLICATE Sexual Health assignment on top
--     of their correct Substances one. Only the duplicate is removed.
--
--     `viagra` is deliberately excluded from (c) even though it has the same
--     pair: it is a sexual-health drug, so that assignment is correct, and its
--     Substances row belongs to the saferparty vocabulary another change is
--     actively maintaining. Removing either side would be wrong.
--
-- IMPLEMENTATION — the trigger cycle from 20260803035527 applies verbatim:
-- unified_tags_recompute_is_adult (AFTER on tag_category_assignments) writes
-- unified_tags, and sync_tag_category_assignment (BEFORE on unified_tags)
-- writes tag_category_assignments, so a set-based statement raises 27000
-- "tuple to be updated was already modified". Hence one row per statement, and
-- category_id is cleared to NULL rather than set — the BEFORE trigger
-- short-circuits on `NEW.category_id IS NOT NULL`, so NULL is the only value
-- that does not re-enter the cycle. The assignment table is authoritative and
-- run_tag_category_resync() refills the denormalised text.

create temp table _refile(slug text primary key, from_cat text, to_cat text) on commit drop;
insert into _refile(slug, from_cat, to_cat) values
  -- (a) venue-scrape noise out of harm reduction
  ('mayonnaise','substances-harm-reduction','venues-nightlife'),
  ('popcorn','substances-harm-reduction','venues-nightlife'),
  ('shipping','substances-harm-reduction','venues-nightlife'),
  ('wildlife','substances-harm-reduction','travel-destinations'),
  -- (b) activism / generic out of sexual health
  ('disability-justice-in-queer-activism','sexual-health','political-activism'),
  ('climate-justice-queer-resilience','sexual-health','political-activism'),
  ('justice','sexual-health','political-activism'),
  ('investigation','sexual-health','current-affairs');

create temp table _dedupe(slug text primary key, drop_cat text) on commit drop;
insert into _dedupe(slug, drop_cat) values
  ('cocaine','sexual-health'), ('mdma','sexual-health'),
  ('morphine','sexual-health'), ('nitrous-oxide','sexual-health'),
  ('alprazolam','sexual-health'), ('diazepam','sexual-health');

do $do$
declare r record; v_removed int := 0; v_added int := 0; v_dropped int := 0; v_cleared int := 0;
begin
  perform set_config('app.actor', 'admin:health-category-refile-20260907', true);

  -- (a)+(b) remove the wrong assignment, one row per statement
  for r in
    select a.id
      from public.tag_category_assignments a
      join public.unified_tags t on t.id = a.tag_id and t.status = 'active'
      join _refile f on f.slug = t.slug
      join public.tag_categories c on c.id = a.category_id and c.slug = f.from_cat
  loop
    delete from public.tag_category_assignments where id = r.id;
    v_removed := v_removed + 1;
  end loop;

  -- ...then add the correct one
  for r in
    select t.id as tag_id, c.id as cat_id
      from _refile f
      join public.unified_tags t on t.slug = f.slug and t.status = 'active'
      join public.tag_categories c on c.slug = f.to_cat
  loop
    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    values (r.tag_id, r.cat_id, true)
    on conflict (tag_id, category_id) do update set is_primary = true;
    v_added := v_added + 1;
  end loop;

  -- (c) drop the duplicate health assignment only; the Substances one stays
  for r in
    select a.id
      from public.tag_category_assignments a
      join public.unified_tags t on t.id = a.tag_id and t.status = 'active'
      join _dedupe d on d.slug = t.slug
      join public.tag_categories c on c.id = a.category_id and c.slug = d.drop_cat
     where exists (
       select 1 from public.tag_category_assignments a2
       join public.tag_categories c2 on c2.id = a2.category_id
       where a2.tag_id = a.tag_id and c2.slug = 'substances-harm-reduction')
  loop
    delete from public.tag_category_assignments where id = r.id;
    v_dropped := v_dropped + 1;
  end loop;

  -- clear the denormalised mirror so the resync recomputes it from the
  -- assignment table (NULL is the one value that does not re-enter the cycle)
  for r in
    select t.id from public.unified_tags t
     where t.status = 'active' and t.category_id is not null
       and (t.slug in (select slug from _refile) or t.slug in (select slug from _dedupe))
  loop
    update public.unified_tags set category_id = null where id = r.id;
    v_cleared := v_cleared + 1;
  end loop;

  raise notice 'refile: removed % / added % / dropped % dupes / cleared % mirrors',
    v_removed, v_added, v_dropped, v_cleared;
end $do$;

select public.run_tag_category_resync();
