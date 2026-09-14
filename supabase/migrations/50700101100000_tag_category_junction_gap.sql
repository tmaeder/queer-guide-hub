-- Glossary category quality: the page renders the JUNCTION, and 195 active tags had none.
--
-- `unified_tags` states its category in THREE places (the rule is already in
-- CLAUDE.md): `category_id`, the denormalised `category` TEXT, and a
-- `tag_category_assignments` row with `is_primary`. Each reader surface reads a
-- DIFFERENT one -- `/tags/:slug` renders the JUNCTION (`TagDetail.tsx:224`
-- `tag?.categories?.find(c => c.is_primary)`, fed by `fetchTagWithCategories`),
-- while the search facet renders the TEXT (`search_documents_index_tags` emits
-- `facets->>'category'` from `t.category`).
--
-- Both sync triggers are UPDATE-only:
--   trg_sync_tag_category       BEFORE UPDATE
--   trg_sync_tag_category_after AFTER UPDATE OF category_id
-- so a tag INSERTed with `category_id` set never mints a junction row. Measured
-- on prod: 195 active tags carry a `category_id` and NO junction row. All 195
-- are categorised in site search and show NO category on their own page.
--
-- The producer defect is WIDER than the 195 show, and a control probe is what
-- established that rather than reading the trigger. Inserting a new tag with
-- only `category_id` set, inside a rolled-back transaction on prod:
--
--   unsealed (live today) -> category TEXT = <NULL>, junction = <NONE>, is_adult = false
--   sealed   (this file)  -> category TEXT = Fetishes, junction = Fetishes, is_adult = true
--
-- So a tag created today under a kink category is uncategorised in ALL THREE
-- representations AND created UN-GATED. The 195 carry a correct TEXT only
-- because something later UPDATEd them; a row nothing ever updates keeps all
-- three blank. That makes the seal the fix and the backfill the cleanup.
--
-- `50100101100100` found this cohort at 194 and deferred it as needing "its own
-- per-row category decision". Re-measured, that premise does not hold: on all
-- 195 the `category_id` and the TEXT column AGREE (195/195, zero disagreements),
-- so the category is already decided and already published in search. Making the
-- junction agree with the two representations that already agree is mechanical,
-- not editorial. The one genuine category ERROR found while reading the cohort
-- is handled separately and explicitly below.
--
-- WHY THIS WAS INVISIBLE: `tag_hygiene_stats()` already carries two category
-- keys and NEITHER can see this. `uncategorized_active` counts
-- `category_id IS NULL` -- the representation the page does NOT render --
-- and `denorm_category_missing` checks junction -> TEXT. Nothing checked
-- `category_id` -> JUNCTION, which is the only direction that breaks the page.
-- Same shape as the sentinel that was hardcoded to one slug out of ~240: a
-- sentinel anchored to the wrong representation reports health while the
-- rendered surface is broken. `tag_category_signals()` below closes it.
--
-- ============================================================================
-- THE LOAD-BEARING PART: a junction write silently re-derives `is_adult`.
-- ============================================================================
-- `unified_tags_recompute_is_adult()` fires AFTER INSERT on
-- `tag_category_assignments` and sets `unified_tags.is_adult` from the
-- category ALONE. So inserting the 195 missing junction rows does not merely
-- add a breadcrumb -- it recomputes content gating on every one of them.
--
-- Measured before writing anything: 22 of the 195 would flip -- 7 GATE, and
-- **15 UNGATE**. The 15 are unambiguously adult vocabulary whose category is
-- simply not one of the six adult categories: `grool`, `helicockter`,
-- `dickdash`, `hat-trick`, `body-count`, `bushmaxxing` (Slang & Language),
-- `key-party` (Events & Parties), `mmd-r18`, `story-of-o`, `the-omegaverse`,
-- `dark-romance` (Arts & Literature), `pantyboy` (Expression & Style),
-- `sadosexual`, `faggot` (Orientation), `daddy-chaser` (Subcultures & Scenes).
--
-- That is not cosmetic. `isAdultTag()` (`src/components/resources/categoryMeta.ts`)
-- is `tag.is_adult === true || isAdultCategoryName(tag.category)`, and it gates
-- behind an 18+ affirmation and safe mode (`TagDefinitionCard`, `TagInterchange`,
-- `FromTheGlossary`). Letting the recompute run would surface explicit sexual
-- slang to un-affirmed readers in safe mode.
--
-- So this migration PRESERVES `is_adult` byte-for-byte across the backfill. The
-- derivation rule is category-only and has no concept of an explicit override;
-- those 22 rows are the entire population that carries one (verified: all 4,557
-- junction-bearing active tags already agree with the derivation, 0 exceptions),
-- and they are reported by `tag_category_signals().is_adult_override` rather
-- than silently reconciled. Deciding whether the rule should grow an override
-- is a separate change; destroying 15 correct gates as a side effect of a
-- breadcrumb fix is not a decision anyone made.
--
-- Two more traps, both live:
--
--  (a) `log_unified_tag_change()` RAISEs when an UNDECLARED (`system:%`) actor
--      modifies a `human_reviewed` row, and the default actor is
--      `system:trigger`. The is_adult recompute is exactly such an UPDATE, so
--      `app.actor` is declared below. (Only 1 of the 195 is human_reviewed and
--      it does not flip, so this migration would not have hit it -- but the
--      restore statements write rows that could, and an attributable audit row
--      is the point regardless.)
--
--  (b) `trg_search_documents_tag` is column-scoped over
--      `name, short_description, description, category, slug, ...` and a
--      column-scoped trigger fires on the columns named in the STATEMENT, not
--      on what a BEFORE trigger wrote. So `UPDATE ... SET category_id = X`
--      alone leaves the search facet STALE even though the BEFORE trigger
--      rewrote `category`. The one statement that changes the TEXT therefore
--      names `category` explicitly. The 195 backfill needs no such write: their
--      TEXT is already correct, so search is already right and this migration
--      causes zero search churn.

