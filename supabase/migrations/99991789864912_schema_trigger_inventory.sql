-- 21 triggers run in production that no migration creates, and nothing could see them.
--
-- WHY THIS EXISTS. `trg_personalities_outing_guard` — the seal on the CRITICAL
-- `person_outing_guard` — was attached to prod BY HAND during the 2026-09-19 incident and
-- existed in no migration until 99991789842467 codified it. That is a CLASS, not one
-- object, and the class had no detector:
--
--   * `check-migration-drift.mjs` compares `schema_migrations` against repo FILES. It is
--     exact for "a version applied with no file" and structurally blind to "an OBJECT that
--     exists with no statement creating it".
--   * `npm test` cannot see it: vitest mocks the Supabase client wholesale.
--   * `supabase gen types` introspects the live catalog, so types agree with prod either way.
--
-- A rebuild from migrations therefore comes up silently missing every one of them, and the
-- invariants they enforce come back only if someone notices.
--
-- MEASURED 2026-09-19 over all 254 public non-internal triggers on prod, against every
-- `create trigger` statement in all 1,850 migration files on main: **21 have no creating
-- statement anywhere, and 20 of the 21 are not mentioned in the corpus at all** (the 21st,
-- `styleguide_rules_guard`, matches only because its FUNCTION shares the trigger's name).
-- They are not harmless bookkeeping:
--
--   unified_tags_recompute_is_adult_trigger   maintains `is_adult`, which gates anon exposure
--   trg_personalities_thin_not_indexable      keeps thin person pages out of the index
--   trg_venues_null_island / events / hotels  the 0,0 coordinate guard on three tables
--   trg_events_set_currency                   derives currency from country
--   trg_normalize_news_tags                   the controlled news tag vocabulary
--   trg_update_group_member_count             group member counts
--   styleguide_*_guard / _audit (6)           the control-character gate and audit trail on
--                                             the rows compiled into every LLM system prompt
--   trg_competition_*_touch_updated_at (5)    competition timestamps
--   news_articles_sanitize_author             author sanitisation
--   unified_tags_lowercase_slug_trigger       slug casing
--
-- WHAT THIS SHIPS, AND WHAT IT DELIBERATELY DOES NOT. It ships the INVENTORY — one
-- introspection RPC — so `scripts/check-schema-object-drift.mjs` can fail on the NEXT
-- hand-attached trigger. It does NOT codify the 21. Mass-writing `create trigger` for
-- objects whose history nobody has read is how you resurrect something a migration
-- deliberately dropped, and several of these predate the repo's migration history. They go
-- into a SHRINK-ONLY baseline: an entry that starts being covered is a hard FAILURE telling
-- you to delete it, so the list cannot rot into an allowlist nobody re-reads — the same
-- discipline as `KNOWN_NAME_MISMATCHES` and `KNOWN_UNPARSEABLE`.
--
-- TRIGGERS ONLY, and the narrowing is deliberate rather than lazy. Functions are the other
-- half of the class and are far noisier: `create or replace function` is the normal way to
-- edit one, so a function's presence says nothing about whether the CURRENT body came from
-- a migration, and the corpus holds ~1,400 of them. A trigger is different — it is attached
-- once, `drop trigger if exists` + `create trigger` is the only idiom in this repo, and its
-- absence from the corpus is unambiguous. Under-reaching is the correct error; the header
-- says so rather than implying the class is closed.

create or replace function public.schema_trigger_inventory()
returns table(table_name text, trigger_name text, is_enabled boolean)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select c.relname::text, t.tgname::text, t.tgenabled <> 'D'
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
  order by c.relname, t.tgname;
$$;

comment on function public.schema_trigger_inventory() is
  'CI input: every public non-internal trigger on this database, for scripts/check-schema-object-drift.mjs to compare against the create-trigger statements in supabase/migrations. Catches a trigger attached by hand, which migration-history drift checks are structurally blind to.';

-- CREATE FUNCTION already grants EXECUTE to PUBLIC, so the REVOKE is what narrows this —
-- granting to service_role alone would revoke nothing and leave it anon-callable.
revoke execute on function public.schema_trigger_inventory() from public, anon, authenticated;
grant execute on function public.schema_trigger_inventory() to service_role;

do $$
declare
  v_total int;
  v_seal  int;
begin
  select count(*) into v_total from public.schema_trigger_inventory();
  -- A probe that returns nothing reads exactly like a database with no triggers, and the
  -- whole point of this function is that absence is the thing being measured.
  if v_total < 100 then
    raise exception 'postcondition failed: schema_trigger_inventory() returned % rows (expected the full public trigger set)', v_total;
  end if;

  -- Positive control on the object this entire episode was about: if the inventory cannot
  -- see the outing seal, it cannot see the class of defect it was built for.
  select count(*) into v_seal from public.schema_trigger_inventory()
   where table_name = 'personalities' and trigger_name = 'trg_personalities_outing_guard';
  if v_seal <> 1 then
    raise exception 'postcondition failed: the outing seal is not visible in the inventory (found %)', v_seal;
  end if;

  raise notice 'schema_trigger_inventory(): % public triggers, seal visible', v_total;
end $$;
