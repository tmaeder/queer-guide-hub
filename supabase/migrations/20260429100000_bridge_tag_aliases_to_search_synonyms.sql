-- Bridge tag_aliases ⇄ search_synonyms
--
-- Until now these two tables existed in parallel: tag_aliases stored editorial
-- spelling variants ("queer pub" → canonical tag "Gay bar"), and search_synonyms
-- stored runtime synonym groups for Meilisearch. Editing one didn't affect the
-- other, so an admin who added an alias did not affect search.
--
-- This migration:
--   1. Adds a unique partial index on search_synonyms(tag_alias_id) so each
--      tag_aliases row maps to at most one search_synonyms row.
--   2. Backfills search_synonyms rows for every existing active tag_aliases row
--      (terms = [alias_name], replacements = [canonical tag name],
--      status = 'approved', source = 'imported', is_one_way = true,
--      tag_id + tag_alias_id populated).
--   3. Adds an AFTER INSERT trigger on tag_aliases that auto-creates the
--      corresponding search_synonyms row going forward.
--
-- Status is 'approved' (not 'active') by design. Approved synonyms are
-- VISIBLE in the admin Synonyms tab but NOT projected into Meilisearch until
-- an admin explicitly activates them. This avoids changing search behaviour
-- as a side effect of installing this migration.

-- ── 1. Unique partial index ──────────────────────────────────────────────────
create unique index if not exists search_synonyms_tag_alias_unique
  on public.search_synonyms (tag_alias_id)
  where tag_alias_id is not null;

-- ── 2. Backfill ──────────────────────────────────────────────────────────────
insert into public.search_synonyms (
  terms, replacements, locale, indexes, is_one_way,
  status, source, tag_id, tag_alias_id, notes
)
select
  array[lower(a.alias_name)],
  array[lower(ut.name)],
  '*',
  '{}'::text[],
  true,
  'approved',
  'imported',
  a.canonical_tag_id,
  a.id,
  'auto-bridged from tag_aliases on 2026-04-29'
from public.tag_aliases a
join public.unified_tags ut on ut.id = a.canonical_tag_id
where ut.status = 'active'
  and ut.merged_into_id is null
  and a.alias_name is not null and a.alias_name <> ''
  and ut.name is not null and ut.name <> ''
  -- skip self-aliases that would produce ['x'] -> ['x']
  and lower(a.alias_name) <> lower(ut.name)
on conflict (tag_alias_id) where tag_alias_id is not null do nothing;

-- ── 3. Forward trigger ───────────────────────────────────────────────────────
-- Auto-create a search_synonyms row when a new tag_aliases row is inserted.
-- Uses SECURITY DEFINER so the trigger can write to search_synonyms regardless
-- of the calling user's RLS posture (writes are admin-only via edge function;
-- this is a controlled side effect of an admin's tag_aliases insert).
create or replace function public.sync_tag_alias_to_search_synonym()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag_name text;
begin
  -- Look up the canonical tag name. Bail out silently if the canonical tag is
  -- archived/merged — the alias still exists for editorial reference, but
  -- there's no useful synonym to project.
  select name into v_tag_name
    from public.unified_tags
   where id = new.canonical_tag_id
     and status = 'active'
     and merged_into_id is null;

  if v_tag_name is null then return new; end if;
  if new.alias_name is null or new.alias_name = '' then return new; end if;
  if lower(new.alias_name) = lower(v_tag_name) then return new; end if;

  insert into public.search_synonyms (
    terms, replacements, locale, indexes, is_one_way,
    status, source, tag_id, tag_alias_id, notes
  ) values (
    array[lower(new.alias_name)],
    array[lower(v_tag_name)],
    '*',
    '{}'::text[],
    true,
    'approved',
    'imported',
    new.canonical_tag_id,
    new.id,
    'auto-created from tag_aliases insert'
  )
  on conflict (tag_alias_id) where tag_alias_id is not null do nothing;

  return new;
end $$;

drop trigger if exists tag_alias_sync_search_synonym on public.tag_aliases;
create trigger tag_alias_sync_search_synonym
  after insert on public.tag_aliases
  for each row execute function public.sync_tag_alias_to_search_synonym();

comment on function public.sync_tag_alias_to_search_synonym() is
  'Auto-creates a search_synonyms row in status=approved when a tag_aliases row is inserted. Approved synonyms must be explicitly activated by an admin before they reach Meilisearch.';
