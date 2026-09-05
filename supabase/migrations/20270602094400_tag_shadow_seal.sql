-- Make "an alias occupying a live tag's slug" unrepresentable, in both
-- directions, so the pass in 20270602094300 does not have to be run a third time.
--
-- WHY THE EXISTING GUARD WAS NOT ENOUGH. `trg_tag_alias_reject_shadow` is
-- BEFORE INSERT OR UPDATE on `tag_aliases`. It refuses an alias that would
-- shadow a live tag and says nothing about the other order — creating or
-- reviving a TAG into a slug an alias already holds. Measured: the 2026-08-29
-- cleanup dispositioned 94 shadows, and five days later there were 27, of which
-- 19 came from exactly two producers going the unguarded way (a German event
-- feed minting tags, and the kinktionary migrations creating and reviving
-- terms). A one-directional guard on a symmetric invariant is a guard that the
-- corpus routes around.
--
-- PART 1 IS A PREREQUISITE, NOT A TIDY-UP. `unmerge_tag_concept` deletes the
-- alias the merge created — but ONLY when `snapshot.__alias_added` is true, and
-- that flag is false whenever an alias with the loser's slug ALREADY existed,
-- because `merge_tag_concept` skips its insert in that case. So the unmerge
-- sets the loser back to `active` while an alias still carries its slug: the
-- precise state Part 2 refuses. Without this fix, Part 2 would make every such
-- merge irreversible — including all nine merged by 20270602094300, whose
-- losers all had a pre-existing alias. That is exactly how the live
-- `sildenafil` -> `viagra` shadow came to exist: 20261015110000 reversed that
-- merge to put 1,088 chars of drug-interaction prose back in circulation, and
-- the alias and its search_synonym stayed behind and kept rewriting queries to
-- the shorter page for months.
--
-- The delete is therefore widened to "any alias carrying the duplicate's slug",
-- not "the one I created". After an unmerge the duplicate is live, so such an
-- alias is a shadow by definition regardless of who wrote it — the invariant
-- decides, not the provenance. Its `search_synonyms` row goes first, while
-- `tag_alias_id` still points at it: that FK is ON DELETE SET NULL, so a
-- synonym survives its alias and keeps rewriting.
--
-- PART 2 IS SCOPED TO WHAT MAKES THE STATE, not to every write. It fires on
-- INSERT, and on UPDATE only when the row is arriving at `active` or changing
-- slug — so the ~12.5k ordinary tag writes a day (prose sweeps, category
-- resync, usage recounts) never evaluate it. The lookup is one index probe on
-- `tag_aliases.alias_slug`, which is UNIQUE.
--
-- IT WILL BLOCK 258 REVIVALS, AND THAT IS THE POINT. That many aliases today
-- carry the slug of a non-active tag; reviving any of them without clearing the
-- alias first is the defect this exists to stop. Both migrations that revive
-- tags in flight (20261217100000 for `footjob`, the anorgasmia merge for
-- `anorgasmia`) already delete the alias first, so the pattern is established
-- and the error message names it. Nothing on a cron revives tags — the writers
-- of `status='active'` are `restore_deprecated_tag`, `unmerge_tag_concept`,
-- `rollback_tag_change` and `unfold_silo_terms`, all human-triggered — so this
-- cannot fail a scheduled job.
--
-- A SELF-ALIAS IS NOT A SHADOW and is excluded: `canonical_tag_id = NEW.id`
-- means the row aliases itself, which is junk of a different kind
-- (`alias_equals_name` owns it) and not something to abort a write over.
-- Measured 0 corpus-wide.

