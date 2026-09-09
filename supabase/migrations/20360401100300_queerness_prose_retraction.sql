-- Finish separating queerness from queer theory: retract the prose, move the
-- eight translations, drop the two wrong provenance rows.
--
-- #3553 (20360401100100) landed first and did the identity half of this: it
-- deleted the `queer-theory` alias off `queerness`, nulled that row's
-- `wikidata_id` and `wikipedia_url`, and revived `queer-theory` as a published
-- term under a purpose-built Theory & Scholarship category. That is the better
-- treatment of the TERM and this migration does not repeat any of it.
--
-- WHAT IT LEFT STANDING IS THE READER-FACING HALF, measured on prod after it
-- applied. `queerness` is ACTIVE, `seo_indexable`, 55 uses, and still serves:
--
--   short_description  "Critical theory on non-heterosexual practices"
--   long_description   "Queer theory is a field of post-structuralist critical
--                       theory that studies and theorizes gender and sexual
--                       practices outside heterosexuality…"
--
-- Both are queer THEORY's, byte-identical to the strings on the `queer-theory`
-- row itself — one enrichment run wrote both from Q658022. Nulling the QID stops
-- the weekly syncs regenerating from a wrong identifier; it does not unpublish a
-- word of the prose that identifier already produced. A reader on /tags/queerness
-- is still told queerness is a field of post-structuralist critical theory.
--
-- THREE RESIDUES, ALL RE-MEASURED AGAINST PROD AFTER #3553:
--
--   1. the two prose fields above                            (retracted here)
--   2. eight `multilingual` aliases still parented to         (re-parented here)
--      `queerness`, every one a translation of QUEER THEORY —
--      `queer teorie` (cs), `Queer-Theorie` / `Queertheorie` (de),
--      `teoría cuir` / `kuir` / `queer` / `torcida` (es),
--      `théorie queer` (fr). `queer-theory` is live and carries ZERO aliases,
--      so its own translations sit on a row that no longer claims the concept.
--   3. two `tag_sources` rows on `queerness` citing Q658022 and
--      .../wiki/Queer_theory                                  (deleted here)
--
-- RETRACT, NEVER REPLACE. Nothing here writes a definition. `description` on
-- `queerness` is KEPT untouched — it is genuinely about queerness ("An expansive
-- term that challenges heteronormativity…", 181 chars) and this is the
-- `casting` / `trauma` rule of repairing only the wrong FIELDS. It is also
-- load-bearing rather than tidy: `tag_has_prose(description, short_description)`
-- is a hard zero in the tag-hygiene gate for an active indexable row, so
-- retracting `description` too would leave a 55-use page unpublishable instead
-- of merely thinner. A blank long_description is honest and self-heals; a
-- wrong-subject one does not.
--
-- SOFT ON PRECONDITIONS, HARD ON POSTCONDITIONS. The first draft of this change
-- (20360101101800, never applied) aborted on exact-match premises — `queer-theory`
-- must be deprecated, `queerness` must carry exactly 9 aliases — and #3553 made
-- every one of them false between authoring and merge. A migration that RAISEs on
-- a premise a concurrent session can legitimately move does not protect the
-- corpus, it breaks `db push` for everything queued behind it. So each step here
-- is a no-op when the work is already done, and the assertions at the end are
-- what refuse to let this file claim success it did not achieve.
--
-- The eight are safe to re-parent, both checked on prod: none of their
-- `alias_slug`s is held by any live tag (so `tag_reject_alias_shadow` has nothing
-- to say), and none of their `alias_name`s equals "Queer Theory", so the
-- `alias_equals_name` zero-invariant cannot be breached. They stay
-- `review_status='auto'` — this moves them to the right parent, it does not
-- approve them for display or auto-tagging.

do $mig$
declare
  v_queer  uuid;
  v_theory uuid;
  v_n      int;
  v_bad    text;
begin
  perform set_config('app.actor', 'migration:queerness-prose-retraction', true);

  select id into v_queer  from public.unified_tags where slug = 'queerness'    and status = 'active';
  select id into v_theory from public.unified_tags where slug = 'queer-theory' and status = 'active';

  -- Both must exist. `queer-theory` being live is 20360401100100's doing; if it
  -- is not, that migration did not apply and the re-parent below would move
  -- eight aliases onto a deprecated row.
  if v_queer is null then
    raise exception 'queerness retraction: `queerness` is not an active tag';
  end if;
  if v_theory is null then
    raise exception 'queerness retraction: `queer-theory` is not active — 20360401100100 must apply first';
  end if;

  ------------------------------------------------------- 1. retract the prose
  -- Guarded on the wrong content rather than on NOT NULL, so a human who has
  -- since written real queerness prose into either field keeps it.
  update public.unified_tags
     set short_description = null
   where id = v_queer
     and short_description ilike '%critical theory on non-heterosexual%';

  update public.unified_tags
     set long_description = null
   where id = v_queer
     and long_description ilike 'queer theory is a field of post-structuralist%';

  ------------------------------------------------- 2. re-parent the translations
  -- By explicit slug, never "every alias on queerness": the row may legitimately
  -- gain real translations of QUEERNESS later, and those must not follow.
  update public.tag_aliases
     set canonical_tag_id = v_theory
   where canonical_tag_id = v_queer
     and alias_slug in ('queer-teorie','queer-theorie','queertheorie','teora-cuir',
                        'teora-kuir','teora-queer','teora-torcida','thorie-queer');
  get diagnostics v_n = row_count;
  raise notice 'queerness retraction: re-parented % translation alias(es)', v_n;

  ------------------------------------------------------ 3. drop the provenance
  delete from public.tag_sources
   where tag_id = v_queer
     and source_url in ('https://www.wikidata.org/wiki/Q658022',
                        'https://en.wikipedia.org/wiki/Queer_theory');

  ------------------------------------------------------------------ assertions
  -- Postconditions are hard: this file exists to reach exactly this state.
  select count(*) into v_n from public.unified_tags
   where id = v_queer and (short_description is not null or long_description is not null);
  if v_n > 0 then
    raise exception 'queerness retraction: `queerness` still carries queer-theory prose';
  end if;

  -- ...and it kept the one field that was actually about queerness. Without this
  -- the retraction above could pass by having emptied the whole row.
  select count(*) into v_n from public.unified_tags
   where id = v_queer and coalesce(btrim(description), '') = '';
  if v_n > 0 then
    raise exception 'queerness retraction: `queerness` lost its description — only the wrong fields were to be retracted';
  end if;

  select string_agg(a.alias_slug, ', ') into v_bad
    from public.tag_aliases a
   where a.canonical_tag_id = v_queer
     and a.alias_slug in ('queer-teorie','queer-theorie','queertheorie','teora-cuir',
                          'teora-kuir','teora-queer','teora-torcida','thorie-queer');
  if v_bad is not null then
    raise exception 'queerness retraction: queer-theory translation(s) still on `queerness`: %', v_bad;
  end if;

  select count(*) into v_n from public.tag_aliases
   where canonical_tag_id = v_theory
     and alias_slug in ('queer-teorie','queer-theorie','queertheorie','teora-cuir',
                        'teora-kuir','teora-queer','teora-torcida','thorie-queer');
  if v_n <> 8 then
    raise exception 'queerness retraction: % of 8 translations landed on `queer-theory`', v_n;
  end if;

  select count(*) into v_n from public.tag_sources
   where tag_id = v_queer
     and source_url in ('https://www.wikidata.org/wiki/Q658022',
                        'https://en.wikipedia.org/wiki/Queer_theory');
  if v_n > 0 then
    raise exception 'queerness retraction: % Q658022 provenance row(s) still on `queerness`', v_n;
  end if;

  ------------------------------------------------- corpus zero-invariants
  -- The re-parent is the one step here that can breach these, and all three read
  -- PROD in CI, so a breach fails every open PR rather than only this one.
  select count(*) into v_n from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where a.alias_slug = t.slug;
  if v_n > 0 then
    raise exception 'queerness retraction: % self-alias row(s) exist', v_n;
  end if;

  select count(*) into v_n from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where lower(a.alias_name) = lower(t.name);
  if v_n > 0 then
    raise exception 'queerness retraction: alias_equals_name is % corpus-wide, must stay 0', v_n;
  end if;

  select count(*) into v_n from public.tag_aliases a
   where exists (select 1 from public.unified_tags t
                  where t.slug = a.alias_slug and t.status = 'active'
                    and t.id <> a.canonical_tag_id);
  if v_n > 0 then
    raise exception 'queerness retraction: % alias(es) shadow a live tag corpus-wide', v_n;
  end if;

  -- The invariant this migration could most plausibly break by removing prose.
  select count(*) into v_n from public.unified_tags
   where status = 'active' and seo_indexable
     and not public.tag_has_prose(description, short_description);
  if v_n > 0 then
    raise exception 'queerness retraction: % indexable row(s) corpus-wide have no prose', v_n;
  end if;

  raise notice 'queerness retraction: prose retracted, 8 translations re-parented, provenance dropped';
end
$mig$;
