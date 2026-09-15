-- Glossary prose round four: three rows, and the small number IS the result.
--
-- Continues 50700101100200 / 51500101143000 / 51500101144000 and the named-
-- deferrals pass 51500101152700 down the backlog tag_disowned_prose_signals()
-- counts (sd_surviving 324 when this was authored).
--
-- 66 candidates were hand-read in usage order, excluding the 49 rows the four
-- previous passes repaired and the 3 they deliberately named (black, peaches,
-- warlord). THREE qualified. Round three's rate was 11 of 64; this is 3 of 66.
-- **The head of this backlog is now largely clean**, and the honest reading of
-- the drop is that the remaining ~320 are a long tail of low-usage rows, not a
-- reserve of high-usage defects waiting to be found. Anyone planning the rest
-- should expect a rate nearer this one than the ~45% upper bound
-- 50500101100300 measured at the very top.
--
-- THIS PASS USES THE WIDENED RULE 51500101152700 INTRODUCED, and says so
-- because all three rows depend on it. The original rule repairs only where the
-- row's own `description` establishes a sense the short/long description
-- contradict. **All three rows here have `description IS NULL`**, so under the
-- original rule none of them is touchable. The widened rule is: the sense may
-- also be established by a CATEGORY that admits exactly one reading of the
-- tag's own name. It is not widened to "pick the most likely sense" — that is
-- what `black` and `peaches` are still deferred for.
--
--   rooftop   Venue Types, usage 16, indexable. Summary "Top covering of a
--             building" and a 300-character body about ROOFS — the building
--             envelope, "a barrier against rain, snow, sunlight". A row named
--             `rooftop` filed under Venue Types is a rooftop BAR. This is
--             `gym`'s shape exactly: the sport instead of the place.
--
--   casual    Vibe & Crowd, usage 355, indexable. The SUMMARY is already right
--             ("Relaxed, informal atmosphere"), so the body is derived from it
--             — the group-B move of 51500101143000, where no sense is chosen
--             because the row already states it. The body was a disambiguation
--             non-answer ("can refer to various concepts") running through a
--             dress code, an employment classification, and **a subculture
--             associated with British football hooliganism**.
--
--   drag-show Expression & Style, usage 71, indexable. Not a wrong subject —
--             a NARROWED one, the `femme` / `crotch-rope` class. The body said
--             drag artists "impersonate men or women". Drag kings, nonbinary
--             performers and most of a contemporary bill are not impersonation,
--             and on this platform that framing writes performers out of their
--             own entry. Correct concept, prose that excludes; fix the prose.
--
-- THE ACTOR DECLARATION IS NOT LOAD-BEARING HERE, and saying so matters
-- because round three's header says the opposite about its own rows. All three
-- of these are `human_reviewed = false`, so log_unified_tag_change() would not
-- RAISE for a system actor. The set_config stays for ATTRIBUTION — the change
-- log should name who wrote the prose — but do not copy this file as evidence
-- that the declaration is optional in general: nine of round three's eleven
-- rows are human_reviewed and there the UPDATE genuinely fails without it.
--
-- SEARCH CHURN: trg_search_documents_tag is scoped over
--   name, short_description, description, category, slug, image_url,
--   entity_kind, merged_into_id, deprecated_at, status
-- so `casual` and `drag-show` (body only) reindex nothing, and `rooftop`
-- (which also replaces a wrong summary) correctly does.
--
-- NOT REPAIRED, named so the next pass does not re-read them:
--   potato-salad  Gear, usage 3. Prose is CORRECT for potato salad; the
--                 CATEGORY is wrong. That is the `warlord` disposition — a
--                 filing question, not a prose defect, and not this subject.
--   locker-room   Fetishes, description NULL. Summary "Room for changing
--                 clothes" is the generic sense on a kink row, but it is the
--                 same shape as `teacher`, `priest` and `acolyte`, which three
--                 passes have now left alone. Changing that is a decision about
--                 the whole generic-sense cohort, not a one-row fix.
--   tea           Venue Types, but its own `description` establishes the
--                 BEVERAGE and the body agrees with it. Description and
--                 category disagree; the widened rule does not adjudicate that.
--
-- Discipline carried over: `description` is never written (it is NULL on all
-- three, which is exactly why the widened rule is needed); prose is REPLACED
-- rather than retracted because every row is active and rendering; every UPDATE
-- is content-guarded on the defect's own text so a human who fixes one first
-- keeps their work; postconditions assert THE DEFECT IS GONE rather than that
-- this file's wording is present.