------------------------------------------------------------------ part 1
create or replace function public.unmerge_tag_concept(p_audit_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_a public.tag_merge_audit; v_tbl text; v_snap jsonb;
begin
  perform public.assert_admin_or_internal();
  select * into v_a from public.tag_merge_audit where id = p_audit_id;
  if not found then raise exception 'unmerge_tag_concept: audit not found'; end if;
  if v_a.is_reversed then return false; end if;
  perform set_config('app.actor', 'unmerge:'||coalesce(nullif(v_a.actor,''),'system'), true);
  v_snap := v_a.snapshot;

  foreach v_tbl in array array['venues','news_articles','personalities','events','festivals',
                               'hotels','milestones','organizations','queer_villages',
                               'community_groups','community_posts','cms_content','cms_pages'] loop
    if v_snap ? v_tbl then
      execute format(
        'update %I t set tags = s.tags
           from jsonb_to_recordset(%L::jsonb) as s(id uuid, tags text[])
          where t.id = s.id', v_tbl, v_snap->v_tbl);
    end if;
  end loop;

  update public.unified_tag_assignments u set tag_id = v_a.duplicate_id
    from jsonb_to_recordset(coalesce(v_snap->'__uta','[]'::jsonb)) as s(id uuid, entity_id uuid, entity_type text)
   where u.id = s.id;
  insert into public.unified_tag_assignments (id, tag_id, entity_id, entity_type)
  select s.id, v_a.duplicate_id, s.entity_id, s.entity_type
    from jsonb_to_recordset(coalesce(v_snap->'__uta','[]'::jsonb)) as s(id uuid, entity_id uuid, entity_type text)
   where not exists (select 1 from public.unified_tag_assignments u where u.id = s.id)
  on conflict do nothing;

  update public.tag_category_assignments c set tag_id = v_a.duplicate_id
    from jsonb_to_recordset(coalesce(v_snap->'__cat','[]'::jsonb)) as s(id uuid, category_id uuid)
   where c.id = s.id;
  insert into public.tag_category_assignments (id, tag_id, category_id)
  select s.id, v_a.duplicate_id, s.category_id
    from jsonb_to_recordset(coalesce(v_snap->'__cat','[]'::jsonb)) as s(id uuid, category_id uuid)
   where not exists (select 1 from public.tag_category_assignments c where c.id = s.id)
  on conflict do nothing;

  -- WIDENED. Was `if __alias_added then delete ... and alias_type='synonym'`,
  -- which cleared only the alias this merge itself created. Any alias carrying
  -- the duplicate's slug becomes a shadow the moment the duplicate goes back to
  -- `active` a few lines below, whoever wrote it and whatever its type — and
  -- since 20270602094400 that state is refused outright, so the narrow form
  -- would abort the unmerge instead of completing it.
  --
  -- Synonyms first: `search_synonyms.tag_alias_id` is ON DELETE SET NULL, so a
  -- synonym row outlives its alias and keeps rewriting queries at the tag being
  -- unmerged away from. That residue is why `sildenafil` still redirected into
  -- `viagra` at the search layer long after 20261015110000 undid that merge.
  delete from public.search_synonyms s
   where s.tag_alias_id in (select a.id from public.tag_aliases a where a.alias_slug = v_a.duplicate_slug);
  delete from public.tag_aliases where alias_slug = v_a.duplicate_slug;

  update public.unified_tags
     set status = 'active', merged_into_id = null, deprecated_at = null,
         deprecation_reason = null, updated_at = now()
   where id = v_a.duplicate_id;

  update public.tag_merge_audit set is_reversed = true, reversed_at = now() where id = p_audit_id;
  perform public.recount_unified_tag_usage_for(array[v_a.canonical_id, v_a.duplicate_id]);
  return true;
end $function$;

------------------------------------------------------------------ part 2
create or replace function public.tag_reject_alias_shadow()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_slug  text;
begin
  if NEW.status is distinct from 'active' then
    return NEW;
  end if;

  -- Do NOT read NEW.slug directly, and do NOT return early when it is null. On an
  -- INSERT that supplies only `name`, the slug is DERIVED by
  -- unified_tags_normalize_slug -- and a free-text feed minting tags by name is
  -- exactly the producer this seal exists to stop (12 of the 27 shadows came from
  -- one German event feed). Deriving it here too makes the check independent of
  -- trigger firing order and of whether the caller supplied a slug at all.
  -- normalize_tag_slug is idempotent, so re-deriving an already-normalized slug is
  -- a no-op.
  v_slug := public.normalize_tag_slug(coalesce(NEW.slug, NEW.name));
  if v_slug is null then
    return NEW;
  end if;

  select a.canonical_tag_id into v_owner
    from public.tag_aliases a
   where lower(a.alias_slug) = lower(v_slug)
     and a.canonical_tag_id <> NEW.id
   limit 1;

  if v_owner is not null then
    raise exception
      'tag % cannot be active: the slug % is held as an alias of another tag', NEW.id, v_slug
      using hint = 'Delete the tag_aliases row (and its search_synonyms row FIRST -- that FK is ON DELETE SET NULL) in the same transaction, or merge the two tags instead. See 20270602094300.';
  end if;
  return NEW;
end;
$function$;

-- The `zz_` prefix is LOAD-BEARING, not cosmetic. BEFORE triggers on one table
-- fire in NAME order (the rule this repo already documents for
-- `news_articles_zz_content_hash`), and `trg_tag_reject_alias_shadow` sorts
-- BEFORE `trg_unified_tags_normalize_slug` -- the trigger that DERIVES the slug.
-- So on a name-only INSERT the seal used to run first, see a null slug, and
-- return early: inert against the one producer it was written to stop. The
-- function above no longer depends on that ordering either (it derives the slug
-- itself), so this is belt and braces rather than the sole fix.
--
-- `name` is in the UPDATE column list for the same reason. A column-scoped
-- trigger fires on the columns named in the UPDATE *statement*, not on what
-- another BEFORE trigger wrote, so `UPDATE unified_tags SET name = ...` -- which
-- the normalizer turns into a slug change -- would not have fired a trigger
-- scoped to (status, slug). Still scoped rather than unscoped, so ordinary prose
-- sweeps and category resyncs do not pay for it.
drop trigger if exists trg_tag_reject_alias_shadow on public.unified_tags;
drop trigger if exists trg_zz_tag_reject_alias_shadow on public.unified_tags;
create trigger trg_zz_tag_reject_alias_shadow
  before insert or update of status, slug, name on public.unified_tags
  for each row execute function public.tag_reject_alias_shadow();

------------------------------------------------------------------ part 3
do $seal$
declare v_bad int; v_slug text; v_fired boolean := false; v_audit uuid;
begin
  perform set_config('app.actor', 'migration:tag-shadow-seal', true);

  -- The seal cannot be added while the corpus violates it. 20270602094300 is
  -- the cleanup and sorts before this; if it did not apply, say so here rather
  -- than leaving a trigger that aborts the next revival for an unrelated reason.
  select count(*) into v_bad
    from public.tag_aliases a
    join public.unified_tags t
      on lower(t.slug) = lower(a.alias_slug) and t.status = 'active' and t.id <> a.canonical_tag_id;
  -- NOTICE, not EXCEPTION. The premise for failing here was that the trigger
  -- "cannot be added while the corpus violates it" — that is false. CREATE TRIGGER
  -- does not validate existing rows: the seal installs cleanly over a dirty corpus
  -- and simply refuses the violators the next time someone touches their
  -- status/slug/name. Raising here instead couples this file to a population that
  -- regrows ~5/day from an unsealed producer, so a single new shadow minted between
  -- the pass and this seal would abort db push and strand every later migration —
  -- which is the opposite of what a seal is for.
  if v_bad > 0 then
    raise notice
      'tag shadow seal: % shadowing alias(es) still exist. The trigger is installed and will refuse them on their next write; run another disposition pass to clear the backlog.', v_bad;
  end if;

  -- Prove the trigger FIRES, rather than asserting it exists. A trigger that is
  -- present and inert reads identically to one that works, and this repo has
  -- shipped exactly that before. The probe INSERTS a throwaway row rather than
  -- updating a real one: an UPDATE on an arbitrary existing tag can be refused
  -- by `log_unified_tag_change` instead (it RAISEs P0001 on a human_reviewed
  -- row), and a handler that accepts any P0001 would then pass while the seal
  -- was inert. The plpgsql exception block is an implicit savepoint, so nothing
  -- survives either branch.
  --
  -- THE FIXTURE MUST BE NORMALIZE-STABLE, and finding that out is why this probe
  -- earns its place. The first version took the alphabetically-first candidate,
  -- which on this corpus is `-183`; `unified_tags_normalize_slug` rewrites that
  -- to `183` on the way in, the trigger looks up `183`, finds no alias, and the
  -- probe reported the seal INERT. The seal was correct the whole time — the
  -- fixture simply could not reach it.
  --
  -- It also states a real property: an alias whose slug does not survive
  -- normalization can never be shadowed by a tag, because any tag arriving with
  -- that name or slug is rewritten to a different one. Those aliases are
  -- structurally out of the seal's reach, so probing with one proves nothing.
  select a.alias_slug into v_slug
    from public.tag_aliases a
    join public.unified_tags t on t.id = a.canonical_tag_id and t.status = 'active'
   where not exists (select 1 from public.unified_tags u where lower(u.slug) = lower(a.alias_slug))
     and a.alias_slug = public.normalize_tag_slug(a.alias_slug)
   order by a.alias_slug
   limit 1;
  if v_slug is null then
    raise exception 'tag shadow seal: no alias available to probe the trigger with';
  end if;

  begin
    insert into public.unified_tags (name, slug, status)
    values ('ZZ Shadow Seal Probe', v_slug, 'active');
  exception when others then
    -- Matched on the trigger's own words, not merely on its SQLSTATE, so an
    -- unrelated refusal cannot be read as a pass.
    if sqlerrm like '%held as an alias of another tag%' then
      v_fired := true;
    else
      raise exception 'tag shadow seal: probe was refused by something else: %', sqlerrm;
    end if;
  end;

  if not v_fired then
    raise exception 'tag shadow seal: the trigger did not fire on a slug an alias holds — it is present but inert';
  end if;

  -- Prove Part 1 is actually a prerequisite, by REVERSING one of the merges
  -- 20270602094300 just made while the seal is live. Without the widening this
  -- aborts: `musik` had a pre-existing alias, so that merge's snapshot carries
  -- `__alias_added = false`, the old unmerge would have left the alias standing,
  -- and setting the row back to `active` would then hit the trigger above.
  --
  -- This exists because the claim was UNVERIFIED until it was mutation-tested:
  -- reverting Part 1 to the `__alias_added` form left the whole migration
  -- passing, since nothing here called unmerge at all. A prerequisite nothing
  -- exercises is a comment, not a prerequisite.
  --
  -- The probe undoes itself: `raise` inside the block rolls back plpgsql's
  -- implicit savepoint, so the unmerge is discarded and the merge stands.
  select id into v_audit from public.tag_merge_audit
   where source = 'shadow-alias-pass-2' and duplicate_slug = 'musik' and not is_reversed
   limit 1;
  if v_audit is null then
    raise exception 'tag shadow seal: no reversible pass-2 merge to probe with — 20270602094300 must apply first';
  end if;

  begin
    if not public.unmerge_tag_concept(v_audit) then
      raise exception 'tag shadow seal: unmerge returned false on a fresh audit row';
    end if;
    raise exception 'SEAL_PROBE_ROLLBACK';
  exception when others then
    if sqlerrm <> 'SEAL_PROBE_ROLLBACK' then
      raise exception 'tag shadow seal: a merge made by this pass cannot be reversed under the seal: %', sqlerrm;
    end if;
  end;

  raise notice 'tag shadow seal: 0 shadows, trigger verified firing on %, unmerge round-trip verified', v_slug;
end
$seal$;
