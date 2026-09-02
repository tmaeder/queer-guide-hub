-- Tag language normalisation: merge the German cohort into its English
-- equivalents, remove six scraped hashtag strings, and retract three wrong-entity
-- descriptions.
--
-- `unified_tags.name` IS the English label by design -- name_i18n carries the
-- translations and never holds an 'en' key (0 of 8,364 populated rows). A German
-- name is therefore a vocabulary defect in the English column, not a
-- localisation, and the fix is to route it to the English tag that already
-- exists.
--
-- WHY THIS IS A HAND-WRITTEN LIST AND NOT A HEURISTIC. The obvious detector --
-- "the name equals its own German translation" -- measures ~5% precision on this
-- corpus: it flags Party, Film, Pride, Transgender (4,714 uses), Cruising and
-- Coming Out, which are English words German borrowed. A broader "looks foreign"
-- pass is worse still; the 2026-08-02 audit found that of 92 non-ASCII names only
-- two were untranslated, the rest being people's names, loanwords and anatomy
-- (Beyoncé, Jägermeister, Müllerian). Diacritics mark orthography, not language.
-- Every row below was read by hand with its category, usage and description.
--
-- RESOLUTION IS BY NAME AT RUNTIME, NEVER BY A LITERAL SLUG. The previous attempt
-- at this work (scripts/data-quality/englishify-tags.mjs) keyed its RENAMES map
-- on slug, and its `munchen: 'Munich'` entry could never fire because the broken
-- slug pipeline had produced `m-nchen`. The preceding migration
-- 20261203100000_tag_slug_seal repairs those slugs, so a slug literal written
-- today may be stale by the time this applies; a name is stable across both.

do $$
declare
  r            record;
  v_dup        uuid;
  v_canon      uuid;
  v_merged     int := 0;
  v_deprecated int := 0;
  v_retracted  int := 0;
  v_failed     int := 0;
  v_lasterr    text;
  v_before     jsonb;
  v_after      jsonb;
  v_touched    uuid[] := '{}';   -- every row the merges touched, for the count repair
  v_pre        jsonb  := '{}';   -- canonical id -> usage_count BEFORE the merge
  v_now        int;
  v_was        int;
  v_id         uuid;
