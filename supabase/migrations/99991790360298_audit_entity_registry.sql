-- Audit entity registry — the resolver between three naming systems, plus the
-- indexes the item-level timeline needs.
--
-- WHY A REGISTRY AND NOT A CASE STATEMENT. The same entity is called three
-- different things depending on which table you ask:
--   entity_review_queue.entity_type   singular  'venue'
--   content_versioned_tables.table_name plural  'venues'
--   entity_merge_audit.entity_type    singular, and only for SOME types
-- There is no resolver anywhere in this repo — grep returns nothing. Every
-- caller that has needed one so far has hand-written a CASE, which is how the
-- three drifted in the first place. This is that resolver, once.
--
-- WHY NOT OVERLOAD content_versioned_tables. That table is the revision
-- trigger's kill switch: flipping `enabled` stops recording. It is drift-tested
-- against src/config/contentTypes and knows nothing about singular keys,
-- provenance shapes or quality-signal tables. Adding audit columns to it would
-- couple the inspector's vocabulary to the trigger's contract, so that turning
-- off revisions for one table would silently change what the inspector can
-- show. Separate table, FK'd to it so the two cannot name different tables.
--
-- THE ASYMMETRY IS DECLARED AS DATA, BECAUSE IT IS REAL AND PERMANENT.
-- Measured on prod 2026-09-25, `field_provenance` exists on cities, countries,
-- events, milestones, organizations, personalities, queer_villages (+ the two
-- geo_*_profiles mirrors) and DOES NOT exist on venues, hotels or
-- news_articles. Venue provenance is relational instead
-- (venue_field_provenance, one row per venue+field+source). A generic reader
-- that does `to_jsonb(t)->'field_provenance'` returns NULL for a venue and
-- makes every venue timeline look provenance-clean — the single most dangerous
-- silent failure available in this design. `provenance_mode` is what stops it,
-- and the deploy-time assertion below is what stops the registry drifting away
-- from the catalog later.
--
-- NOTE ON A NUMBER THIS FILE DOES NOT REPEAT. Earlier planning quoted
-- ingestion_staging at 313,844 rows, from migration 20260802143509. Measured
-- today it is 163,535 rows / 1820 MB. The older figure was true when written
-- and is not now. Re-measure before sizing anything on it, including this
-- sentence.

-- ---------------------------------------------------------------------------
-- 1. The registry.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_entity_registry (
  -- What entity_audit_timeline() accepts. Deliberately equal to table_name:
  -- one of the three vocabularies has to win, and the plural table name is the
  -- one that is already unambiguous and already FK-enforced.
  entity_key       text primary key,
  table_name       text not null unique
                   references public.content_versioned_tables(table_name),
  -- entity_review_queue.entity_type. NULL = this type has no review coverage,
  -- which is a fact about the corpus, not a gap in this row.
  review_key       text,
  -- entity_merge_audit.entity_type. NULL = merges for this type live in a
  -- dedicated audit table (venues, cities) or the type does not merge.
  merge_key        text,
  -- Which merge audit table to read. Three exist and they are not unified.
  merge_table      text not null default 'entity_merge_audit'
                   check (merge_table in ('entity_merge_audit', 'venue_merge_audit', 'city_merge_audit', 'none')),
  provenance_mode  text not null
                   check (provenance_mode in ('jsonb_column', 'side_table', 'none')),
  enrichment_mode  text not null
                   check (enrichment_mode in ('jsonb_column', 'none')),
  -- Which *_quality_signals table, if any. Seven exist; five types have none.
  signals_table    text,
  -- Which *_consensus_audit table, if any. Only venues and cities have one.
  consensus_table  text,
  active           boolean not null default true,
  note             text
);

comment on table public.audit_entity_registry is
  'Resolves an entity type across the three naming systems in this schema (plural table_name, singular review/merge keys) and declares which provenance shape it uses. Read by entity_audit_timeline(). The deploy-time assertion in 99991790360298 binds every declared column to the live catalog.';
comment on column public.audit_entity_registry.provenance_mode is
  'jsonb_column = a field_provenance column on the entity table. side_table = venue_field_provenance. none = this type records no per-field source. Venues are side_table; assuming jsonb for them returns NULL and reads as clean.';

alter table public.audit_entity_registry enable row level security;