select set_config('app.actor', 'admin:tag-prose-round-four', true);

update public.unified_tags set
  short_description = 'A bar, terrace or club on the roof of a building.',
  long_description =
'A rooftop venue is a bar, restaurant, club or terrace on the roof of a building — usually open-air, and in most climates seasonal.

Two things differ from ground level often enough to be worth checking. Access is frequently a single lift or one stair, so step-free entry is less common than the venue''s own listing suggests; and a rooftop is overlooked from neighbouring buildings in a way a basement bar is not, which is worth knowing in cities where being seen at a queer venue carries a cost.'
where slug = 'rooftop' and status = 'active'
  and long_description like 'A roof is the top covering of a building%';

update public.unified_tags set long_description =
'Casual describes a venue or event with no dress code and no formality to manage: you can arrive as you are, and nobody is assessing appearance at the door.

On a listing it usually describes the crowd rather than the decor — conversation over spectacle, no table service, no queue to perform for. It says nothing about whether a place is queer-specific or merely queer-friendly, which is a separate question worth asking.'
where slug = 'casual' and status = 'active'
  and long_description like 'The term ''casual'' can refer to various concepts%';

update public.unified_tags set long_description =
'A drag show is a live performance by drag artists — drag queens, drag kings, and performers who work outside both — usually in a bar, club or theatre, and usually built from lip sync, dance, comedy and hosting.

Drag is performance, not impersonation. The older framing of "female impersonation" describes one historical strand and misses most of what happens on a contemporary stage. Bills range from family-friendly brunches and story hours to explicitly adult late-night shows, so what a particular night is depends on its billing rather than on the form.'
where slug = 'drag-show' and status = 'active'
  and long_description like 'A drag show is a form of entertainment where drag artists impersonate men or women%';

do $verify$
declare
  v_bad int; v_n int; v_note text;
begin
  select count(*) into v_bad from public.unified_tags
   where status = 'active'
     and (   (slug = 'rooftop'   and (short_description = 'Top covering of a building'
                                   or long_description like 'A roof is the top covering of a building%'))
          or (slug = 'casual'    and long_description like 'The term ''casual'' can refer to various concepts%')
          or (slug = 'drag-show' and long_description like 'A drag show is a form of entertainment where drag artists impersonate men or women%'));
  if v_bad > 0 then
    raise exception 'round four: % row(s) still publish the disowned prose', v_bad;
  end if;

  -- The corpus convention is real newlines inside the quoted string
  -- (20261007120000). `like ''%\n%''` cannot test this -- in a LIKE pattern the
  -- backslash is the ESCAPE character, so that pattern means "contains the
  -- letter n" and matches everything; that is the defect 50900101100000 shipped
  -- and caught on its own dry run. position() is what actually asserts it.
  select count(*) into v_n from public.unified_tags
   where status = 'active' and slug in ('rooftop','casual','drag-show')
     and (position('\n' in coalesce(long_description,'')) > 0
       or position('\n' in coalesce(short_description,'')) > 0);
  if v_n > 0 then
    raise exception 'round four: % row(s) carry a literal backslash-n instead of a newline', v_n;
  end if;

  -- casual and drag-show keep the summaries they already had: both were
  -- correct, and in casual's case the summary is the EVIDENCE the body was
  -- derived from, so overwriting it would remove what licensed the change.
  if exists (select 1 from public.unified_tags
              where slug = 'casual' and status = 'active'
                and short_description is distinct from 'Relaxed, informal atmosphere') then
    raise notice 'round four: casual.short_description has moved -- it was the evidence for the new body';
  end if;

  -- Reported, never enforced: none of it is this file's to own.
  select string_agg(slug, ', ' order by slug) into v_note
    from public.unified_tags
   where status = 'active' and slug in ('potato-salad','locker-room','tea');
  if v_note is not null then
    raise notice 'round four: deliberately untouched (filing or whole-cohort decisions, not prose defects): %', v_note;
  end if;

  raise notice 'round four: 3 of 66 hand-read candidates qualified -- the high-usage head of this backlog is worked out; expect this rate, not the 45%% upper bound, for the tail';
end $verify$;
