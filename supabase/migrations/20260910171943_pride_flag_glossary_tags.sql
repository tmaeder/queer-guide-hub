-- Pride flags become first-class glossary entries.
--
-- The frontend flag vocabulary (src/lib/flags/prideFlags.ts) gives every flag
-- a `flagTagSlug`; this migration makes sure each of those slugs is a live
-- tag under Symbols & Flags so the full TagFlagBand has a page to render on.
-- Several of these slugs already exist as DEPRECATED rows (import-cleanup
-- sweeps deprecated `progress-pride-flag`, `transgender-pride-flag`,
-- `bisexual-pride-flag`, `asexual-pride-flag` without merge targets), so this
-- is an upsert-by-slug that reactivates rather than a blind insert — the
-- saferparty-substance-tags pattern (20260907100000).
--
-- Traps honoured:
--  * unified_tags_normalize_slug uses coalesce(NEW.slug, NEW.name), so an
--    explicit slug wins over name-derived slugging — load-bearing for
--    "Gay Men's Pride Flag", whose name would otherwise slug to
--    gay-men-s-pride-flag.
--  * The AFTER trigger on tag_category_assignments recomputes is_adult per
--    row, so category assignments run one statement per row (27000 note in
--    20260803035653).
--  * ON CONFLICT UPDATE deliberately does NOT touch is_sensitive /
--    sensitive_topics — leather-pride-flag carries curated topics
--    (kink/bdsm/fetish) that must survive.
--  * handkerchief-code needs nothing here: it is already active, categorized,
--    and is_sensitive with topics [bdsm, fetish] (verified 2026-08-16).
--  * Descriptions are fill-if-empty so existing curation survives.

do $do$
declare
  r record;
  v_cat_id uuid;
  v_count int := 0;