drop policy if exists audit_entity_registry_read on public.audit_entity_registry;
create policy audit_entity_registry_read on public.audit_entity_registry
  for select using (public.has_any_role_jwt(array['admin'::app_role, 'moderator'::app_role]));

drop policy if exists audit_entity_registry_write on public.audit_entity_registry;
create policy audit_entity_registry_write on public.audit_entity_registry
  for all using (public.has_any_role_jwt(array['admin'::app_role]))
  with check (public.has_any_role_jwt(array['admin'::app_role]));

revoke all on public.audit_entity_registry from anon;
grant select on public.audit_entity_registry to authenticated;
grant select, insert, update, delete on public.audit_entity_registry to service_role;

-- Seed. Every column below was verified against the live catalog on
-- 2026-09-25; the assertion at the foot of this file re-verifies it at deploy
-- time and on every future replay.
insert into public.audit_entity_registry
  (entity_key, table_name, review_key, merge_key, merge_table,
   provenance_mode, enrichment_mode, signals_table, consensus_table, note)
values
  ('venues', 'venues', 'venue', null, 'venue_merge_audit',
   'side_table', 'jsonb_column', 'venue_quality_signals', 'venue_consensus_audit',
   'No field_provenance column. Per-field sources are relational in venue_field_provenance, one row per venue+field+source, which is the richest provenance in the schema.'),
  ('cities', 'cities', 'city', null, 'city_merge_audit',
   'jsonb_column', 'jsonb_column', 'city_quality_signals', 'city_consensus_audit', null),
  ('events', 'events', null, 'event', 'entity_merge_audit',
   'jsonb_column', 'jsonb_column', 'event_quality_signals', null,
   'review_key is null because review_field_registry covers only five entity types (city, marketplace, personality, venue, village). Events have a quality-signal ledger and no field-level review queue.'),
  ('personalities', 'personalities', 'personality', 'personality', 'entity_merge_audit',
   'jsonb_column', 'jsonb_column', 'personality_quality_signals', null,
   'Identity errors here are an outing risk, which is why the review queue for this type never auto-merges on a name alone.'),
  ('queer_villages', 'queer_villages', 'village', 'queer_village', 'entity_merge_audit',
   'jsonb_column', 'jsonb_column', 'village_quality_signals', null, null),
  ('milestones', 'milestones', null, 'milestone', 'entity_merge_audit',
   'jsonb_column', 'none', 'milestone_quality_signals', null,
   'The one type with field_provenance and NO enrichment_status — the two columns do not travel together and must be declared separately. No review_field_registry coverage; see the events note.'),
  ('marketplace_listings', 'marketplace_listings', 'marketplace', 'marketplace', 'entity_merge_audit',
   'none', 'none', null, null,
   'The fifth review type. Carries neither field_provenance nor enrichment_status, so its timeline is revisions + review + merge only — which the gap rows state rather than leaving as empty sections.'),
  ('organizations', 'organizations', null, 'organization', 'entity_merge_audit',
   'jsonb_column', 'jsonb_column', null, null,
   'Org link review is decided on its own console, not through entity_review_queue, so review_key is genuinely null rather than unfilled.'),
  ('countries', 'countries', null, 'country', 'entity_merge_audit',
   'jsonb_column', 'jsonb_column', null, null,
   'Carries field_provenance — earlier planning omitted it from the jsonb list; measured on prod it is there. This is why the assertion below tests the inverse direction too.'),
  ('news_articles', 'news_articles', null, 'news', 'entity_merge_audit',
   'none', 'jsonb_column', 'news_quality_signals', null,
   'No field_provenance column at all, so the timeline emits audit:no_provenance_surface for this type rather than an empty section.'),
  ('hotels', 'hotels', null, 'hotel', 'entity_merge_audit',
   'none', 'jsonb_column', null, null,
   'enrichment_status but no field_provenance.')
