-- Seven search synonyms point at a tag label that no longer exists, because
-- the label was renamed again after the synonym was written.
--
-- The 2026-10-10 English-label migrations each wrote, per renamed tag, a
-- synonym mapping the old German term to the tag's NEW English name
-- (`vernetzung -> networking`). `20261010054303` then renamed several of those
-- same tags a second time, to disambiguated labels — but did not revisit the
-- synonyms it had just invalidated. So the expansion now resolves to a word
-- that is the name of a DIFFERENT live tag:
--
--   term                   expands to        its own tag is      that word is now
--   anonym                 anonymous         Anonymous Testing   Anonymous      [Fetishes]
--   vernetzung             networking        Community Netw'ing  Networking     [Slang & Language]
--   arzt/ärztin            doctor            Medical Doctor      Doctor         [Dynamics & Roles]
--   entfesselungskunstler  escape artist     Escapologist        Escape Artist  [Dynamics & Roles]
--   kriegerin              warrior           Female Warrior      Warrior        [Positions]
--   pommes                 fries             French Fries        FRIES          [Consent & Negotiation]
--   anthropologe           anthropologist    Anthropologist (P)  Anthropologist [Media & Ent.]
--
-- `anonym` is the one worth naming: it carries 102 assignments in Safety &
-- Consent and its term is the German word for anonymous HIV testing, while the
-- word it expands to is a 2-use Fetishes tag. `pommes -> fries` lands on FRIES,
-- the consent acronym.
--
-- THIS IS LATENT, NOT LIVE, AND THE MIGRATION SAYS SO RATHER THAN OVERSELLING.
-- `workers/search-proxy/src/pgSynonyms.ts` loads `status=eq.active`; all seven
-- rows are `approved`, so the search proxy never reads them today. The repair
-- is to stop a wrong expansion from going live the moment someone promotes
-- them — not to fix a user-visible fault.
--
-- SCOPE IS THE RENAME ARTIFACTS ONLY, bounded by creation time inside the
-- campaign window. Three OTHER synonyms also fail a naive
-- `replacements <> tag name` test and are deliberately untouched, because that
-- test is wrong about them:
--   * `hate crimes -> hate crime` and `lgbt-film -> queer film` are plural and
--     hyphen normalisations that match no other tag. A synonym's replacement
--     is a query expansion, not a pointer to its tag's name, so differing is
--     normal and correcting them would break the normalisation.
--   * `bias -> prejudice` IS now ambiguous — `20261010054303` renamed its tag
--     to "Racial Prejudice" and gave "Prejudice" to `vorurteile` — but it was
--     created 2026-05-14, months before any of this, as general English
--     vocabulary. Narrowing it to "racial prejudice" is an editorial decision
--     about search recall that belongs to whoever owns that vocabulary, and it
--     is the one row here that is actually `active`. Reported, not taken.
--
-- Repair matches the pattern `20261010054303` already uses in its own merge
-- block (`set replacements = ARRAY[lower(c.name)]`), so the convention is
-- inherited rather than invented. `tag_alias_id` is left NULL: the aliases
-- these rows hung off were removed with the self-alias cleanup, and inventing
-- a new provenance link would assert a relationship that no longer exists.

select set_config('app.actor', 'admin:search-synonym-stale-rename-targets', true);

update public.search_synonyms s
   set replacements = array[lower(t.name)]
  from public.unified_tags t
 where t.id = s.tag_id
   and t.status = 'active'
   and s.status = 'approved'
   and s.created_at >= '2026-10-10T04:50:00Z'
   and s.created_at <  '2026-10-10T06:00:00Z'
   and lower(s.replacements[1]) is distinct from lower(t.name);

do $verify$
declare
  v_stale int;
  v_active_changed int;
  v_bias text;
begin
  -- P1: no campaign-window synonym still expands to a label its tag no longer
  -- carries. Scoped to the window this migration owns, NOT corpus-wide — the
  -- three pre-existing rows legitimately differ and a corpus-wide assertion
  -- would abort on data this file deliberately does not touch.
  select count(*) into v_stale
    from public.search_synonyms s join public.unified_tags t on t.id = s.tag_id
   where t.status = 'active' and s.status = 'approved'
     and s.created_at >= '2026-10-10T04:50:00Z' and s.created_at < '2026-10-10T06:00:00Z'
     and lower(s.replacements[1]) is distinct from lower(t.name);
  if v_stale <> 0 then
    raise exception 'P1 failed: % campaign-window synonyms still stale', v_stale;
  end if;

  -- P2: nothing `active` was touched. The one active row that looks stale
  -- (`bias`) is deliberately left alone, so if this count moves the scope
  -- has leaked out of the window.
  select count(*) into v_active_changed
    from public.search_synonyms s join public.unified_tags t on t.id = s.tag_id
   where s.status = 'active' and lower(s.replacements[1]) is distinct from lower(t.name);
  if v_active_changed <> 3 then
    raise exception 'P2 failed: expected the 3 pre-existing active rows untouched, found %', v_active_changed;
  end if;

  -- P3: the specific control. `bias` must still expand to the general word,
  -- not be narrowed to its tag's new label. Asserted by VALUE, because "3 rows
  -- differ" above is also satisfied by three different rows.
  select s.replacements[1] into v_bias
    from public.search_synonyms s where s.terms[1] = 'bias' and s.status = 'active';
  if v_bias is distinct from 'prejudice' then
    raise exception 'P3 failed: bias now expands to %, expected the untouched "prejudice"', v_bias;
  end if;

  -- P4: the repair was not a no-op over an empty window.
  if (select count(*) from public.search_synonyms
       where status = 'approved'
         and created_at >= '2026-10-10T04:50:00Z' and created_at < '2026-10-10T06:00:00Z') < 50 then
    raise exception 'P4 failed: campaign-window synonym set is implausibly small — refusing a zero over an empty set';
  end if;

  raise notice 'campaign-window synonyms consistent; 3 pre-existing active rows left as they were';
end
$verify$;
