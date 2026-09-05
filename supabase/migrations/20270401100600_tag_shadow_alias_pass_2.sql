-- Second reviewed pass over the aliases whose slug is an ACTIVE tag's slug.
--
-- The 2026-08-29 cleanup (20261011090000) dispositioned 94 of these. Five days
-- later there are 27. That is NOT diffuse drift — `unified_tags.created_at` on
-- the shadowed rows puts them in three cohorts, and two producers account for 19:
--
--   12  2026-08-30  the Siegessäule Berlin event feed. Free-text GERMAN feed
--                   tags (alter, anonym, band, bisexuell, garten, gayfriendly,
--                   gewalt, musik, sexarbeiter, sub) plus danseur and villa.
--                   Every sampled event carries `siegessaeule-mix`.
--    7  2026-09-03  the kinktionary term migrations 20261211100000/100100 —
--                   bimbofication, coach, frottage, mosh created, femdom,
--                   pretzel, voyeur revived. Same day, same programme.
--    7  2025-08-15  the drug import: dapoxetine/priligy, fluoxetine/prozac,
--                   ecstasy, sertraline, sildenafil.
--
-- BOTH PRODUCERS WALKED THROUGH THE SAME HOLE. `trg_tag_alias_reject_shadow`
-- is BEFORE INSERT OR UPDATE on `tag_aliases` ONLY: it refuses an alias that
-- would shadow a live tag, and has nothing to say when a TAG is created or
-- revived into a slug an alias already holds. So the guard is one-directional
-- and the cleanup regrows. 20270401100700 closes it; this migration is the
-- cleanup that has to land first, because a seal cannot be added while the
-- corpus still violates it.
--
-- EVERY PAIR WAS READ. Dispositions, and what decided each:
--
-- === DELETE THE ALIAS (18) ===
-- The alias is the bug. `resolve_tag_slug` does NOT consult `tag_aliases`, so
-- deleting one changes no URL; what it changes is the search rewrite and the
-- synonym rail, both of which currently point away from a page that exists.
--
--   alter        -> daddy         German "Alter" = AGE. Q7565 is `father`
--                                 (en-alias "daddy"). All 553 uses are Berlin
--                                 listings indexed by age band (jugend, ü50,
--                                 "50+ die Nachtschwärmer"). Wrong concept.
--   anonym       -> anonymous     Wrong SENSE. The 102 uses are "Tests auf
--                                 HIV/STIs" and "Anonyme Alkoholiker" —
--                                 anonymity as privacy. Q4233718 is anonymous
--                                 AUTHORSHIP ("unknown artist"), and is itself
--                                 misfiled under Fetishes.
--   band         -> relationship  German "Band" here is a music group — the
--                                 uses are "Projektband für Frauen* und
--                                 Queers". Q223642 is interpersonal
--                                 relationship (de: zwischenmenschliche
--                                 Beziehung), never "Band".
--   coach        -> trainer       The shadowed row is a KINK role and says so:
--                                 "A dominant role framed as training and
--                                 improvement rather than command." Q41583 is
--                                 the sports coach. Different concepts.
--   danseur      -> dancer        The shadowed row is a SEX POSITION ("one of
--                                 the bottom's legs raised high and held.
--                                 Named for the ballet lift it resembles"),
--                                 filed under Positions. The alias is the
--                                 French for a performer.
--   dapoxetine   -> priligy       Reciprocal half of a mutual shadow; see the
--   fluoxetine   -> prozac        merges below. Each of these points AT the row
--                                 being merged away, so left standing it would
--                                 become an alias carrying the SURVIVOR's slug
--                                 and parented to a tombstone — two defects at
--                                 once. Deleted before the merge runs.
--   frottage     -> frotting      Shadow removed, both rows KEPT. Q1098028's
--                                 label is `frot` and lists both as aliases, so
--                                 Wikidata lumps them — but only `frotting`
--                                 carries the QID and its description is the
--                                 placeholder "Sexual activity tag", while
--                                 `frottage` has real prose and no QID. Merging
--                                 would mean moving a QID onto the survivor,
--                                 which is out of scope here (see the rule
--                                 stated under the merges). Flagged, not merged.
--   garten       -> gardens       Target is `status='deprecated'`. An alias to a
--                                 deprecated tag routes nothing and shadows a
--                                 live one.
--   gbl          -> ghb           A `covers` alias WITH a live search_synonym,
--                                 so a search for GBL is rewritten to GHB. But
--                                 /tags/gbl exists and carries the distinction
--                                 that matters: "a volume of GBL matching an
--                                 ordinary GHB dose can be fatal, and neither
--                                 bottle tells you which one you have."
--                                 `covers` is for a narrower term with NO tag
--                                 of its own. This one has one.
--   mosh         -> slamming      The worst of the set. Routes "mosh" to a page
--                                 about INJECTING DRUGS. The target is also
--                                 already `status='merged'`, and it carries
--                                 Q1463560, whose label is `moshing` — so the
--                                 drug page is itself holding the moshing item.
--   pretzel      -> pretzels      Kink role ("A flexible bottom who enjoys
--                                 being folded into demanding positions")
--                                 against Q160525, a baked pastry. Target also
--                                 deprecated.
--   sertraline   -> ssris         Same shape as gbl: a `covers` alias with a
--                                 live synonym rewriting away from a page that
--                                 exists and is longer (507 chars vs 196).
--   sexarbeiter  -> harlot        German "Sexarbeiter" is the neutral term for
--                                 a sex worker. Q36633 is prostitution, and the
--                                 target renders it as a kink role-play label.
--                                 Rewriting the neutral term to that is a
--                                 framing this glossary should not make.
--   sildenafil   -> viagra        THE RESIDUE OF AN UNMERGE. 20261015110000
--                                 reversed the sildenafil->viagra merge because
--                                 it had taken 1,088 chars of drug-interaction
--                                 prose out of circulation. The alias and its
--                                 search_synonym survived, and still rewrite
--                                 "sildenafil" to the shorter page — undoing
--                                 the unmerge at the search layer.
--                                 `unmerge_tag_concept` did not remove them
--                                 because `__alias_added` was false: the merge
--                                 had found an alias already there and skipped
--                                 its own insert. 20270401100700 fixes that.
--   sub          -> submissive    NOT the kink abbreviation. The 80 uses are
--                                 AHA/SUB community-centre listings — "AHA
--                                 Plenum", "Eurovision Karaoke", "Queer Poetry
--                                 Shuffle Jam". It is an organisation name.
--   villa        -> town          DIFFERENT Wikidata items: the shadowed row is
--                                 Q3950 (villa, a building) and the target is
--                                 Q3957 (town). The alias exists because
--                                 Romance-language "villa" can mean town.
--   voyeur       -> voyeurism     `voyeur` was DELIBERATELY revived as its own
--                                 term by 20261211100000 (the person) beside
--                                 the practice. Rewriting one to the other
--                                 discards that decision.
--
-- === MERGE (9) ===
-- Two families. German feed twins follow the policy 20261211120100 set —
-- `unified_tags.name` IS the English label by design, so a German name is a
-- vocabulary defect and the fix is to route it to the English row. The rest are
-- same-Wikidata-item duplicates.
--
--   bisexuell    -> bisexual        German twin. Both Orientation. 542 -> 1592.
--   gayfriendly  -> lgbt-friendly   German-feed spelling of the descriptor.
--                                   584 -> 1415. CROSS-CATEGORY (Venue Types
--                                   vs Venue Features & Policies) — the only
--                                   pair here that is, hence the demote below.
--   gewalt       -> violence        German twin; Q98034423's German label is
--                                   literally "Gewalt". All 113 uses are one
--                                   organisation, Maneo (gay victim support).
--   musik        -> music           German twin, Q638.
--   ecstasy      -> mdma            Same item Q69488, whose label is `MDMA` and
--                                   whose alias is "ecstasy". The `ecstasy`
--                                   row's description is a scraped Wikipedia
--                                   DISAMBIGUATION page ("Ecstasy (emotion)…
--                                   Religious ecstasy… Ecstasy (philosophy)").
--                                   In-corpus precedent: crystal-meth was
--                                   merged into methamphetamine the same way.
--   femdom       -> female-dominance  Same item Q1404482, label "female
--                                   dominance", "femdom" an alias. Both
--                                   Dynamics & Roles, both 0 uses; the winner
--                                   is the indexable one. The community term
--                                   survives as the redirect and the synonym.
--   bimbofication -> bimboification  Orthographic variants of ONE word, so the
--                                   Wikidata-label rule does not apply — that
--                                   rule decides which TERM names a concept,
--                                   not which SPELLING. (For the record the
--                                   label IS `bimbofication`.) Decided instead
--                                   on surgery cost: the winner already holds
--                                   the QID, the longer prose and the
--                                   indexable flag, while the loser has no
--                                   category junction at all. Reversing it
--                                   would mean moving four things to change one
--                                   letter, for an identical reader outcome.
--   priligy      -> dapoxetine      Brand row that is a BYTE-FOR-BYTE copy of
--   prozac       -> fluoxetine      the generic's description (633 and 519
--                                   chars, identical on both sides). That is
--                                   the shape the corpus already retires:
--                                   zoloft (507) == sertraline (507),
--                                   paxil and stendra are all deprecated. It is
--                                   NOT the cialis/levitra/viagra shape, where
--                                   the brand carries its own shorter,
--                                   separately-written prose and stays live —
--                                   which is why sildenafil->viagra above is a
--                                   plain alias delete and these two are
--                                   merges. Q424965 and Q422244 label as the
--                                   generics.
--
-- WHAT IS DELIBERATELY NOT DONE HERE. No alias `review_status` is promoted.
-- Approval is an AUTO-TAGGING RULE, not a display toggle, and several of these
-- are ordinary words; that is its own reviewed decision and
-- `unreviewed_typed_alias` is the queue for it. No prose is rewritten. The
-- merges' losers keep their slugs as redirect trails, so every /tags/<loser>
-- URL that resolves today still resolves after this.

do $mig$
declare
  r          record;
  v_alias    uuid;
  v_loser    uuid;
  v_winner   uuid;
  v_syn      int := 0;
  v_del      int := 0;
  v_merged   int := 0;
  v_reparent int := 0;
  v_n        int;
  v_bad      int;
  v_adult    jsonb := '{}'::jsonb;
begin
  -- Declared INSIDE the block: db push makes no promise that a bare statement
  -- before a `do` block shares its transaction, and several rows here are
  -- human_reviewed, which log_unified_tag_change() refuses to let a `system:%`
  -- actor touch.
  perform set_config('app.actor', 'migration:tag-shadow-alias-pass-2', true);

  ---------------------------------------------------------------- preconditions
  -- The pass was reasoned about 27 pairs. If the corpus has moved — a sibling
  -- session merged one, an ingest minted a new one — the review is about a
  -- different set and must be redone rather than partially applied.
  select count(*) into v_n
    from public.tag_aliases a
    join public.unified_tags t
      on lower(t.slug) = lower(a.alias_slug) and t.status = 'active' and t.id <> a.canonical_tag_id;
  -- SUPERSET, not equality. This counts a population the header itself describes
  -- as regrowing (~5/day from a free-text feed) and which is NOT sealed until the
  -- next file in this same push — so an equality test races the producer: one new
  -- shadowing alias minted between the measurement and the merge aborts db push
  -- and strands every migration behind it.
  --
  -- FEWER than 27 is the case actually worth aborting on — it means a reviewed
  -- pair was resolved elsewhere and this file's hand-checked dispositions are
  -- stale. MORE than 27 is safe here, because parts A and B below resolve each of
  -- the 27 BY NAME and raise individually if a reviewed pair has moved; the extras
  -- are simply left for the next pass.
  if v_n < 27 then
    raise exception
      'shadow pass 2: corpus holds only % shadowing aliases, fewer than the 27 reviewed — a reviewed pair was resolved elsewhere, re-read before applying', v_n;
  end if;

  ------------------------------------------------------- part A: 18 alias deletes
  for r in
    select * from (values
      ('alter','daddy'), ('anonym','anonymous'), ('band','relationship'),
      ('coach','trainer'), ('danseur','dancer'), ('dapoxetine','priligy'),
      ('fluoxetine','prozac'), ('frottage','frotting'), ('garten','gardens'),
      ('gbl','ghb'), ('mosh','slamming'), ('pretzel','pretzels'),
      ('sertraline','ssris'), ('sexarbeiter','harlot'), ('sildenafil','viagra'),
      ('sub','submissive'), ('villa','town'), ('voyeur','voyeurism')
    ) as t(alias_slug, target_slug)
  loop
    -- Resolve by the PAIR, never by alias_slug alone. If an alias has been
    -- re-pointed at some other tag since the review, deleting it is no longer
    -- the same decision.
    select a.id into v_alias
      from public.tag_aliases a
      join public.unified_tags t on t.id = a.canonical_tag_id
     where lower(a.alias_slug) = r.alias_slug and t.slug = r.target_slug;
    if v_alias is null then
      raise exception 'shadow pass 2: alias % -> % no longer exists as reviewed', r.alias_slug, r.target_slug;
    end if;

    -- Synonyms FIRST, while `search_synonyms.tag_alias_id` still points at the
    -- alias. The FK is ON DELETE SET NULL, so a synonym row SURVIVES its alias
    -- and keeps rewriting queries toward the wrong tag — deleting the alias
    -- first orphans the rewrite instead of removing it. Three of these 18 have
    -- one (gbl, sertraline, sildenafil), so unlike the usual case this ordering
    -- is doing real work rather than guarding an empty table.
    delete from public.search_synonyms where tag_alias_id = v_alias;
    get diagnostics v_n = row_count;
    v_syn := v_syn + v_n;

    delete from public.tag_aliases where id = v_alias;
    v_del := v_del + 1;
  end loop;

  if v_del <> 18 then
    raise exception 'shadow pass 2: deleted % aliases, expected 18', v_del;
  end if;

  -------------------------------------------------------------- part B: 9 merges
  -- Snapshot is_adult on every winner BEFORE merging. merge_tag_concept moves
  -- the loser's category junctions onto the winner, and
  -- unified_tags_recompute_is_adult() matches ANY assignment — so a merge can
  -- flip a winner to 18+ and deindex it. That is live on `vaginismus` today.
  --
  -- The junction COUNT is snapshotted alongside it, because is_adult only
  -- catches a stray that lands in a kink category. gayfriendly's Venue Types
  -- row is neither kink nor primary, so it would ride onto a 1,415-use
  -- descriptor completely silently — the first draft of this migration deleted
  -- it and asserted nothing about it.
  select jsonb_object_agg(t.slug, jsonb_build_object(
           'adult', t.is_adult,
           'junctions', (select count(*) from public.tag_category_assignments c where c.tag_id = t.id)))
    into v_adult
    from public.unified_tags t
   where t.slug in ('bisexual','lgbt-friendly','violence','music','mdma',
                    'female-dominance','bimboification','dapoxetine','fluoxetine');

  for r in
    select * from (values
      ('bisexuell','bisexual'), ('gayfriendly','lgbt-friendly'), ('gewalt','violence'),
      ('musik','music'), ('ecstasy','mdma'), ('femdom','female-dominance'),
      ('bimbofication','bimboification'), ('priligy','dapoxetine'), ('prozac','fluoxetine')
    ) as t(loser_slug, winner_slug)
  loop
    select id into v_loser  from public.unified_tags where slug = r.loser_slug  and status = 'active';
    select id into v_winner from public.unified_tags where slug = r.winner_slug and status = 'active';
    if v_loser is null or v_winner is null then
      raise exception 'shadow pass 2: merge % -> % did not resolve to two active rows', r.loser_slug, r.winner_slug;
    end if;

    -- DEMOTE BEFORE MERGE. merge_tag_concept deletes the loser's category row
    -- only when the winner holds the SAME category_id; filed differently it
    -- just repoints it, and two is_primary rows on one tag violate the partial
    -- unique index tag_category_assignments_one_primary_per_tag (23505). Only
    -- gayfriendly -> lgbt-friendly is cross-category here, but the demote is
    -- applied to all nine rather than to the one, because which pairs are
    -- cross-category is a property of today's data and not of this list.
    update public.tag_category_assignments a
       set is_primary = false
     where a.tag_id = v_loser
       and a.is_primary
       and exists (select 1 from public.tag_category_assignments c
                    where c.tag_id = v_winner and c.is_primary);

    perform public.merge_tag_concept(
      v_winner,   -- canonical
      v_loser,    -- duplicate
      'migration:tag-shadow-alias-pass-2', 'shadow-alias-pass-2');
    v_merged := v_merged + 1;

    -- NOT moved by the merge core. `ecstasy` carries 18 multilingual MDMA
    -- names, `priligy` 6 and `prozac` 4; left behind they would be aliases
    -- parented to a tombstone.
    --
    -- This is why part A deletes `dapoxetine` and `fluoxetine` FIRST. Mutation-
    -- tested by letting those two survive: the abort does NOT come from
    -- trg_tag_alias_reject_shadow, which was the prediction — that trigger
    -- deliberately permits `canonical_tag_id = the tag itself`, so re-parenting
    -- an alias onto the tag whose slug it carries LAUNDERS a shadow into a
    -- self-alias and walks straight past it. What actually catches it two
    -- assertions down is alias_equals_name (`Dapoxetine` aliasing `Dapoxetine`).
    -- Same laundering shape as the anorgasmia merge; the shadow trigger cannot
    -- be relied on to catch a re-parent.
    update public.tag_aliases set canonical_tag_id = v_winner where canonical_tag_id = v_loser;
    get diagnostics v_n = row_count;
    v_reparent := v_reparent + v_n;
  end loop;

  if v_merged <> 9 then
    raise exception 'shadow pass 2: merged % pairs, expected 9', v_merged;
  end if;

  -- The one stray junction this pass can produce. gayfriendly's Venue Types row
  -- is demoted above and then repointed onto lgbt-friendly, leaving a 1,415-use
  -- descriptor filed under a second category it was never meant to carry.
  -- Deleted by NAME rather than by "anything non-primary", because `violence`
  -- legitimately holds a pre-existing secondary (Digital & Travel Safety) that
  -- a blanket rule would eat.
  delete from public.tag_category_assignments a
   using public.unified_tags t, public.tag_categories c
   where a.tag_id = t.id and a.category_id = c.id
     and t.slug = 'lgbt-friendly' and c.slug = 'venues-nightlife' and not a.is_primary;

  ------------------------------------------------------------------ assertions
  -- The point of the whole pass.
  select count(*) into v_bad
    from public.tag_aliases a
    join public.unified_tags t
      on lower(t.slug) = lower(a.alias_slug) and t.status = 'active' and t.id <> a.canonical_tag_id;
  if v_bad <> 0 then
    raise exception 'shadow pass 2: % shadowing alias(es) remain', v_bad;
  end if;

  -- No winner was dragged 18+, and no winner gained a category, because of a
  -- junction that rode the merge. Compared against the pre-merge snapshot, not
  -- against a hardcoded expectation, so it reports a CHANGE rather than a state
  -- someone has to keep in step.
  select count(*) into v_bad from public.unified_tags t
   where v_adult ? t.slug
     and (t.is_adult is distinct from (v_adult->t.slug->>'adult')::boolean
          or (select count(*) from public.tag_category_assignments c where c.tag_id = t.id)
             is distinct from (v_adult->t.slug->>'junctions')::int);
  if v_bad > 0 then
    raise exception 'shadow pass 2: % winner(s) changed is_adult or gained a category — a junction rode the merge', v_bad;
  end if;

  -- Every merge loser is a clean tombstone, and every merged loser's URL still
  -- resolves. resolve_tag_slug reads unified_tags then tag_slug_redirects, so
  -- this is the actual reader path, not a proxy for it.
  for r in select unnest(array['bisexuell','gayfriendly','gewalt','musik','ecstasy',
                               'femdom','bimbofication','priligy','prozac']) as slug
  loop
    if not exists (select 1 from public.resolve_tag_slug(r.slug) x where x.redirected) then
      raise exception 'shadow pass 2: /tags/% no longer resolves after the merge', r.slug;
    end if;
  end loop;

  -- Nothing this pass merged is left with aliases parented to it. Scoped to the
  -- nine losers, NOT corpus-wide: 217 aliases already sit on merged tags from
  -- earlier work, so the corpus-wide form is unsatisfiable and would therefore
  -- assert nothing. Measured, not assumed — the first dry run failed here.
  select count(*) into v_bad
    from public.tag_aliases a join public.unified_tags t on t.id = a.canonical_tag_id
   where t.slug in ('bisexuell','gayfriendly','gewalt','musik','ecstasy',
                    'femdom','bimbofication','priligy','prozac');
  if v_bad > 0 then
    raise exception 'shadow pass 2: % alias(es) are still parented to a row this pass merged away', v_bad;
  end if;

  -- Corpus zero-invariants a merge is known to move.
  select count(*) into v_bad from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id
   where lower(a.alias_name) = lower(t.name);
  if v_bad > 0 then
    raise exception 'shadow pass 2: % alias(es) now equal their own tag name', v_bad;
  end if;

  select count(*) into v_bad from public.unified_tags
   where merged_into_id is not null and status <> 'merged';
  if v_bad > 0 then
    raise exception 'shadow pass 2: % row(s) carry merged_into_id without status=merged', v_bad;
  end if;

  -- usage_count is the assignment count on every row this touched.
  -- recount_unified_tag_usage_for computed it from three `tags[]` arrays until
  -- 20261210100000 and would have re-baselined `bisexual` (1,592) and
  -- `lgbt-friendly` (1,415) downward; asserted rather than cited.
  select count(*) into v_bad from public.unified_tags t
   where t.slug in ('bisexual','lgbt-friendly','violence','music','mdma','female-dominance',
                    'bimboification','dapoxetine','fluoxetine','bisexuell','gayfriendly',
                    'gewalt','musik','ecstasy','femdom','bimbofication','priligy','prozac')
     and t.usage_count is distinct from
         (select count(*)::int from public.unified_tag_assignments a where a.tag_id = t.id);
  if v_bad > 0 then
    raise exception 'shadow pass 2: usage_count disagrees with the assignment count on % row(s)', v_bad;
  end if;

  raise notice 'shadow pass 2: % aliases deleted (% synonyms), % merges, % aliases re-parented, 0 shadows remain',
    v_del, v_syn, v_merged, v_reparent;
end
$mig$;
