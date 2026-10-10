-- `tag_hygiene_stats().junk_token_name_active` — so the junk cannot come back.
--
-- `99991791619649` deprecated twenty locale codes, filter labels and bare
-- letters. Nothing was watching for the next one. This adds the gauge, as a
-- ZERO-INVARIANT rather than an advisory level: a single letter, a title-cased
-- two-letter token and a filter-UI stopword have no legitimate source in this
-- vocabulary, so unlike `uncategorized_active` or `redirect_to_non_canonical`
-- there is nothing here that oscillates from ordinary in-glossary work.
--
-- PATCHED VIA pg_get_functiondef(), NEVER RESTATED. The rule `99991790719601`
-- established and `99991790828215` repeated. The live body is not what any repo
-- file says: `99991789930597` narrowed four counters and added `entity_kind` to
-- `duplicate_active_name`'s grouping key by string surgery, `99991790719601`
-- added the shared `ut` CTE plus three SET clauses, and `99991790828215`
-- unscoped `prose_unreviewed` — all by patch. A `create or replace` assembled
-- from any repo file silently reverts whichever of those it does not contain.
--
-- THE PREDICATE IS NAME-SHAPE ONLY, and both of its halves are measured.
--
-- (a) "No definition" is NOT part of it, though an earlier draft had it. `A`
--     (Q9659), `R` (Q9852) and `B` (Q9705) all carry real prose — about the
--     ALPHABET — so a no-prose requirement would have made this counter read
--     ZERO while all three were live. That is the shape of the defect, not an
--     exemption from it: this class characteristically arrives WITH
--     Wikipedia-derived prose for the wrong sense.
--
-- (b) `entity_kind <> 'attribute'` is the whole false-positive defence, and it
--     is why the rule is not "concept only". Measured against prod, the bare
--     predicate matches 23 live rows: the 20 junk ones (13 `concept`, 6
--     `descriptor` — Nz, Cz, Ng, Lu, Pe, Mk — and 1 `place`, Uk) plus exactly
--     three legitimate rows, `size-l`, `size-m` and `size-s`, whose names ARE
--     the single letters L, M and S at ~20,000 uses each. Scoping to `concept`
--     would have excluded the size facets AND gone blind to 7 of the 20 rows
--     this counter exists to watch. Excluding `attribute` catches all 20 and
--     spares all 3. It is also the distinction `previewFor` already draws in
--     src/lib/tags/tagsIndexState.ts for the same reason.
--
-- An all-caps two-letter name is deliberately ACCEPTED: `normalize_tag_name`'s
-- all-uppercase rung preserves a genuine acronym, so `TV` (662 uses) and `DJ`
-- (52) survive, and without a vocabulary an all-caps code is indistinguishable
-- from an acronym. Under-reaching is the correct error — a wrongly counted
-- term costs a reviewer an argument, a wrongly rejected one costs vocabulary.
--
-- A bare number is NOT counted: `369` and `469` carry real definitions and
-- `2C-B`, `3-MMC`, `24-Hour`, `80s-Themed` are all real terms.
--
-- Kept in step with the mint-path gate in `_shared/tag-name-quality.ts` by
-- src/lib/__tests__/junkTokenNamePredicateParity.test.ts. Two implementations
-- in two languages cannot share code, so they share a test.
--
-- READS NO NEW TABLE: it selects from the existing `active` CTE, so the one
-- pass over `unified_tags` that `99991790719601` bought is preserved.
--
-- SOFT ON PRECONDITIONS: a second apply is a NOTICE, not an abort.

do $patch$
declare
  src text;
  bare text;
  newsrc text;
  n int;
  anchor constant text := E'\n  ) into v;';
  frag constant text := $frag$,
    -- A single letter, a title-cased two-letter token (a locale code the name
    -- normalizer title-cased: `gb` -> `Gb`) or a filter-UI stopword. Never
    -- vocabulary, whatever prose it carries. `attribute` is excluded because
    -- the marketplace size facets ARE the letters L, M and S; an all-caps
    -- two-letter name is accepted so real acronyms (TV, DJ) pass. See the
    -- header of 99991791619654 for the measurements behind both.
    'junk_token_name_active', (
      select count(*) from active
       where entity_kind::text is distinct from 'attribute'
         and ( name ~ '^[A-Za-z]$'
            or (name ~ '^[A-Za-z]{2}$' and name <> upper(name))
            or lower(btrim(name)) in ('all','other','none','various','misc') ))$frag$;
