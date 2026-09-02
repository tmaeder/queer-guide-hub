-- The positions vocabulary needs almost nothing. What it needs is these three rows.
--
-- WHAT WAS MEASURED, AND WHY THE ANSWER IS "ALMOST NOTHING"
--
-- `sex-positions` ("Positions") already holds **157 primary tags** — a thorough
-- import. Asked to expand it, the honest finding is that there is nothing much
-- to expand: scanned corpus-wide for tags whose own description calls them a
-- position while they are filed under some other stop, and the whole corpus
-- yields exactly TWO rows. Both are below.
--
--   where description ~* '^(a |the )?(sex(ual)? )?position\M'
--      or description ~* '\ma (sex(ual)? )?position (where|in which|involving)'
--
-- An eyeball pass over the 157 suggested the opposite — that junk had been swept
-- in, since `netflix-and-chill`, `lets-talk-about`, `afternoon-delight` and
-- `rubdown` do not read like position names. Every one of them turns out to
-- carry a real positional description ("One partner perches on the back of a
-- sofa while the other sits on the seat…"). They are positions with playful
-- names and they stay. The slug is not the evidence; the description is.
--
-- 1. `69` PUBLISHES A BODY ABOUT THE NUMBER SIXTY-NINE.
--
-- Its long_description is about the natural number that follows 68, a year, and
-- the main-belt asteroid 69 Hesperia. It is live and seo_indexable on a sex
-- glossary. This is the WRONG-SENSE class, not the wrong-entity class: the row
-- carries NO wikidata_id at all, so nothing resolved to the wrong item — the
-- body was filled from the bare name, and "69" with no sense anchor yields
-- arithmetic. Same shape as `vacuum-pump` publishing von Guericke.
--
-- RETRACTED TO NULL rather than rewritten. The short description on the row is
-- already correct and specific ("A mutual oral sex position where two partners
-- simultaneously perform oral stimulation on each other, typically lying
-- head-to-toe"), so the page keeps a true definition and simply loses a false
-- essay. Prefer NULL to a guess: a blank re-enters the grounded fill paths,
-- a wrong body does not announce itself.
--
-- 2. `69ing` IS THE SAME CONCEPT AT A WORSE SLUG, AND MERGE DIRECTION MATTERS.
--
-- Both are active, both human_reviewed, both seo_indexable — two live pages for
-- one position. `69` wins as canonical: better slug, better display name
-- (`69Ing` is a capitalisation artifact), and the stronger alias set
-- (soixante-neuf, LXIX, sesenta y nueve).
--
-- But the loser holds the one thing the winner lacks. **`69ing` carries
-- wikidata_id Q2349, and Q2349 is CORRECT** — resolved against Wikidata rather
-- than assumed: "69 — sex position in which partners perform oral sex on each
-- other". Its `wikipedia_url` of /wiki/69 reads like the number's
-- disambiguation page and is not; that inference was made and checked before
-- being acted on. So the QID is carried onto the canonical row BEFORE the merge,
-- or the merge would delete the only correct identifier in the pair while
-- keeping the row that has none.
--
-- `69ing`'s own body is NOT carried across even though it is about the right
-- subject. It opens with "It is essential to prioritize consent and
-- communication…" — the exact consent-boilerplate padding TAG_STYLE_SYSTEM bans
-- and that 112 rows were stripped of — and closes by citing Wikidata and
-- Wikipedia as places to read about the term, which is a pointer, not a
-- definition. Neither body is publishable, so neither is published.
--
-- 3. `scissoring` DESCRIBES ITSELF AS A POSITION AND IS FILED UNDER PRACTICES.
--
-- Moved to `sex-positions`. It is NOT a duplicate of `scissors`, which was
-- checked because the names invite it: `scissors` is a specific named position
-- from the import ("the bottom lies on their back while the top lies
-- perpendicular…"), while `scissoring` is the general term, carries 2 uses, a
-- 460-character body and ten multilingual aliases (Tribadie, Tribadismus,
-- Fricatrix…). Its wikidata_id Q376032 resolves to tribadism, which is correct
-- and is left alone.
--
-- `tribbing` stays in Practices & Play deliberately: its description is "rubs
-- their genitals", an act, where `scissoring`'s is "interlock their legs", a
-- configuration. That is the same act-versus-configuration line this programme
-- used to separate practices from fetishes.
--
-- is_adult is untouched throughout: `sex-positions` and `practices-play` both
-- hang off `sex-kink`, so the derived flag cannot move. Asserted below.

set local statement_timeout = '120s';

select set_config('app.actor', 'migration:positions_vocab_69_scissoring', true);

do $mig$
declare
  v_69     uuid;
  v_69ing  uuid;
  v_cat    uuid;
  v_scis   uuid;
begin
  select id into v_69    from public.unified_tags where slug = '69'    and status = 'active';
  select id into v_69ing from public.unified_tags where slug = '69ing' and status = 'active';
  select id into v_cat   from public.tag_categories where slug = 'sex-positions';

  -- (1) + (2a): retract the arithmetic body, and carry the verified QID over
  -- from the duplicate BEFORE it is merged away.
  if v_69 is not null then
    update public.unified_tags
       set long_description = null,
           wikidata_id      = coalesce(
             wikidata_id,
             (select wikidata_id from public.unified_tags where id = v_69ing)),
           updated_at       = now()
     where id = v_69;
    raise notice '69: arithmetic long_description retracted, QID carried';
  end if;

  -- (2b): CARRY THE LOSER'S ALIASES BY HAND. merge_tag_concept does not move
  -- them — measured: it adds the loser's NAME as an alias ("69Ing") and drops
  -- its alias ROWS. `69ing` holds `Neunundsechzig` and `position 69`, so a
  -- plain merge silently deletes a German alias on an eleven-language site.
  -- Guarded the way tag_alias_reject_shadow() would: never take an alias whose
  -- slug is a live tag's slug.
  -- REPOINTED, NOT COPIED, and the difference is not stylistic. `alias_slug` is
  -- globally UNIQUE, so an INSERT of the loser's alias under the winner's id
  -- collides with the row the loser already owns; with `on conflict do nothing`
  -- that collision is silent and nothing moves. A draft did exactly that and
  -- reported success — the alias assertion below is what caught it.
  if v_69 is not null and v_69ing is not null then
    update public.tag_aliases a
       set canonical_tag_id = v_69
     where a.canonical_tag_id = v_69ing
       and not exists (
         select 1 from public.unified_tags u
          where u.slug = a.alias_slug and u.status = 'active' and u.id <> v_69);
    raise notice '69ing aliases repointed to 69';
  end if;

  -- (2c): merge the duplicate.
  --
  -- The junction rows are cleared FIRST because merge_tag_concept reassigns them
  -- with `update tag_category_assignments set tag_id = canonical`, and the
  -- canonical already has a primary — which trips
  -- `tag_category_assignments_one_primary_per_tag` (23505) and aborts the merge.
  -- That is a general limitation of the merge core, not something about these
  -- two rows: ANY two tags that both carry a primary category hit it. The
  -- duplicate's filing is meaningless once it becomes a redirect stub, so
  -- dropping it is lossless here.
  --
  -- Wrapped — merge_tag_concept RAISES rather than no-opping if a concurrent
  -- session got there first, and that must not abort the deploy. An earlier
  -- draft wrapped it WITHOUT clearing the junction, so the 23505 was caught and
  -- logged as a notice and the migration reported success while merging
  -- nothing. The verify block below is what caught that, which is the argument
  -- for asserting the outcome rather than trusting the notice.
  if v_69 is not null and v_69ing is not null then
    delete from public.tag_category_assignments where tag_id = v_69ing;
    begin
      perform public.merge_tag_concept(
        v_69, v_69ing, 'migration:positions_vocab_69_scissoring', 'positions-vocabulary');
      raise notice '69ing merged into 69';
    exception when others then
      raise notice '69ing merge skipped: %', sqlerrm;
    end;
  else
    raise notice '69ing merge skipped: one side missing';
  end if;

  -- (3): re-file scissoring. category_id is the lever — writing the junction
  -- leaves unified_tags.category stale and the search facet disagreeing with
  -- the page (measured in 20261007163200).
  select id into v_scis from public.unified_tags
   where slug = 'scissoring' and status = 'active' and merged_into_id is null;
  if v_scis is not null and v_cat is not null then
    update public.unified_tags
       set category_id = v_cat, updated_at = now()
     where id = v_scis and category_id is distinct from v_cat;
    raise notice 'scissoring re-filed to sex-positions';
  end if;
end $mig$;

do $verify$
declare
  v_bad text;
  v_n   int;
begin
  -- The arithmetic body is gone and the true short definition survived.
  select count(*) into v_n from public.unified_tags
   where slug = '69' and status = 'active'
     and (long_description is not null
          or description is null
          or description !~* 'oral');
  if v_n > 0 then
    raise exception '69: body not retracted, or its real definition was lost';
  end if;

  -- No page anywhere still describes 69 as a number. Matched on what the
  -- chimera is MADE OF rather than on the slug, so a re-fill of the same essay
  -- under any row fails this.
  select string_agg(slug, ', ') into v_bad
  from public.unified_tags
  where status = 'active'
    and coalesce(long_description, '') ~* 'natural number|main-belt asteroid|Hesperia';
  if v_bad is not null then
    raise exception 'arithmetic chimera still published on: %', v_bad;
  end if;

  -- The duplicate is gone and the canonical survived as canonical.
  select count(*) into v_n from public.unified_tags
   where slug = '69ing' and merged_into_id is null and status = 'active';
  if v_n > 0 then
    raise exception '69ing still live as its own concept';
  end if;
  select count(*) into v_n from public.unified_tags
   where slug = '69' and status = 'active' and merged_into_id is null;
  if v_n <> 1 then
    raise exception '69 is no longer the canonical row';
  end if;

  -- The identifier survived the merge. This is the assertion that would have
  -- caught a naive merge in the wrong direction.
  if not exists (select 1 from public.unified_tags
                  where slug = '69' and wikidata_id = 'Q2349') then
    raise exception '69 lost the verified QID Q2349 in the merge';
  end if;

  -- The loser's multilingual aliases reached the canonical. Named individually
  -- rather than counted: a count passes while the German one specifically is
  -- the row that went missing, and merge_tag_concept adds the loser's own NAME
  -- as an alias, so the total goes UP even when the real aliases are dropped.
  select string_agg(want, ', ') into v_bad
  from unnest(array['neunundsechzig', 'position-69']) want
  where not exists (
    select 1 from public.tag_aliases a
      join public.unified_tags u on u.id = a.canonical_tag_id
     where u.slug = '69' and a.alias_slug = want);
  if v_bad is not null then
    raise exception '69ing alias(es) lost in the merge: %', v_bad;
  end if;

  -- scissoring is filed, and the denormalised text followed the category_id
  -- write. Asserting the text, not just the junction — the column is what the
  -- search facet reads.
  select string_agg(u.slug || ' text=' || coalesce(u.category, 'NULL'), ', ') into v_bad
  from public.unified_tags u
  left join public.tag_categories c on c.id = u.category_id
  where u.slug = 'scissoring' and u.status = 'active'
    and (c.slug is distinct from 'sex-positions' or u.category is distinct from c.name);
  if v_bad is not null then
    raise exception 'scissoring not filed under Positions: %', v_bad;
  end if;

  -- `scissors` is untouched — it is a different position, not a duplicate.
  if not exists (select 1 from public.unified_tags where slug = 'scissors') then
    raise exception 'scissors was removed; it is a distinct position, not a duplicate';
  end if;

  -- No is_adult moved. Both stops hang off sex-kink, so any change means the
  -- parent line shifted and a moderation gate moved without review.
  select string_agg(slug, ', ') into v_bad
  from public.unified_tags
  where slug in ('69', 'scissoring') and status = 'active' and not is_adult;
  if v_bad is not null then
    raise exception 'is_adult was lost on: %', v_bad;
  end if;
end $verify$;
