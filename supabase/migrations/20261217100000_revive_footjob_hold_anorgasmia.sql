-- Revive the glossary term `footjob`, culled by the 2026-06-05 orphan sweep.
-- Hold `anorgasmia` back, and record why, because it is NOT the same case.
--
-- Both rows were deprecated by the same statement — identical
-- `deprecated_at` (2026-06-05 12:52:27.101372+00), identical
-- `deprecation_reason` ("orphan tag (no entity assignments, relations,
-- synonyms, or aliases)"), `merged_into_id` NULL — so both look like the
-- cohort 20261211100000 revived `femdom`, `voyeur` and `pretzel` from, on the
-- reasoning that a glossary term has no entity assignments BY NATURE and that
-- sweep therefore culled vocabulary rather than junk.
--
-- That reasoning holds for exactly one of them.
--
-- WHAT SEPARATES THEM IS THE ALIAS EACH SLUG IS SHADOWED BY, which is invisible
-- to an anon read of `unified_tags` (RLS hides non-active rows) and is why this
-- pair has now been proposed as a joint revival twice:
--
--   `anorgasmia`  is an alias of the ACTIVE tag `orgasmic-dysfunction`, and the
--                 two carry THE SAME Wikidata item, Q1772397. That tag is
--                 seo_indexable, human_reviewed, verification_status='reviewed',
--                 and its own long_description opens "Anorgasmia is a type of
--                 sexual dysfunction…". The concept is not missing from the
--                 glossary; it is published under another slug. Reviving the
--                 deprecated row would create a SECOND active tag for one live
--                 concept — a duplicate_active_name defect — plus a slug/alias
--                 shadow of exactly the shape `trg_tag_alias_reject_shadow`
--                 exists to refuse. It is held back here for the same reason
--                 generate-kinktionary-revival-migrations.mjs holds back
--                 `genderfluid` and `gloryhole`: it belongs in a merge, not a
--                 revival. Deciding that merge is a separate change with its own
--                 redirect and audit consequences.
--
--   `footjob`     is an alias of the ACTIVE tag `foot-worship` — and that alias
--                 is simply WRONG. The two are different concepts with
--                 different Wikidata items: Q107417158 "stimulation of the penis
--                 with the feet" (an act) against Q463859 "foot fetishism …
--                 pronounced sexual attraction to feet" (an attraction). This is
--                 the `queening`→face-sitting shape from the 2026-08-29 alias
--                 shadow cleanup (20261011090000), where the disposition for a
--                 wrong-concept alias was to DELETE the alias. So the act is
--                 genuinely absent from the glossary, and reviving it restores
--                 vocabulary rather than duplicating it.
--
-- THE ALIAS DELETE IS NOT OPTIONAL HOUSEKEEPING. `trg_tag_alias_reject_shadow`
-- is BEFORE INSERT OR UPDATE on `tag_aliases` only — it does not fire when a
-- TAG is revived. Reviving `footjob` while `footjob`/`foot-job` still point at
-- `foot-worship` would therefore silently create the state that trigger exists
-- to reject, and it would be created by the very migration that knows better.
--
-- NOTHING HERE IS PUBLISHED. The revived row lands seo_indexable=false,
-- human_reviewed=false, verification_status='unverified' — invisible to crawlers
-- until a human reads it. That is the posture of the 296 rows
-- 20261211100000/100100 created, and it is not a formality: this programme has
-- retracted machine-written prose from production twice, and the lesson both
-- times was that a presence check is not a sense check.
--
-- CORRECTION 2026-09-04: this paragraph also said "usable for tagging, browsing
-- and site search". That is true of an unverified NON-sensitive row and false of
-- a sensitive one, which is what both rows here are. `unified_tags_public_gated_read`
-- admits anon only when a row is non-sensitive OR verification_status is
-- 'reviewed'/'locked', so `footjob` is not anon-browsable, not in anon site
-- search, and — measured on prod 2026-09-03 — its /tags/footjob page answered a
-- signed-out visitor with a hard 404 while rendering in full for a signed-in
-- one. It is one of 101 active tags in that state. 20261220113000 replaced the
-- 404 with a sign-in gate, which is the honest answer; the invisibility is
-- intended and unchanged, and `verification_status` is the lever that ends it.
--
-- BOTH prose columns are rewritten, not just `description`. The crawler builds
-- a tag's body as `long_description ?? description` (functions/_lib/detail.ts)
-- while the SPA reads `description` first, so writing only the reader-facing
-- column leaves the old text as the only thing a crawler ever sees. `footjob`
-- carried a placeholder description ("Sexual activity tag"), a vague
-- long_description, and an equally empty short_description ("A type of intimate
-- activity"); all three are replaced.
--
-- LICENCE. The Kinktionary is licensed NON-COMMERCIAL and queer.guide is
-- commercial, so no Kinktionary prose is copied or adapted. The text below is
-- original, written from independently documented meaning, and the row's
-- existing Wikipedia-derived body is REPLACED rather than extended for the same
-- reason. Provenance goes to `tag_sources` with is_public=false, so it is
-- available to reviewers and never rendered on the page.

do $mig$
declare
  v_bad     int;
  v_tag     uuid;
  v_worship uuid;
  v_aliases int;
  v_syn     int;
begin
  -- Declared INSIDE the block, not as a preceding statement: `set local` and a
  -- transaction-local set_config are scoped to the transaction, and db push
  -- gives no guarantee that a bare statement before a `do` block shares one
  -- with it. log_unified_tag_change only RAISEs for a human_reviewed row (this
  -- one is not), but the actor is what makes the tag_change_log entry
  -- attributable, and an unattributed content write is what made an earlier
  -- retraction in this programme recoverable only by luck.
  perform set_config('app.actor', 'migration:revive-footjob', true);

  ---------------------------------------------------------------- preconditions
  -- The claim this migration rests on, asserted rather than assumed. If either
  -- row has moved since it was read — revived by a sibling session, merged, or
  -- deprecated for some other reason — the premise is gone and this must stop
  -- rather than write over someone else's decision.
  select count(*) into v_bad
    from public.unified_tags t
   where t.slug in ('footjob', 'anorgasmia')
     and not (
       t.status = 'deprecated'
       and t.merged_into_id is null
       and t.deprecation_reason like 'data-quality audit 2026-06-05: orphan tag%'
     );
  if v_bad > 0 then
    raise exception
      'revive footjob: % of the 2 rows are no longer the 2026-06-05 orphan-sweep shape — re-read before proceeding', v_bad;
  end if;

  select count(*) into v_bad
    from (values ('footjob'), ('anorgasmia')) as s(slug)
   where not exists (select 1 from public.unified_tags t where t.slug = s.slug);
  if v_bad > 0 then
    raise exception 'revive footjob: % expected row(s) do not exist at all', v_bad;
  end if;

  select id into v_tag     from public.unified_tags where slug = 'footjob';
  select id into v_worship from public.unified_tags where slug = 'foot-worship' and status = 'active';

  if v_worship is null then
    raise exception 'revive footjob: foot-worship is not an active tag — the alias premise has changed';
  end if;

  -- The aliases about to be deleted must be the ones this migration reasoned
  -- about. If either has been re-pointed at some other tag, deleting it is no
  -- longer the same decision.
  select count(*) into v_bad
    from public.tag_aliases a
   where lower(a.alias_slug) in ('footjob', 'foot-job')
     and a.canonical_tag_id is distinct from v_worship;
  if v_bad > 0 then
    raise exception
      'revive footjob: % footjob alias(es) no longer point at foot-worship — resolve by hand', v_bad;
  end if;

  ------------------------------------------------------- drop the wrong aliases
  -- Synonyms first, while the link still exists to find them by. The FK
  -- `search_synonyms.tag_alias_id` is ON DELETE SET NULL, so a synonym row
  -- SURVIVES its alias and keeps rewriting queries toward the wrong tag —
  -- deleting the alias first orphans the rewrite instead of removing it.
  -- Measured at authoring time: zero such rows. The ordering is here because
  -- being right only when the table happens to be empty is not being right.
  with doomed as (
    select a.id from public.tag_aliases a
     where lower(a.alias_slug) in ('footjob', 'foot-job')
       and a.canonical_tag_id = v_worship
  )
  delete from public.search_synonyms s
   where s.tag_alias_id in (select id from doomed);
  get diagnostics v_syn = row_count;

  delete from public.tag_aliases a
   where lower(a.alias_slug) in ('footjob', 'foot-job')
     and a.canonical_tag_id = v_worship;
  get diagnostics v_aliases = row_count;

  --------------------------------------------------------------------- revive
  -- status, deprecated_at and deprecation_reason are cleared TOGETHER. That is
  -- the whole difference between a revive and a resurrection: an update that
  -- set status='active' and left deprecated_at standing is what once stranded
  -- 297 tags rendering-but-unindexable. Since 20261007100000 the CHECK
  -- `unified_tags_status_matches_deprecated_at` makes that state
  -- unrepresentable, so getting it wrong aborts here rather than shipping.
  --
  -- category / category_id / is_adult / is_sensitive / wikidata_id are
  -- deliberately UNTOUCHED. The row is already filed under Practices & Play,
  -- already flagged adult and sensitive, and already carries the CORRECT
  -- Wikidata item for its sense (Q107417158, verified against the live entity —
  -- not a namesake). This migration restores visibility and fixes prose; it does
  -- not re-file the taxonomy, and writing category_id would move the page's
  -- primary junction row for no reason.
  update public.unified_tags set
    description         = 'A non-penetrative sex act in which the feet are used to stimulate a partner''s genitals.',
    short_description   = 'Genital stimulation using the feet.',
    long_description    = 'A footjob uses the feet — soles, toes or both — to stimulate a partner''s genitals, usually with a stroking or pressing motion and often with lubricant. Because it is non-penetrative it sits among the lower-risk activities for transmitting sexually transmitted infections, though skin contact and shared fluids still carry some risk, and cuts or broken skin on the feet raise it in both directions. Short nails and clean feet are the practical points people who do it tend to raise first. It is routinely confused with foot worship, which is attraction to feet itself: a footjob is a specific act, and either one happens without the other.',
    status              = 'active',
    deprecated_at       = null,
    deprecation_reason  = null,
    seo_indexable       = false,
    human_reviewed      = false,
    verification_status = 'unverified'
  where id = v_tag;

  ------------------------------------------------------------------ provenance
  insert into public.tag_sources (tag_id, source_type, claim_summary, is_public)
  values (
    v_tag,
    'editorial:general-knowledge',
    'Definition written from independently documented meaning. Not derived from the Kinktionary, whose licence is non-commercial. Revived from the 2026-06-05 orphan sweep on the reasoning of 20261211100000: a glossary term has no entity assignments by nature, so that sweep culled vocabulary rather than junk. The pre-existing wrong-concept aliases footjob/foot-job on foot-worship (Q463859, foot fetishism) were deleted in the same migration; this term is Q107417158, an act, not an attraction.',
    false
  );

  ------------------------------------------------------------------ assertions
  -- Revived.
  select count(*) into v_bad from public.unified_tags
   where slug = 'footjob'
     and (status <> 'active' or deprecated_at is not null or deprecation_reason is not null);
  if v_bad > 0 then
    raise exception 'revive footjob: the row is not cleanly active';
  end if;

  -- Not publishable. This is the safety property, and it is the one that a row
  -- count would never show.
  select count(*) into v_bad from public.unified_tags
   where slug = 'footjob'
     and (seo_indexable or coalesce(human_reviewed, false) or verification_status <> 'unverified');
  if v_bad > 0 then
    raise exception 'revive footjob: the row is publishable — it must be revived unreviewed and unindexed';
  end if;

  -- The placeholder is gone from BOTH columns the two surfaces render, not just
  -- the one a reader sees.
  select count(*) into v_bad from public.unified_tags
   where slug = 'footjob'
     and (description = 'Sexual activity tag'
          or short_description = 'A type of intimate activity'
          or btrim(coalesce(long_description, '')) = ''
          or long_description not like '%non-penetrative%');
  if v_bad > 0 then
    raise exception 'revive footjob: placeholder prose survived in a rendered column';
  end if;

  -- Provenance recorded.
  if not exists (
    select 1 from public.tag_sources
     where tag_id = v_tag and source_type = 'editorial:general-knowledge' and is_public = false
  ) then
    raise exception 'revive footjob: no provenance record';
  end if;

  -- The shadow this migration exists to avoid creating. Scoped to the slug that
  -- just went active — the corpus carries 27 pre-existing shadows that are not
  -- this change's to clear, and folding them in would make the assertion
  -- unsatisfiable and therefore useless.
  if exists (
    select 1 from public.tag_aliases a
     where lower(a.alias_slug) = 'footjob' and a.canonical_tag_id <> v_tag
  ) then
    raise exception 'revive footjob: an alias still shadows the revived slug';
  end if;

  -- The held-back row must not have become a DUPLICATE. Stated as the corpus
  -- invariant — no two active tags share one Wikidata item — rather than as
  -- "anorgasmia is still deprecated", which is what an earlier draft asserted
  -- and which was wrong twice over.
  --
  -- (1) It coupled this migration to a decision taken elsewhere. The
  --     anorgasmia → orgasmic-dysfunction merge is live follow-up work, and its
  --     DIRECTION is deliberately open: `anorgasmia` is filed correctly under
  --     Sexual Health while `orgasmic-dysfunction` publishes a clinical
  --     dysfunction under Fetishes, which is the vaginismus /
  --     sexual-pain-penetration-disorder shape where the merge went AGAINST the
  --     alias direction. So `anorgasmia` ending up ACTIVE and canonical is a
  --     legitimate outcome — and a status assertion would have aborted `db
  --     push` for the whole repo when it arrived.
  -- (2) It asserted a FUTURE state from a migration that runs exactly once.
  --     After this applies it never re-checks anything, so it could only ever
  --     fire on an ordering accident, never on the decay it was written for.
  --
  -- What is worth asserting is the defect itself, which no merge direction can
  -- produce and only a mistaken revival can: two live rows for one concept.
  -- Scoped to Q1772397, the item this migration deliberately did NOT revive.
  --
  -- It is scoped that tightly because the first draft asked the same question
  -- of all four slugs and FAILED on the clean corpus — surfacing a real
  -- pre-existing duplicate that has nothing to do with this change:
  -- `foot-worship` (Fetishes) and `foot-fetish` (Practices & Play) are BOTH
  -- active and BOTH carry Q463859. That pair needs a merge and a direction
  -- decision of its own; it is not this migration's to make, and an assertion
  -- that fires on state this migration neither created nor fixes would block
  -- `db push` for the whole repo, permanently. An assertion has to be
  -- satisfiable by the change that carries it.
  select count(*) into v_bad
    from public.unified_tags a
    join public.unified_tags b
      on b.wikidata_id = a.wikidata_id and b.id <> a.id
   where a.status = 'active' and b.status = 'active'
     and a.wikidata_id = 'Q1772397';
  if v_bad > 0 then
    raise exception
      'revive footjob: % active row(s) share Q1772397 — anorgasmia was duplicated rather than merged', v_bad;
  end if;

  -- Corpus-wide CI zero-invariant, restated on the shape rather than on this
  -- migration's rows: an indexable active tag with no description at all.
  select count(*) into v_bad from public.unified_tags
   where status = 'active' and seo_indexable
     and coalesce(nullif(btrim(description), ''), short_description) is null;
  if v_bad > 0 then
    raise exception 'revive footjob: % indexable row(s) corpus-wide have no description', v_bad;
  end if;

  raise notice 'revive footjob: 1 tag revived, % alias(es) deleted, % synonym(s) deleted, anorgasmia held back',
    v_aliases, v_syn;
end
$mig$;