on conflict (entity_key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Indexes the timeline needs.
--
-- ingestion_staging: measured on prod before and after. A non-news lookup by
-- target_record_id was a Parallel Seq Scan over the whole 1820 MB table —
-- 79,153 blocks, 143 ms — because the only index was PARTIAL on
-- target_table = 'news_articles'. With this index: 3 blocks, 0.13 ms. The
-- index itself is 5.7 MB. It was built CONCURRENTLY on prod out of band (the
-- 20260802143509 convention), so this statement is a no-op there and exists so
-- that CI, a local stack and any rebuild get it too.
--
-- The three merge audits: "what was merged INTO this record" had NO index on
-- any of them — only *_drop_idx, the other direction. All three tables are
-- small (7,579 / 2,214 / 398 rows, ≤5.6 MB), so a plain CREATE INDEX is
-- cheaper than the ceremony of a concurrent build.
-- ---------------------------------------------------------------------------
create index if not exists ingestion_staging_target_record_idx
  on public.ingestion_staging (target_record_id, target_table, created_at desc)
  where target_record_id is not null;

create index if not exists entity_merge_audit_keep_idx
  on public.entity_merge_audit (entity_type, keep_id);
create index if not exists venue_merge_audit_keep_idx
  on public.venue_merge_audit (keep_id);
create index if not exists city_merge_audit_keep_idx
  on public.city_merge_audit (keep_id);

-- ---------------------------------------------------------------------------
-- 3. Provenance / enrichment readers.
--
-- Static branches, not dynamic SQL. `format(%I)` would be shorter and would
-- cost greppability plus an injection surface on a function the admin console
-- calls with a user-supplied type string.
--
-- THEY RAISE ON AN UNKNOWN TABLE AND MUST KEEP DOING SO. Returning NULL for a
-- table this function does not know is the venues-look-clean failure wearing a
-- helper's clothes: the caller cannot tell "this record has no provenance"
-- from "I was never taught to read this table".
-- ---------------------------------------------------------------------------
create or replace function public.field_provenance_of(p_table text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare v jsonb;
begin
  case p_table
    when 'cities'         then select field_provenance into v from public.cities where id = p_id;
    when 'countries'      then select field_provenance into v from public.countries where id = p_id;
    when 'events'         then select field_provenance into v from public.events where id = p_id;
    when 'personalities'  then select field_provenance into v from public.personalities where id = p_id;
    when 'queer_villages' then select field_provenance into v from public.queer_villages where id = p_id;
    when 'milestones'     then select field_provenance into v from public.milestones where id = p_id;
    when 'organizations'  then select field_provenance into v from public.organizations where id = p_id;
    -- venues / hotels / news_articles deliberately absent: they have no such
    -- column, and the registry says so via provenance_mode. Reaching here for
    -- one of them is a caller bug, and it must be loud.
    else raise exception 'field_provenance_of: % has no field_provenance column', p_table
           using errcode = '22023';
  end case;
  return coalesce(v, '{}'::jsonb);
end $$;

create or replace function public.enrichment_status_of(p_table text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare v jsonb;
begin
  case p_table
    when 'venues'         then select enrichment_status into v from public.venues where id = p_id;
    when 'cities'         then select enrichment_status into v from public.cities where id = p_id;
    when 'countries'      then select enrichment_status into v from public.countries where id = p_id;
    when 'events'         then select enrichment_status into v from public.events where id = p_id;
    when 'personalities'  then select enrichment_status into v from public.personalities where id = p_id;
    when 'queer_villages' then select enrichment_status into v from public.queer_villages where id = p_id;
    -- `milestones` is deliberately NOT here. It carries field_provenance but no
    -- enrichment_status, so a branch for it would not compile. The registry
    -- says enrichment_mode='none' for it and the assertion binds the two.
    when 'organizations'  then select enrichment_status into v from public.organizations where id = p_id;
    when 'hotels'         then select enrichment_status into v from public.hotels where id = p_id;
    when 'news_articles'  then select enrichment_status into v from public.news_articles where id = p_id;
    else raise exception 'enrichment_status_of: % has no enrichment_status column', p_table
           using errcode = '22023';
  end case;
  return coalesce(v, '{}'::jsonb);
end $$;

revoke all on function public.field_provenance_of(text, uuid) from public, anon;
revoke all on function public.enrichment_status_of(text, uuid) from public, anon;
grant execute on function public.field_provenance_of(text, uuid) to service_role;
grant execute on function public.enrichment_status_of(text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Postconditions. Without these the registry is decoration: a row could
--    claim a column that does not exist and nothing would say so until an
--    editor opened a record and saw an empty timeline.
-- ---------------------------------------------------------------------------
do $verify$
declare
  r        record;
  v_rows   int;
  v_anon   boolean;
  v_idx    text;
begin
  select count(*) into v_rows from public.audit_entity_registry where active;
  if v_rows < 11 then
    raise exception 'audit_entity_registry has % active rows, expected at least 11', v_rows;
  end if;

  -- THE MIRROR DIRECTION, and it is not hypothetical: the first draft of this
  -- seed claimed review coverage for events, milestones, organizations and
  -- countries (none of which have any) and omitted marketplace (which does).
  -- The forward check below caught the four false claims. Only this one
  -- catches the omission — a review type with no registry row renders no
  -- review section at all, which looks exactly like a record nobody has ever
  -- proposed a change to.
  select string_agg(distinct rfr.entity_type, ', ' order by rfr.entity_type)
    into v_idx
    from public.review_field_registry rfr
   where rfr.active
     and not exists (
       select 1 from public.audit_entity_registry aer
        where aer.active and aer.review_key = rfr.entity_type);
  if v_idx is not null then
    raise exception 'review_field_registry covers % but no audit_entity_registry row claims it', v_idx;
  end if;

  for r in select * from public.audit_entity_registry where active loop
    -- Declared jsonb provenance must actually exist as a column.
    if r.provenance_mode = 'jsonb_column' and not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = r.table_name
         and column_name = 'field_provenance')
    then
      raise exception '% declares jsonb provenance but % has no field_provenance column',
        r.entity_key, r.table_name;
    end if;

    -- And the inverse, which is the direction that actually bit: a row that
    -- says 'none' or 'side_table' while the column IS there means the
    -- timeline is silently skipping real provenance.
    if r.provenance_mode <> 'jsonb_column' and exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = r.table_name
         and column_name = 'field_provenance')
    then
      raise exception '% declares provenance_mode=% but % DOES have a field_provenance column',
        r.entity_key, r.provenance_mode, r.table_name;
    end if;

    if r.enrichment_mode = 'jsonb_column' and not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = r.table_name
         and column_name = 'enrichment_status')
    then
      raise exception '% declares jsonb enrichment but % has no enrichment_status column',
        r.entity_key, r.table_name;
    end if;

    -- Inverse, same reasoning as for provenance. This one caught `milestones`,
    -- which carries field_provenance and NOT enrichment_status — the two
    -- columns do not travel together, and assuming they do would have made the
    -- helper below read a column that does not exist.
    if r.enrichment_mode = 'none' and exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = r.table_name
         and column_name = 'enrichment_status')
    then
      raise exception '% declares enrichment_mode=none but % DOES have an enrichment_status column',
        r.entity_key, r.table_name;
    end if;

    if r.review_key is not null and not exists (
      select 1 from public.review_field_registry where entity_type = r.review_key)
    then
      raise exception '% review_key % is unknown to review_field_registry',
        r.entity_key, r.review_key;
    end if;

    if r.signals_table is not null and to_regclass('public.' || r.signals_table) is null then
      raise exception '% names signals table % which does not exist', r.entity_key, r.signals_table;
    end if;

    if r.consensus_table is not null and to_regclass('public.' || r.consensus_table) is null then
      raise exception '% names consensus table % which does not exist', r.entity_key, r.consensus_table;
    end if;

    if r.merge_table <> 'none' and to_regclass('public.' || r.merge_table) is null then
      raise exception '% names merge table % which does not exist', r.entity_key, r.merge_table;
    end if;
  end loop;

  -- The indexes are the difference between 3 blocks and 79,153. A CONCURRENTLY
  -- build that failed leaves an INVALID index the planner ignores, which looks
  -- exactly like success if you only check that the name exists.
  if not exists (
    select 1 from pg_index i
     where i.indexrelid = to_regclass('public.ingestion_staging_target_record_idx')
       and i.indisvalid)
  then
    raise exception 'ingestion_staging_target_record_idx is missing or INVALID';
  end if;

  foreach v_idx in array array['entity_merge_audit_keep_idx',
                               'venue_merge_audit_keep_idx',
                               'city_merge_audit_keep_idx'] loop
    if to_regclass('public.' || v_idx) is null then
      raise exception 'merge keep index % is missing', v_idx;
    end if;
  end loop;

  select has_table_privilege('anon', 'public.audit_entity_registry', 'SELECT') into v_anon;
  if v_anon then
    raise exception 'audit_entity_registry is readable by anon';
  end if;

  raise notice 'audit_entity_registry: % active rows, catalog agrees, indexes valid', v_rows;
end $verify$;