begin;

select set_config('app.actor', 'migration:50700101100000', true);

-- ---------------------------------------------------------------------------
-- 0. Snapshot every row this migration can touch, BEFORE anything fires.
-- ---------------------------------------------------------------------------
create temp table _tag_cat_before on commit drop as
select t.id, t.slug, t.is_adult, t.category_id, t.category, t.human_reviewed
from unified_tags t
where t.status = 'active'
  and (
    -- the junction gap
    (t.category_id is not null
     and not exists (select 1 from tag_category_assignments a
                     where a.tag_id = t.id and a.is_primary))
    -- plus the two single-row repairs below
    or t.slug in ('robot', 'faggot')
  );

-- ---------------------------------------------------------------------------
-- 1. EDITORIAL (one row, stated separately so it is easy to reverse):
--    `faggot` is filed under **Orientation**. Its own description reads
--    "A slur for a gay man, reclaimed by some as a self-descriptor and as a
--    kink role." A slur is not a sexual orientation, and the corpus already
--    has a settled convention for this exact case: every other reclaimed slur
--    sits in **Slang & Language** -- `tranny`, `batty-boy`, `bulldagger`,
--    `bull-dyke`, `muff-diver`, `copenhagen-capon`, `thot`. `faggot` is the
--    outlier, filed as an identity category rather than as vocabulary.
--
--    `dyke` is deliberately NOT moved: it is also under Orientation, but it
--    already HAS a junction row (so moving it would move a live page rather
--    than fill a blank), and unlike the others it is in broad current use as a
--    self-identity, not only as a reclaimed slur. That is a real editorial
--    call and belongs in its own change.
--
--    Both columns are written in ONE statement so `trg_search_documents_tag`
--    fires and the search facet follows the page -- see trap (b) above.
--    `is_adult` is restored in step 4 like every other row.
-- ---------------------------------------------------------------------------
update unified_tags t
   set category_id = c.id,
       category    = c.name
  from tag_categories c
 where t.slug = 'faggot'
   and t.status = 'active'
   and c.name = 'Slang & Language'
   and t.category_id is distinct from c.id;

-- ---------------------------------------------------------------------------
-- 2. RECONCILE `robot`: the only row where category_id and the junction
--    disagree. The junction says Fetishes and the TEXT says Fetishes -- so the
--    page and search already agree with each other and `category_id` is the
--    lone dissenter (Dynamics & Roles). CLAUDE.md's rule is to reach for
--    `category_id` only when the JUNCTION is wrong; here it is not, so
--    `category_id` is brought into line and the page does NOT move.
--    Idempotent by construction: the AFTER trigger demotes primaries whose
--    category_id <> the new value (none) then upserts the row that already
--    exists. `category` is deliberately NOT named -- the TEXT is unchanged, so
--    naming it would enqueue a pointless reindex.
-- ---------------------------------------------------------------------------
update unified_tags t
   set category_id = a.category_id
  from tag_category_assignments a
 where a.tag_id = t.id
   and a.is_primary
   and t.slug = 'robot'
   and t.status = 'active'
   and t.category_id is distinct from a.category_id;

