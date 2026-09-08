-- Queer theory is not queerness, and the `queerness` row said otherwise in every
-- derived field it had.
--
-- 20360101101600 deferred one finding: `queer-theory` could not be revived
-- because an alias of `queerness` holds that slug, and unpicking an alias
-- changes search behaviour, so it deserved its own change. Following it up found
-- the alias was not an isolated mistake. It is one of NINE aliases on
-- `queerness`, and all nine are translations of QUEER THEORY:
--
--   queer teorie (cs) · Queer-Theorie, Queertheorie, Queer-Theory (de/en)
--   teoría cuir, teoría kuir, teoría queer, teoría torcida (es) · théorie queer (fr)
--
-- Not one of them translates "queerness". They are the Wikidata sitelink labels
-- of Q658022 — which is Queer theory — harvested wholesale onto the wrong tag.
-- The rest of `queerness` matches: `wikidata_id` Q658022, `wikipedia_url`
-- .../wiki/Queer_theory, and both `tag_sources` rows cite that same entity.
--
-- THE PROSE IS THE LIVE HARM, NOT THE ALIASES. All nine are
-- `review_status='auto'`, and since 20261012090000 display, auto-tagging and the
-- search bridge are all approved-only, so they are inert. But `queerness` is
-- ACTIVE, `seo_indexable`, and carries 55 uses, and its summary line reads
-- "Critical theory on non-heterosexual practices" while its whole
-- `long_description` opens "Queer theory is a field of post-structuralist
-- critical theory..." — queer theory's definition published as the definition of
-- queerness. Both fields are byte-identical to the deprecated `queer-theory`
-- row's own, which is what proves one enrichment run wrote both from one entity.
--
-- WHY THE 2026-08-29 WRONG-ENTITY REPAIR DID NOT CATCH IT. That pass classified
-- by P31 and deliberately did not auto-clear the CONCEPT class, because a
-- concept QID may legitimately be broader than its tag. Q658022 is a field of
-- study, so `queerness` fell in the class that was left for review — and
-- `tag_wikidata_repair_audit` holds no row for it, so it was never dispositioned
-- by hand either. The producer is sealed today (`tag-wiki-guard.ts` requires
-- title agreement, and "Queerness" does not agree with "Queer theory"); this is
-- residue from before that seal.
--
-- CORRECTION TO 20360101101600's OWN HEADER, which is why this note exists: it
-- said unpicking meant "deleting a tag_aliases row and its search_synonyms row
-- in the right order". There is NO search_synonyms row — measured 0 for all nine
-- aliases. Part A still deletes synonyms first, because that FK is
-- ON DELETE SET NULL and a synonym minted between this measurement and CI
-- applying the file would survive its alias and keep rewriting queries; it is a
-- guard against a race, not a step doing work today.
--
-- DISPOSITIONS
--
--   DELETE the English alias (part A). It is the one blocking the revival, and
--   it is the one that must not be re-parented: `alias_slug` = the revived tag's
--   own slug, so re-pointing it at `queer-theory` would mint the corpus's first
--   SELF-ALIAS — a state 20270601200100 measured at 0 and calls "junk of a
--   different kind". Both guards would miss it: the shadow trigger explicitly
--   excludes `canonical_tag_id = NEW.id`, and `alias_equals_name` compares
--   alias_name to tag name, where "Queer-Theory" ≠ "Queer Theory" on the hyphen.
--   That is the laundering 20270601200000's header warns about.
--
--   RE-PARENT the other eight (part C). They are correct translations of the
--   concept `queer-theory` names, so deleting them would destroy good
--   multilingual data. None shadows any tag (measured), none equals the target's
--   name, and they stay `auto` — this moves them to the right parent, it does
--   not approve them.
--
--   REVIVE `queer-theory` unpublished (part B) with its prose UNCHANGED. It is
--   correct queer-theory prose under the correct QID; rewriting it would be the
--   LLM rewrite this repo bans. It was culled by the 2026-06-05 orphan audit
--   ("no entity assignments, relations, synonyms, or aliases") — a premise that
--   is false for a glossary term, the same finding as the 15 revivals.
--   Refiled Orientation -> Politics & Activism: an academic field is not a
--   sexual orientation, and `intersectionality`, the closest analogue in the
--   corpus, is filed there. Safe to move here only because the row lands
--   unpublished; on a live row this would move the page.
--
--   RETRACT on `queerness` (part D) the four fields taken from Q658022 plus its
--   two provenance rows. NULL, never a replacement: `tag_medical_codes_sync` and
--   the hierarchy sync rebuild weekly from this identifier, so a plausible wrong
--   QID regenerates wrong data forever while a null one regenerates nothing.
--   `description` is KEPT — it is genuinely about queerness ("An expansive term
--   that challenges heteronormativity...") and this is the `casting`/`trauma`
--   precedent of repairing only the wrong FIELDS. It is also load-bearing: the
--   corpus invariant asserted at the end of this file requires an indexable row
--   to have a description, so nulling it too would leave the page unpublishable.
--
-- `genre-queer-theory` is deliberately untouched. `genre-%` is a real namespace
-- of 16 active tags (book genres, no category, not in facets); it is not a
-- duplicate of a glossary term.
--
-- deprecate_unused_tags() is manual-only — no cron job, no admin_automations row
-- (measured) — so the revived row will not be re-culled on a schedule.

do $mig$
declare
  v_alias   uuid;
  v_tag     uuid;
  v_queer   uuid;
  v_n       int;
  v_bad     int;
  v_before  int;
  v_polact  uuid;
begin
  perform set_config('app.actor', 'migration:queer-theory-disentangle', true);

  select id into v_queer from public.unified_tags where slug = 'queerness' and status = 'active';
  if v_queer is null then
    raise exception 'queer-theory: `queerness` is not an active tag — re-read before applying';
  end if;

  select id into v_tag from public.unified_tags where slug = 'queer-theory' and status = 'deprecated';
  if v_tag is null then
    raise exception 'queer-theory: the deprecated `queer-theory` row is gone or already active — re-read before applying';
  end if;

  select id into v_polact from public.tag_categories where name = 'Politics & Activism';
  if v_polact is null then
    raise exception 'queer-theory: category `Politics & Activism` not found';
  end if;

  -- All nine must still hang off `queerness`. Fewer means someone has already
  -- started on this and the hand-read dispositions above are stale.
  select count(*) into v_before from public.tag_aliases where canonical_tag_id = v_queer;
  if v_before <> 9 then
    raise exception 'queer-theory: `queerness` carries % aliases, expected the 9 that were read', v_before;
  end if;

  --------------------------------------------------------------- part A: delete
  -- Resolve by the PAIR, never by alias_slug alone: an alias re-pointed at some
  -- other tag since the review is no longer the same decision.
  select a.id into v_alias
    from public.tag_aliases a
   where a.alias_slug = 'queer-theory' and a.canonical_tag_id = v_queer;
  if v_alias is null then
    raise exception 'queer-theory: the `queer-theory` -> `queerness` alias no longer exists as reviewed';
  end if;

  -- Synonyms FIRST, while `search_synonyms.tag_alias_id` still points at the
  -- alias. See the header: 0 rows today, kept against the race.
  delete from public.search_synonyms where tag_alias_id = v_alias;
  delete from public.tag_aliases where id = v_alias;

  --------------------------------------------------------------- part B: revive
  -- `seo_indexable` is cleared explicitly. A DEPRECATED row can still carry it
  -- true, and this one does — clearing `status` alone would publish an
  -- unreviewed body to crawlers the moment the row goes active.
  update public.unified_tags set
    status              = 'active',
    deprecated_at       = null,
    deprecation_reason  = null,
    category_id         = v_polact,
    verification_status = 'unverified',
    human_reviewed      = false,
    seo_indexable       = false
  where id = v_tag;

  ----------------------------------------------------------- part C: re-parent
  update public.tag_aliases
     set canonical_tag_id = v_tag
   where canonical_tag_id = v_queer;
  get diagnostics v_n = row_count;
  if v_n <> 8 then
    raise exception 'queer-theory: re-parented % aliases, expected the 8 translations', v_n;
  end if;

  ------------------------------------------------------------- part D: retract
  update public.unified_tags set
    wikidata_id       = null,
    wikipedia_url     = null,
    short_description = null,
    long_description  = null
  where id = v_queer;

  delete from public.tag_sources
   where tag_id = v_queer
     and source_url in ('https://www.wikidata.org/wiki/Q658022',
                        'https://en.wikipedia.org/wiki/Queer_theory');

  ----------------------------------------------------------------- assertions
  select count(*) into v_bad from public.unified_tags
   where slug = 'queer-theory'
     and (status <> 'active' or seo_indexable or coalesce(human_reviewed, false)
          or verification_status <> 'unverified' or category_id is null);
  if v_bad > 0 then
    raise exception 'queer-theory: the revived row is not active-and-unpublished';
  end if;

  -- The prose it was revived FOR is still there. A revive that lands an empty
  -- body is the thin page this pass exists to avoid.
  select count(*) into v_bad from public.unified_tags
   where slug = 'queer-theory'
     and (coalesce(btrim(long_description), '') = '' or wikidata_id <> 'Q658022');
  if v_bad > 0 then
    raise exception 'queer-theory: the revived row lost its body or its identifier';
  end if;

  select count(*) into v_bad from public.unified_tags
   where id = v_queer
     and (wikidata_id is not null or wikipedia_url is not null
          or short_description is not null or long_description is not null);
  if v_bad > 0 then
    raise exception 'queer-theory: `queerness` still carries a Q658022-derived field';
  end if;

  -- ...and it kept the one field that was actually about queerness.
  select count(*) into v_bad from public.unified_tags
   where id = v_queer and coalesce(btrim(description), '') = '';
  if v_bad > 0 then
    raise exception 'queer-theory: `queerness` lost its description — only the wrong fields were to be retracted';
  end if;

  if exists (select 1 from public.tag_aliases where canonical_tag_id = v_queer) then
    raise exception 'queer-theory: `queerness` still carries a queer-theory alias';
  end if;

  -- No self-alias was minted. Measured 0 corpus-wide by 20270601200100 and this
  -- migration is the one with an opportunity to break it.
  select count(*) into v_bad from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where a.alias_slug = t.slug;
  if v_bad > 0 then
    raise exception 'queer-theory: % self-alias row(s) exist — a re-parent laundered a shadow', v_bad;
  end if;

  -- The seal's invariant, corpus-wide: no alias may carry a live tag's slug.
  select count(*) into v_bad from public.tag_aliases a
   where exists (select 1 from public.unified_tags t
                  where t.slug = a.alias_slug and t.status = 'active'
                    and t.id <> a.canonical_tag_id);
  if v_bad > 0 then
    raise exception 'queer-theory: % alias(es) shadow a live tag corpus-wide', v_bad;
  end if;

  select count(*) into v_bad from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where lower(a.alias_name) = lower(t.name);
  if v_bad > 0 then
    raise exception 'queer-theory: alias_equals_name is % corpus-wide, must stay 0', v_bad;
  end if;

  -- The CI zero-invariant this file could plausibly break by retracting prose.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and seo_indexable
     and coalesce(nullif(btrim(description), ''), short_description) is null;
  if v_bad > 0 then
    raise exception 'queer-theory: % indexable row(s) corpus-wide have no description', v_bad;
  end if;

  raise notice 'queer-theory: revived, 1 alias deleted, 8 re-parented, queerness retracted';
end
$mig$;