begin
  perform set_config('app.actor', 'admin:pride-flag-tags-20260816', true);

  select id into v_cat_id from public.tag_categories where slug = 'symbols-flags';
  if v_cat_id is null then
    raise exception 'tag_categories has no symbols-flags row';
  end if;

  for r in
    select * from (values
      ('pride-flag', 'Rainbow Pride Flag',
       'The six-stripe rainbow flag, the universal symbol of LGBTQ+ pride, evolved from Gilbert Baker''s eight-stripe 1978 original.'),
      ('progress-pride-flag', 'Progress Pride Flag',
       'Daniel Quasar''s 2018 redesign of the rainbow flag, adding a five-colour chevron for trans people, communities of colour, and those affected by HIV/AIDS.'),
      ('transgender-pride-flag', 'Transgender Pride Flag',
       'Monica Helms''s 1999 flag for the transgender community: blue, pink and white stripes in a symmetrical pattern.'),
      ('bisexual-pride-flag', 'Bisexual Pride Flag',
       'Michael Page''s 1998 flag for the bisexual community: magenta, lavender and blue for same-gender, cross-spectrum and different-gender attraction.'),
      ('pansexual-pride-flag', 'Pansexual Pride Flag',
       'The 2010 flag for the pansexual community: pink, yellow and blue for attraction to women, non-binary people and men.'),
      ('lesbian-pride-flag', 'Lesbian Pride Flag',
       'Emily Gwen''s 2018 seven-stripe orange-to-rose flag for the lesbian community.'),
      ('gay-men-pride-flag', 'Gay Men''s Pride Flag',
       'The 2019 green-to-blue gradient flag for gay men, designed as a modern counterpart to the lesbian flag.'),
      ('nonbinary-pride-flag', 'Non-Binary Pride Flag',
       'Kye Rowan''s 2014 flag for non-binary people: yellow, white, purple and black.'),
      ('genderfluid-pride-flag', 'Genderfluid Pride Flag',
       'JJ Poole''s 2012 flag for genderfluid people: pink, white, purple, black and blue.'),
      ('genderqueer-pride-flag', 'Genderqueer Pride Flag',
       'Marilyn Roxie''s 2011 flag for the genderqueer community: lavender, white and chartreuse green.'),
      ('agender-pride-flag', 'Agender Pride Flag',
       'Salem X''s 2014 mirrored seven-stripe flag for agender people.'),
      ('asexual-pride-flag', 'Asexual Pride Flag',
       'The 2010 flag chosen by community vote on the Asexual Visibility and Education Network: black, grey, white and purple.'),
      ('aromantic-pride-flag', 'Aromantic Pride Flag',
       'Cameron Whimsy''s 2014 flag for the aromantic community: greens, white, grey and black.'),
      ('demisexual-pride-flag', 'Demisexual Pride Flag',
       'The demisexual community flag: a black hoist triangle with white, purple and grey bands.'),
      ('intersex-pride-flag', 'Intersex Pride Flag',
       'Morgan Carpenter''s 2013 intersex flag: a purple ring on a yellow field, colours chosen as free of gendered associations.'),
      ('leather-pride-flag', 'Leather Pride Flag',
       'Tony DeBlase''s 1989 leather pride flag: black and royal blue stripes, a white centre stripe, and a red heart in the canton.'),
      ('bear-brotherhood-flag', 'Bear Brotherhood Flag',
       'Craig Byrnes''s 1995 International Bear Brotherhood flag: seven fur-colour stripes with a bear paw print.')
    ) as f(slug, name, descr)
  loop
    insert into public.unified_tags (
      name, slug, entity_kind, status, description, short_description,
      verification_status, human_reviewed, seo_indexable, last_verified_at
    ) values (
      r.name, r.slug, 'concept', 'active', r.descr,
      split_part(r.descr, '. ', 1) || '.',
      'reviewed', true, true, now()
    )
    -- The conflict update deliberately does NOT set name: normalize_tag_input
    -- re-derives slug from name whenever an UPDATE changes the name, so
    -- renaming 'Pride Flag' → 'Rainbow Pride Flag' silently MOVED the row to
    -- slug rainbow-pride-flag (measured 2026-08-16). Existing rows already
    -- carry correct names; only fresh inserts take the name column above.
    on conflict (slug) do update set
      entity_kind         = 'concept',
      status              = 'active',
      description         = coalesce(nullif(public.unified_tags.description, ''), excluded.description),
      short_description   = coalesce(nullif(public.unified_tags.short_description, ''), excluded.short_description),
      verification_status = 'reviewed',
      human_reviewed      = true,
      seo_indexable       = true,
      merged_into_id      = null,
      deprecated_at       = null,
      deprecation_reason  = null,
      last_verified_at    = now(),
      updated_at          = now();

    -- File under Symbols & Flags as the primary category; demote any other
    -- primary so the single-primary invariant holds for reactivated rows.
    update public.tag_category_assignments a
       set is_primary = false
      from public.unified_tags t
     where t.slug = r.slug and a.tag_id = t.id
       and a.category_id <> v_cat_id and a.is_primary;

    insert into public.tag_category_assignments (tag_id, category_id, is_primary)
    select t.id, v_cat_id, true from public.unified_tags t where t.slug = r.slug
    on conflict (tag_id, category_id) do update set is_primary = true;

    v_count := v_count + 1;
  end loop;

  -- Prove we landed on the intended slugs (the slug trigger normalizes, so
  -- a drifted slug would otherwise fail silently as a fresh insert).
  if (select count(*) from public.unified_tags
       where status = 'active' and slug in (
         'pride-flag','progress-pride-flag','transgender-pride-flag',
         'bisexual-pride-flag','pansexual-pride-flag','lesbian-pride-flag',
         'gay-men-pride-flag','nonbinary-pride-flag','genderfluid-pride-flag',
         'genderqueer-pride-flag','agender-pride-flag','asexual-pride-flag',
         'aromantic-pride-flag','demisexual-pride-flag','intersex-pride-flag',
         'leather-pride-flag','bear-brotherhood-flag')) <> 17 then
    raise exception 'pride flag tag upsert did not land on all 17 slugs';
  end if;

  raise notice 'pride flag tags upserted: %', v_count;
end $do$;