-- ---------------------------------------------------------------------------
-- 3. BACKFILL the missing junction rows. Direct insert into the junction:
--    re-writing `unified_tags.category_id` with the value it already holds is
--    a no-op (`is distinct from` is false, so neither trigger fires).
-- ---------------------------------------------------------------------------
insert into tag_category_assignments (tag_id, category_id, is_primary)
select t.id, t.category_id, true
  from unified_tags t
 where t.status = 'active'
   and t.category_id is not null
   and not exists (select 1 from tag_category_assignments a
                   where a.tag_id = t.id and a.is_primary)
on conflict (tag_id, category_id) do update set is_primary = true;

-- ---------------------------------------------------------------------------
-- 4. RESTORE `is_adult` to its pre-migration value on every touched row.
--    This is the whole safety property of the change: the breadcrumb appears
--    and content gating does not move. Guarded on a real difference so rows
--    that did not flip are not rewritten at all.
-- ---------------------------------------------------------------------------
update unified_tags t
   set is_adult = b.is_adult
  from _tag_cat_before b
 where b.id = t.id
   and t.is_adult is distinct from b.is_adult;

-- ---------------------------------------------------------------------------
-- 5. SEAL THE PRODUCER. Both functions referenced `old.category_id`
--    unconditionally, which is why they are UPDATE-only: on INSERT `OLD` is
--    unassigned and touching it raises `55000 record "old" is not assigned
--    yet` -- the same trap already recorded in CLAUDE.md for a loop variable
--    named `r`.
--
--    TG_OP is tested in its OWN `if` branch rather than folded into a combined
--    `tg_op = 'INSERT' or new.category_id is distinct from old.category_id`.
--    PostgreSQL does not guarantee short-circuit evaluation of OR, so the
--    compact form can still evaluate the `old` reference on an INSERT and
--    raise. Separate branches make it unambiguous.
-- ---------------------------------------------------------------------------
create or replace function public.sync_tag_category_assignment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.category_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.category := (select name from tag_categories where id = new.category_id);
  elsif new.category_id is distinct from old.category_id then
    new.category := (select name from tag_categories where id = new.category_id);
  end if;
  return new;
end;
$function$;

create or replace function public.sync_tag_category_assignment_after()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_changed boolean;
begin
  if new.category_id is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_changed := true;
  else
    v_changed := new.category_id is distinct from old.category_id;
  end if;
  if not v_changed then
    return new;
  end if;

  update tag_category_assignments
     set is_primary = false
   where tag_id = new.id and is_primary = true and category_id <> new.category_id;

  insert into tag_category_assignments (tag_id, category_id, is_primary)
  values (new.id, new.category_id, true)
  on conflict (tag_id, category_id) do update set is_primary = true;

  return new;
end;
$function$;

-- A future migration that INSERTs a tag with `category_id` AND separately
-- inserts its own junction row must use ON CONFLICT: the AFTER trigger now
-- writes that row first, so a bare INSERT of the same (tag_id, category_id)
-- raises 23505. That fails loudly at authoring time, which is the intended
-- trade for the junction existing automatically.
drop trigger if exists trg_sync_tag_category on public.unified_tags;
create trigger trg_sync_tag_category
  before insert or update on public.unified_tags
  for each row execute function sync_tag_category_assignment();

drop trigger if exists trg_sync_tag_category_after on public.unified_tags;
create trigger trg_sync_tag_category_after
  after insert or update of category_id on public.unified_tags
  for each row execute function sync_tag_category_assignment_after();