begin
  perform set_config('app.actor', 'admin:tag-language-normalisation', false);

  -- app.actor must not match 'system:%': log_unified_tag_change() RAISEs when a
  -- system actor modifies a human_reviewed row and aborts the whole statement.

  v_before := public.tag_hygiene_stats();

  ---------------------------------------------------------------------------
  -- PART 1 -- merge the German tags into their existing English equivalents.
  --
  -- Every loser is 0-2 usage; every canonical is live and well-used (Gay 4,914,
  -- Lesbian 2,960, Writer 992, Education 691). merge_tag_concept keeps the
  -- loser's slug on the loser as its redirect trail, so /tags/schwul resolves to
  -- Gay rather than 404ing. It also adds the loser's NAME as an alias on the
  -- canonical, which at least avoids the alias_equals_name hazard here because
  -- the names differ ("Schwul" on "Gay") rather than being a self-alias.
  --
  -- DO NOT read more into that alias than it delivers. An earlier draft of this
  -- comment claimed it "makes the German term findable"; that is FALSE for event
  -- auto-linking and was corrected after checking the deployed function rather
  -- than the migration text. `run_event_tag_link` (cron event_tag_link, */10)
  -- builds its lookup from `unified_tags` alone -- slug and name, active and
  -- unmerged -- and contains no reference to `tag_aliases` whatsoever (verified
  -- against pg_get_functiondef on prod: 0 occurrences). So an alias row changes
  -- nothing about which events link to which tag.
  --
  -- The redirect is the real deliverable of these merges. The alias is inert for
  -- event linking and its value elsewhere (site search, the synonyms rail) is
  -- not something this migration establishes.
  ---------------------------------------------------------------------------
  for r in
    select * from (values
      ('Schwul',         'Gay'),
      ('Lesbisch',       'Lesbian'),
      ('Nonbinär',       'Non-Binary'),
      ('Gesundheit',     'Health'),
      ('Deutschland',    'Germany'),
      ('München',        'Munich'),
      ('Feministisch',   'Feminist'),
      ('Bühne',          'Stage'),
      ('Beratung',       'Counseling'),
      ('Bildung',        'Education'),
      ('Schauspielerin', 'Actress'),
      ('Schriftsteller', 'Writer')
    ) as t(dup_name, canon_name)
  loop
    select id into v_dup   from public.unified_tags
      where name = r.dup_name   and status = 'active' order by id limit 1;
    select id into v_canon from public.unified_tags
      where name = r.canon_name and status = 'active' order by id limit 1;

    if v_dup is null or v_canon is null or v_dup = v_canon then
      raise exception 'tag dispositions: pair % -> % did not resolve (dup=%, canon=%)',
        r.dup_name, r.canon_name, v_dup, v_canon;
    end if;

    begin
      -- DEMOTE BEFORE MERGE. merge_tag_concept deletes the loser's category
      -- assignment only when the canonical holds the SAME category_id; filed
      -- differently it just repoints the row, and if both are is_primary the
      -- partial unique index tag_category_assignments_one_primary_per_tag
      -- raises 23505. SEVEN of these twelve pairs are cross-category (Schwul
      -- Identity vs Gay Orientation, Bildung Culture & Community vs Education
      -- Work/School, Gesundheit Health vs Health Sexual Health, Bühne Drag &
      -- Performance vs Stage Events & Parties, Feministisch, München,
      -- Schriftsteller), so this is the common case here, not the edge case.
      -- Same rule as 20261016100000:415 and 20261203100000:234.
      update public.tag_category_assignments a
         set is_primary = false
       where a.tag_id = v_dup
         and a.is_primary
         and exists (select 1 from public.tag_category_assignments c
                      where c.tag_id = v_canon and c.is_primary);

      -- Remember what the canonical was worth before merge_tag_concept recounts
      -- it, so Part 2 can prove the repair restored it rather than guessing.
      v_pre := v_pre || jsonb_build_object(
        v_canon::text, (select coalesce(usage_count,0) from public.unified_tags where id = v_canon));
      v_touched := v_touched || v_canon || v_dup;

      perform public.merge_tag_concept(
        v_canon, v_dup, 'admin:tag-language-normalisation', 'tag-language-normalisation');
      v_merged := v_merged + 1;
    exception when others then
      -- Swallow so one bad pair cannot abort the batch, but COUNT it and raise
      -- the real sqlerrm after the loop. The 20260802110451 template swallows
      -- without counting, which surfaced a 23505 three blocks later as a
      -- downstream symptom instead of its cause.
      v_failed  := v_failed + 1;
      v_lasterr := format('%s -> %s: %s', r.dup_name, r.canon_name, sqlerrm);
      raise notice 'tag dispositions: merge failed for %', v_lasterr;
    end;
  end loop;

  if v_failed > 0 then
    raise exception 'tag dispositions: % merge(s) failed, last: %', v_failed, v_lasterr;
  end if;

  ---------------------------------------------------------------------------
  -- PART 1b -- REPAIR usage_count, which merge_tag_concept corrupts.
  --
  -- merge_tag_concept:94 calls recount_unified_tag_usage_for(), which recomputes
  -- usage_count by counting slug strings in exactly three arrays --
  -- venues.tags, news_articles.tags, personalities.tags. But usage_count is
  -- MAINTAINED from unified_tag_assignments, and the two are different
  -- quantities. Measured on prod 2026-09-02, stored == assignment count for all
  -- 12 canonicals here, exactly, while the recount would have written:
  --
  --     gay            4914 -> 1808   (it ignores the 4,100 EVENTS carrying the tag)
  --     lesbian        2960 -> 2046
  --     writer          992 ->  656
  --     news-education  691 ->    0   (the SLUG never appears in news_articles.tags;
  --                                    the NAME "education" does, 388 times)
  --     non-binary      454 ->  341
  --
  -- So merging twelve 0-usage German tags would silently re-baseline the usage
  -- figures of the largest tags in the glossary. That is a latent defect in the
  -- shared merge core -- it fires on every caller, including the nightly dedup
  -- sweep -- and fixing it there is separate work with a much wider blast
  -- radius, because it changes what usage_count MEANS for every consumer.
  --
  -- Here we only undo the damage this migration caused, from the definition the
  -- column actually carries: the assignment count. After the merge the loser's
  -- assignments have been repointed at the canonical, so this is also the
  -- correct post-merge total rather than a restore of the old one.
  ---------------------------------------------------------------------------
  update public.unified_tags t
     set usage_count = (select count(*) from public.unified_tag_assignments a where a.tag_id = t.id),
         updated_at  = now()
   where t.id = any(v_touched);

  -- Prove it: no canonical may end below what it was worth before the merge.
  for v_id in select jsonb_object_keys(v_pre)::uuid loop
    v_was := (v_pre->>v_id::text)::int;
    select coalesce(usage_count,0) into v_now from public.unified_tags where id = v_id;
    if v_now < v_was then
      raise exception 'tag dispositions: canonical % fell % -> % after merge -- count repair failed',
        v_id, v_was, v_now;
    end if;
  end loop;

  ---------------------------------------------------------------------------
  -- PART 2 -- deprecate every active tag whose NAME contains a hashtag.
  --
  -- These are concatenated hashtags lifted verbatim out of scraped page text,
  -- not authored vocabulary: "Pulse #Mordopfer #Hassverbrechen" is a tag NAME.
  --
  -- THE PREDICATE IS MECHANICAL ON PURPOSE, and it replaced a hand-written list
  -- of six. That list came from a German-morphology regex, and the regex missed
  -- two: "Upstairslounge #Mordopfer" (ends in -er, matched no suffix rule) and
  -- "Gewaltverbrechen #Kriminell". The terminal assertion below is `name like
  -- '%#%'`, so a literal list can silently disagree with the check that guards
  -- it -- and did, on the first dry run. One predicate, used for both.
  --
  -- All eight live rows were read by hand. Every one is a scraped German
  -- hashtag concatenation, 0 usage. They name real atrocities: Admiral Duncan
  -- (London 1999), UpStairs Lounge (New Orleans 1973, 32 dead), Bar Noar (Tel
  -- Aviv 2009), Pulse (Orlando 2016), Club Q (Colorado Springs 2022). What is
  -- deprecated is the SCRAPED STRING, not the events. If the platform wants
  -- those concepts they deserve authored tags with real prose, not a German
  -- hashtag concatenation no reader would ever search for.
  --
  -- The count guard exists because the predicate is broad: a legitimate future
  -- tag could contain '#' (#MeToo, C#). None does today. If this ever matches
  -- far more than the eight measured, stop and re-read before applying.
  ---------------------------------------------------------------------------
  if (select count(*) from public.unified_tags where status = 'active' and name like '%#%') > 20 then
    raise exception 'tag dispositions: % active hashtag tags, expected ~8 -- re-read before applying',
      (select count(*) from public.unified_tags where status = 'active' and name like '%#%');
  end if;

  update public.unified_tags
     set status             = 'deprecated',
         deprecated_at      = now(),
         deprecation_reason = 'tag-language-normalisation: scraped hashtag string, not authored vocabulary',
         seo_indexable      = false
   where status = 'active'
     and name like '%#%';
  get diagnostics v_deprecated = row_count;

  ---------------------------------------------------------------------------
  -- PART 3 -- retract three wrong-entity descriptions.
  --
  -- All three were seo_indexable and their prose describes a different subject:
  --   Pulse #Mordopfer #Hassverbrechen -> the pulse in an artery
  --   Schwimmen (filed Kink Community & Scenes) -> a card game
  --   Bischof -> "Bischof is a surname"
  --
  -- Retraction REMOVES only. Nothing here generates replacement text: the LLM
  -- judge built for that job was measured at ~19% precision and retracted 16
  -- definitions of which 13 were CORRECT, and is disabled by decision.
  --
  -- seo_indexable is cleared in the SAME statement as the prose. A retracted
  -- page that stays indexable is the failure this exists to prevent, and
  -- unified_tags has no needs_attention column -- seo_deindex_reason is the
  -- field that carries the why. Schwimmen and Bischof stay ACTIVE; only their
  -- wrong prose goes.
  ---------------------------------------------------------------------------
  update public.unified_tags
     set description        = null,
         long_description   = null,
         seo_indexable      = false,
         seo_deindex_reason = 'tag-language-normalisation: description described a different entity'
   where name in ('Pulse #Mordopfer #Hassverbrechen', 'Schwimmen', 'Bischof')
     and (description is not null or long_description is not null);
  get diagnostics v_retracted = row_count;

  ---------------------------------------------------------------------------
  -- PART 4 -- terminal assertions. These are the proof the migration worked;
  -- a clean apply means every one of them held.
  ---------------------------------------------------------------------------
  if exists (
    select 1 from public.unified_tags
     where status = 'active'
       and name in ('Schwul','Lesbisch','Nonbinär','Gesundheit','Deutschland','München',
                    'Feministisch','Bühne','Beratung','Bildung','Schauspielerin','Schriftsteller')
  ) then
    raise exception 'tag dispositions: a German loser is still active after the merge loop';
  end if;

  if exists (select 1 from public.unified_tags where status = 'active' and name like '%#%') then
    raise exception 'tag dispositions: an active tag still carries a hashtag in its name';
  end if;

  if exists (
    select 1 from public.unified_tags
     where name in ('Pulse #Mordopfer #Hassverbrechen','Schwimmen','Bischof')
       and (description is not null or seo_indexable)
  ) then
    raise exception 'tag dispositions: a retracted chimera still has prose or is indexable';
  end if;

  -- Merge direction is already proven by the per-canonical assertion in Part 1b,
  -- which compares each winner against its own pre-merge value rather than
  -- against a hardcoded threshold. Thresholds rot: the first draft of this
  -- migration pinned gay > 4000 / lesbian > 2500 / writer > 900, which would
  -- have passed unnoticed the day those numbers legitimately changed, and fired
  -- confusingly on the recount bug instead of naming it.

  v_after := public.tag_hygiene_stats();

  raise notice 'tag dispositions: % merged, % deprecated, % retracted', v_merged, v_deprecated, v_retracted;
  raise notice 'hygiene alias_equals_name % -> %, redirect_to_non_canonical % -> %, assignment_to_non_active_tag % -> %, duplicate_active_name % -> %',
    v_before->>'alias_equals_name',            v_after->>'alias_equals_name',
    v_before->>'redirect_to_non_canonical',    v_after->>'redirect_to_non_canonical',
    v_before->>'assignment_to_non_active_tag', v_after->>'assignment_to_non_active_tag',
    v_before->>'duplicate_active_name',        v_after->>'duplicate_active_name';

  -- Zero-invariant gates read from PROD by scripts/check-tag-hygiene.mjs on every
  -- pull_request. Growing one reds every open PR in the repo, not just this one.
  if (v_after->>'alias_equals_name')::int > (v_before->>'alias_equals_name')::int then
    raise exception 'tag dispositions: alias_equals_name grew % -> %',
      v_before->>'alias_equals_name', v_after->>'alias_equals_name';
  end if;
  if (v_after->>'assignment_to_non_active_tag')::int > (v_before->>'assignment_to_non_active_tag')::int then
    raise exception 'tag dispositions: assignment_to_non_active_tag grew % -> %',
      v_before->>'assignment_to_non_active_tag', v_after->>'assignment_to_non_active_tag';
  end if;
end $$;