begin
  -- TWO COPIES, AND THE SPLIT IS LOAD-BEARING IN BOTH DIRECTIONS.
  --
  -- `src` is RAW because it is the string `replace()` rewrites and `execute`
  -- runs: stripping comments before re-executing would silently delete every
  -- comment from the LIVE function body, including the measurements
  -- 99991789930597 and 99991790719601 recorded in it. A patch is not a place to
  -- lose the reasoning the next reader needs.
  --
  -- `bare` is the comment-stripped copy every structural assertion below reads,
  -- so explanatory prose can never satisfy a missing-code check — the rule
  -- scripts/check-functiondef-asserts.mjs enforces, after an unstripped assert
  -- aborted `db push` on main three times on 2026-09-20 and stranded the whole
  -- queue. It is not hypothetical here: the fragment this file INSERTS carries a
  -- comment, so the body acquires prose in exactly the region these checks read.
  --
  -- Fetched in ONE statement so no window exists in which `src` is read without
  -- its stripped sibling.
  select pg_get_functiondef(p.oid),
         regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
    into src, bare
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'tag_hygiene_stats';

  if src is null then
    raise exception 'public.tag_hygiene_stats() does not exist';
  end if;

  if position('junk_token_name_active' in bare) > 0 then
    raise notice 'junk_token_name_active is already present; nothing to do';
    return;
  end if;

  -- The shared CTE this counter reads must exist, or the inserted arm would
  -- reference a name that is not in scope and the `execute` would fail with a
  -- less legible error than this one.
  if position(E'  active as (\n    select * from ut' in bare) = 0 then
    raise exception
      'tag_hygiene_stats() has no shared `active` CTE reading `ut`; the body was reshaped, so re-derive this patch from the live definition rather than forcing it';
  end if;

  -- Counted on the literal rather than a regex so no escaping can widen it.
  -- Two occurrences would mean the tail is shared and this would insert twice.
  --
  -- ON `src`, NOT `bare`, and that is the one place the split inverts: this
  -- counts occurrences in the string `replace()` is about to modify, so a count
  -- taken over a different string would describe a different edit. Stripping
  -- cannot destroy this anchor (it carries no `--`); it could only ever CREATE
  -- one inside a comment, which raises here and aborts rather than inserting
  -- twice — loud, not a false green.
  n := (length(src) - length(replace(src, anchor, ''))) / length(anchor);
  if n <> 1 then
    raise exception 'the `) into v;` anchor occurs % times, expected 1', n;
  end if;

  newsrc := replace(src, anchor, frag || anchor);
  if newsrc = src then
    raise exception 'patch produced an identical body';
  end if;

  execute newsrc;
end $patch$;

do $verify$
declare
  src text;
  n int;
  v_counter bigint;
  v_truth bigint;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'tag_hygiene_stats';

  -- pg_get_functiondef() includes comments. Strip them before any structural
  -- assertion, so explanatory prose cannot satisfy a missing-code check — the
  -- header above names `attribute`, `TV` and `DJ` in exactly the words the
  -- checks below look for.
  src := regexp_replace(src, '--[^' || chr(10) || ']*', '', 'g');

  -- P1. The key exists, exactly once.
  select count(*) into n from regexp_matches(src, 'junk_token_name_active', 'g');
  if n <> 1 then
    raise exception 'P1: junk_token_name_active appears % times, expected 1', n;
  end if;

  -- P2. The `attribute` exclusion is present. Without it the counter reads 3
  -- on a clean corpus (size-l/m/s) and can never be a zero-invariant.
  if position('entity_kind::text is distinct from ''attribute''' in src) = 0 then
    raise exception 'P2: the attribute exclusion is gone; size-l/m/s would be counted';
  end if;

  -- P3. The two-letter arm still requires NOT all-caps, so TV and DJ pass.
  if position('name <> upper(name)' in src) = 0 then
    raise exception 'P3: the two-letter arm lost its case test; real acronyms would be counted';
  end if;

  -- P4. 99991790719601 survives: the shared CTE, and no new table read. The
  -- arm selects from `active`, so these counts must not have moved.
  if position('ut as materialized' in src) = 0 then
    raise exception 'P4: the shared ut CTE is gone -- the body was restated, not patched';
  end if;
  select count(*) into n from regexp_matches(src, 'from unified_tags\M', 'g');
  if n <> 3 then raise exception 'P4: unified_tags read % times, expected 3', n; end if;

  -- P5. The three planner/memory settings and SECURITY DEFINER survive.
  -- `create or replace` RESETS proconfig wholesale, so this reads the catalog.
  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'tag_hygiene_stats'
       and p.proconfig @> array['search_path=public','enable_indexonlyscan=off','work_mem=48MB']
       and p.prosecdef
  ) then
    raise exception 'P5: tag_hygiene_stats lost a SET clause or SECURITY DEFINER';
  end if;

  -- P6. IT EXECUTES, and the counter agrees with ground truth computed off the
  -- table rather than read back from itself. Twelve counters once read 0 for
  -- months because the function was broken, not because the corpus was clean.
  select (public.tag_hygiene_stats()->>'junk_token_name_active')::bigint into v_counter;

  select count(*) into v_truth
    from unified_tags
   where status = 'active' and merged_into_id is null
     and entity_kind::text is distinct from 'attribute'
     and ( name ~ '^[A-Za-z]$'
        or (name ~ '^[A-Za-z]{2}$' and name <> upper(name))
        or lower(btrim(name)) in ('all','other','none','various','misc') );

  if v_counter is distinct from v_truth then
    raise exception 'P6: counter reads % but ground truth is %', v_counter, v_truth;
  end if;

  -- P7. THE SIZE FACETS ARE NOT COUNTED. A positive control: this is the one
  -- false positive the predicate is shaped around, and asserting the counter's
  -- value alone would pass on a corpus where they had been deleted instead.
  if (select count(*) from unified_tags
       where slug in ('size-l','size-m','size-s') and status = 'active'
         and entity_kind::text = 'attribute') <> 3 then
    raise exception 'P7: the three size facets are not all active attributes; re-derive the exclusion';
  end if;

  raise notice 'junk_token_name_active = % (ground truth %)', v_counter, v_truth;
end $verify$;