-- ---------------------------------------------------------------------------
-- 6. POSTCONDITIONS. Soft on preconditions, hard on the state this file exists
--    to reach: every guard above REPORTS and EXCLUDES rather than aborting, so
--    a concurrent session that legitimately moves one of these rows between
--    authoring and merge cannot abort `db push` on main and block every
--    migration queued behind it.
--
--    The gap count is asserted POSITIVELY (= 0 reached) rather than by counting
--    insertions: `on conflict do nothing`-shaped work is idempotent, so a
--    re-run legitimately inserts nothing and an insertion count proves nothing.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_gap        int;
  v_disagree   int;
  v_adult_moved int;
  v_faggot     text;
  v_robot_pg   text;
  v_robot_id   text;
begin
  select count(*) into v_gap
    from unified_tags t
   where t.status = 'active' and t.category_id is not null
     and not exists (select 1 from tag_category_assignments a
                     where a.tag_id = t.id and a.is_primary);
  if v_gap <> 0 then
    raise exception 'category_id without a primary junction row: % (expected 0)', v_gap;
  end if;

  select count(*) into v_disagree
    from unified_tags t
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
   where t.status = 'active' and t.category_id is distinct from a.category_id;
  if v_disagree <> 0 then
    raise exception 'category_id disagrees with the primary junction on % row(s)', v_disagree;
  end if;

  -- The safety property: nothing this migration touched changed its gating.
  select count(*) into v_adult_moved
    from unified_tags t join _tag_cat_before b on b.id = t.id
   where t.is_adult is distinct from b.is_adult;
  if v_adult_moved <> 0 then
    raise exception 'is_adult moved on % row(s); gating must be unchanged', v_adult_moved;
  end if;

  -- The editorial row: page (junction) and search (text) must tell one story.
  -- The editorial row: page (junction) and search (text) must tell one story.
  -- Guarded on the row still EXISTING and being active: if it is retired or
  -- merged away between authoring and CI applying this, that is a legitimate
  -- concurrent decision and must not abort `db push` for the whole repo.
  if exists (select 1 from unified_tags where slug = 'faggot' and status = 'active') then
    select c.name into v_faggot
      from unified_tags t
      join tag_category_assignments a on a.tag_id = t.id and a.is_primary
      join tag_categories c on c.id = a.category_id
     where t.slug = 'faggot' and t.status = 'active';
    select t.category into v_robot_id from unified_tags t where t.slug = 'faggot' and t.status='active';
    if v_faggot is distinct from 'Slang & Language' or v_robot_id is distinct from 'Slang & Language' then
      raise exception 'faggot must read Slang & Language on both page and facet, got junction=% text=%',
        coalesce(v_faggot, '<none>'), coalesce(v_robot_id, '<none>');
    end if;
  else
    raise notice 'faggot is no longer an active tag; the recategorisation was skipped (retired elsewhere)';
  end if;

  -- `robot` must not have MOVED: category_id follows the junction rather than
  -- the reverse. The invariant is AGREEMENT, not the literal category -- pinning
  -- 'Fetishes' would abort the push if someone legitimately recategorises the
  -- row, and agreement is already covered corpus-wide by v_disagree above.
  -- Reported by name here because this row is why that check went from 1 to 0.
  select c.name into v_robot_pg
    from unified_tags t
    join tag_category_assignments a on a.tag_id = t.id and a.is_primary
    join tag_categories c on c.id = a.category_id
   where t.slug = 'robot' and t.status = 'active';
  select c.name into v_robot_id
    from unified_tags t join tag_categories c on c.id = t.category_id
   where t.slug = 'robot' and t.status = 'active';
  if v_robot_pg is distinct from v_robot_id then
    raise exception 'robot page and category_id still disagree: junction=% category_id=%',
      coalesce(v_robot_pg,'<none>'), coalesce(v_robot_id,'<none>');
  end if;
  if v_robot_pg is distinct from 'Fetishes' then
    raise notice 'robot now reads % rather than Fetishes (recategorised elsewhere; page and lever still agree)', coalesce(v_robot_pg,'<none>');
  end if;

  -- The seal itself: assert the triggers fire on INSERT, or the gap regrows.
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.unified_tags'::regclass
       and tgname = 'trg_sync_tag_category_after'
       and (tgtype & 4) <> 0   -- INSERT
  ) then
    raise exception 'trg_sync_tag_category_after does not fire on INSERT; the junction gap will regrow';
  end if;
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.unified_tags'::regclass
       and tgname = 'trg_sync_tag_category'
       and (tgtype & 4) <> 0
  ) then
    raise exception 'trg_sync_tag_category does not fire on INSERT';
  end if;
end
$verify$;

commit;
