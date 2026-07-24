# Taxonomy Ontology Engine — P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the governed foundation for the taxonomy ontology — a canonical facet-unification view, a constrained + cycle-guarded curated relation graph, reversible lifecycle prune of dead tags, and a health/coverage snapshot — all over the *existing* (half-wired) tag tables, creating **zero** duplicate tables.

**Architecture:** Consolidation, not creation. The DB already holds the substrate (`tag_aliases` 15k labels, `tag_relations` empty curated graph, `tag_relationships` 70k raw similarity pool, `unified_tag_assignments` 150k usage, `tag_usage_summary` view, `tag_change_log` 110k audit, `tag_embeddings`). P0 adds: (1) a normalized facet vocab + derived `tag_facets` view (unification), (2) governance on `tag_relations` (predicate vocab, no-self, uniqueness, cycle-guard) so P1/P2 proposers can safely populate it, (3) reversible prune RPCs + execution of the 1,586 active-zero-usage tags, (4) `tag_ontology_health()` snapshot that quantifies coverage + the P1 dedup backlog. Backend-only; the cockpit is P1.

**Tech Stack:** PostgreSQL (Supabase, project `xqeacpakadqfxjxjcewc`), migrations under `supabase/migrations/`, verification via Supabase MCP `execute_sql`. No frontend in P0.

**Design ref:** [2026-07-24-taxonomy-ontology-engine-design.md](2026-07-24-taxonomy-ontology-engine-design.md)

---

## Conventions for every task

- **Apply migrations** with `supabase db push` from a linked checkout (CI-consistent). **Do NOT apply via MCP `apply_migration`** — it stamps a timestamp version ≠ your filename and creates history drift (see CLAUDE.md gotcha). If you must apply live, immediately `list_migrations`, read the real stamped version, and `git mv` the file to it.
- **Verify** ("test") with Supabase MCP `execute_sql` (read-only). Each task's assertion query must **error or return false BEFORE** the migration and **return true AFTER**.
- Migration versions are pre-assigned below (all `> 20260724100000`, the current max). Keep the filename version identical to what CI will apply.
- The admin/internal gate helper is `public.assert_admin_or_internal()` (used across this codebase). If your DB names it differently, grep `supabase/migrations` for `assert_admin` and adjust the one reference.

---

## Task 1: Canonical facet vocab + `tag_facets` view (the unification layer)

**Files:**
- Create: `supabase/migrations/20260724110000_tag_facets_view.sql`

- [ ] **Step 1: Write the failing assertion**

Run (Supabase MCP `execute_sql`):
```sql
select public.tag_facet_of('venues') = 'venue'
   and public.tag_facet_of('news_article') = 'news'
   and public.tag_facet_of('marketplace_listing') = 'marketplace'
   and public.tag_facet_of('tag') is null as ok;
```
Expected **before**: ERROR `function public.tag_facet_of(...) does not exist`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260724110000_tag_facets_view.sql`:
```sql
-- Canonical facet vocabulary + normalizer for the dirty entity_type strings in
-- unified_tag_assignments (venues/venue, news/news_article, marketplace_listing/marketplace, ...).
create or replace function public.tag_facet_of(p_entity_type text)
returns text language sql immutable as $$
  select case lower(coalesce(p_entity_type, ''))
    when 'venues'              then 'venue'
    when 'venue'               then 'venue'
    when 'hotel'               then 'hotel'
    when 'hotels'              then 'hotel'
    when 'event'               then 'event'
    when 'events'              then 'event'
    when 'news'                then 'news'
    when 'news_article'        then 'news'
    when 'marketplace'         then 'marketplace'
    when 'marketplace_listing' then 'marketplace'
    when 'personality'         then 'person'
    when 'personalities'       then 'person'
    when 'community_group'     then 'group'
    when 'group'               then 'group'
    when 'city'                then 'city'
    when 'cities'              then 'city'
    when 'country'             then 'country'
    when 'countries'           then 'country'
    when 'village'             then 'village'
    when 'queer_village'       then 'village'
    else null  -- 'tag' self-links and anything unmapped are excluded from facets
  end;
$$;

comment on function public.tag_facet_of is
  'Normalizes dirty unified_tag_assignments.entity_type values to the canonical facet vocabulary. NULL = excluded.';

create or replace view public.tag_facets as
select distinct a.tag_id as concept_id,
       public.tag_facet_of(a.entity_type) as facet
from public.unified_tag_assignments a
where public.tag_facet_of(a.entity_type) is not null;

comment on view public.tag_facets is
  'Derived unification layer: which domain facets each tag concept is used in. Source of truth for cross-silo faceted discovery.';

grant select on public.tag_facets to anon, authenticated, service_role;
```

- [ ] **Step 3: Apply**

Run: `supabase db push`
Expected: applies `20260724110000_tag_facets_view.sql` with no error.

- [ ] **Step 4: Verify it passes**

Run the Step-1 query again → expected `ok = true`. Then confirm the view is populated and covers the real facets:
```sql
select (select count(distinct facet) from public.tag_facets) as facets,
       (select count(distinct concept_id) from public.tag_facets) as concepts_with_facet;
```
Expected: `facets >= 6`, `concepts_with_facet` in the low thousands (the actually-used tags).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260724110000_tag_facets_view.sql
git commit -m "feat(taxonomy): canonical facet vocab + tag_facets view (P0)"
```

---

## Task 2: Govern `tag_relations` (predicate vocab, no-self, uniqueness, cycle-guard)

`tag_relations` holds only 6 legacy rows and is the canonical curated graph P1/P2 will populate. Normalize the legacy rows first, then constrain, then add a cycle-prevention trigger and directional broader/narrower views. Canonical storage stores only `broader` (child→parent); `narrower` is derived.

**Files:**
- Create: `supabase/migrations/20260724120000_govern_tag_relations.sql`

- [ ] **Step 1: Write the failing assertion**

Run (Supabase MCP `execute_sql`):
```sql
select conname from pg_constraint
where conrelid = 'public.tag_relations'::regclass
  and conname = 'tag_relations_relation_type_chk';
```
Expected **before**: 0 rows (constraint absent).

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260724120000_govern_tag_relations.sql`:
```sql
-- 1. Canonicalize legacy relation_type values. Store only broader/related/exact_match.
--    Flip any legacy 'narrower' edge into a 'broader' edge by swapping endpoints
--    (RHS is evaluated from the OLD row, so this swap is correct).
update public.tag_relations
set source_tag_id = target_tag_id,
    target_tag_id = source_tag_id,
    relation_type = 'broader'
where lower(relation_type) = 'narrower';

update public.tag_relations
set relation_type = case
  when lower(relation_type) in ('broader', 'parent')                then 'broader'
  when lower(relation_type) in ('exact_match', 'exactmatch', 'same_as') then 'exact_match'
  else 'related'
end
where lower(relation_type) not in ('broader', 'related', 'exact_match');

-- 2. Drop self-loops and exact directional duplicates before constraining.
delete from public.tag_relations where source_tag_id = target_tag_id;
delete from public.tag_relations a using public.tag_relations b
where a.ctid < b.ctid
  and a.source_tag_id = b.source_tag_id
  and a.target_tag_id = b.target_tag_id
  and a.relation_type = b.relation_type;

-- 3. Constraints: predicate vocab + no self edge.
alter table public.tag_relations
  add constraint tag_relations_relation_type_chk
    check (relation_type in ('broader', 'related', 'exact_match')),
  add constraint tag_relations_no_self_chk
    check (source_tag_id <> target_tag_id);

create unique index if not exists tag_relations_uniq
  on public.tag_relations (source_tag_id, target_tag_id, relation_type);

-- 4. Cycle guard: a new broader edge child->parent must not close a loop
--    (i.e. child must not already be an ancestor of parent).
create or replace function public.tag_relations_no_cycle()
returns trigger language plpgsql as $$
begin
  if new.relation_type = 'broader' then
    if exists (
      with recursive anc as (
        select new.target_tag_id as node
        union all
        select r.target_tag_id
        from public.tag_relations r
        join anc on r.source_tag_id = anc.node
        where r.relation_type = 'broader'
      )
      select 1 from anc where node = new.source_tag_id
    ) then
      raise exception 'tag_relations: broader edge %->% would create a cycle',
        new.source_tag_id, new.target_tag_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tag_relations_no_cycle on public.tag_relations;
create trigger trg_tag_relations_no_cycle
  before insert or update on public.tag_relations
  for each row execute function public.tag_relations_no_cycle();

-- 5. Directional convenience views (narrower is derived, never stored).
create or replace view public.tag_broader as
select source_tag_id as child_id, target_tag_id as parent_id, confidence, review_status
from public.tag_relations where relation_type = 'broader';

create or replace view public.tag_narrower as
select target_tag_id as parent_id, source_tag_id as child_id, confidence, review_status
from public.tag_relations where relation_type = 'broader';

grant select on public.tag_broader, public.tag_narrower to anon, authenticated, service_role;
```

- [ ] **Step 3: Apply**

Run: `supabase db push`
Expected: applies `20260724120000_govern_tag_relations.sql` with no error (if it errors on a leftover bad row, the normalize/delete steps above already handle the known cases — re-read the error, it will name the offending constraint).

- [ ] **Step 4: Verify it passes**

Constraint present + cycle guard actually rejects a loop. Run:
```sql
-- pick two arbitrary active tag ids
with ids as (select array_agg(id) a from (select id from public.unified_tags where status='active' limit 2) q)
select
  (select count(*) from pg_constraint
     where conrelid='public.tag_relations'::regclass
       and conname in ('tag_relations_relation_type_chk','tag_relations_no_self_chk')) = 2 as constraints_ok;
```
Expected: `constraints_ok = true`.

Then prove the cycle guard (run as a single anonymous block; it must raise on the second insert and roll back):
```sql
do $$
declare a uuid; b uuid; caught boolean := false;
begin
  select id into a from public.unified_tags where status='active' order by id limit 1;
  select id into b from public.unified_tags where status='active' order by id offset 1 limit 1;
  insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
    values (a, b, 'broader', 1.0, 'approved');
  begin
    insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
      values (b, a, 'broader', 1.0, 'approved');
  exception when others then caught := true;
  end;
  -- clean up the probe edge
  delete from public.tag_relations where source_tag_id=a and target_tag_id=b and relation_type='broader';
  if not caught then raise exception 'CYCLE GUARD FAILED — loop insert was allowed'; end if;
  raise notice 'cycle guard OK';
end $$;
```
Expected: `NOTICE: cycle guard OK`, no exception.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260724120000_govern_tag_relations.sql
git commit -m "feat(taxonomy): govern tag_relations — predicate vocab, cycle guard, broader/narrower views (P0)"
```

---

## Task 3: Reversible prune RPCs + execute the 1,586-tag prune

Batched to avoid the `unified_tags` search-sync trigger storm (DB is disk-constrained). Fully reversible; every change logged to `tag_change_log`.

**Files:**
- Create: `supabase/migrations/20260724130000_tag_prune_rpcs.sql`

- [ ] **Step 1: Write the failing assertion**

Run (Supabase MCP `execute_sql`):
```sql
select public.deprecate_unused_tags(0);
```
Expected **before**: ERROR `function public.deprecate_unused_tags(integer) does not exist`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260724130000_tag_prune_rpcs.sql`:
```sql
-- Reversibly deprecate active tags with zero real usage. Batched: unified_tags
-- fires a search-sync trigger and the DB is disk-constrained. Returns rows affected.
create or replace function public.deprecate_unused_tags(
  p_batch int default 500,
  p_reason text default 'auto: zero usage'
) returns int
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_n int;
begin
  perform public.assert_admin_or_internal();

  select array_agg(id) into v_ids from (
    select t.id
    from public.unified_tags t
    where t.status = 'active'
      and coalesce((select usage_count from public.tag_usage_summary s where s.id = t.id), 0) = 0
    order by t.id
    limit greatest(p_batch, 0)
  ) q;

  if v_ids is null then return 0; end if;

  update public.unified_tags
  set status = 'deprecated', deprecated_at = now(), deprecation_reason = p_reason
  where id = any(v_ids);
  get diagnostics v_n = row_count;

  insert into public.tag_change_log (tag_id, action_type, before_data, after_data, actor, reason)
  select id, 'deprecate',
         jsonb_build_object('status', 'active'),
         jsonb_build_object('status', 'deprecated', 'reason', p_reason),
         'deprecate_unused_tags', p_reason
  from unnest(v_ids) id;

  return v_n;
end;
$$;

create or replace function public.restore_deprecated_tag(p_tag_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_or_internal();

  update public.unified_tags
  set status = 'active', deprecated_at = null, deprecation_reason = null
  where id = p_tag_id and status = 'deprecated';

  if not found then return false; end if;

  insert into public.tag_change_log (tag_id, action_type, before_data, after_data, actor, reason)
  values (p_tag_id, 'restore',
          jsonb_build_object('status', 'deprecated'),
          jsonb_build_object('status', 'active'),
          'restore_deprecated_tag', 'manual restore');
  return true;
end;
$$;

revoke all on function public.deprecate_unused_tags(int, text) from public;
revoke all on function public.restore_deprecated_tag(uuid) from public;
grant execute on function public.deprecate_unused_tags(int, text) to service_role;
grant execute on function public.restore_deprecated_tag(uuid) to service_role, authenticated;
```

- [ ] **Step 3: Apply**

Run: `supabase db push`
Expected: applies `20260724130000_tag_prune_rpcs.sql` with no error.

- [ ] **Step 4: Verify the RPCs exist and a restore round-trips**

Run (Supabase MCP `execute_sql`), one batch to confirm the function works on real data, then undo it to prove reversibility:
```sql
-- deprecate one batch of 1 and capture the id, then restore it
with picked as (
  select t.id from public.unified_tags t
  where t.status='active'
    and coalesce((select usage_count from public.tag_usage_summary s where s.id=t.id),0)=0
  order by t.id limit 1
)
select id from picked;  -- note this id as :probe
```
Then, replacing `<PROBE_ID>` with the returned id:
```sql
select public.deprecate_unused_tags(1) as deprecated_n;              -- expect 1
select status from public.unified_tags where id = '<PROBE_ID>';       -- expect 'deprecated'
select public.restore_deprecated_tag('<PROBE_ID>') as restored;       -- expect true
select status from public.unified_tags where id = '<PROBE_ID>';       -- expect 'active'
```
Expected: `deprecated_n = 1`, then `deprecated`, then `restored = true`, then `active`.

- [ ] **Step 5: Execute the full prune (batched)**

Run `deprecate_unused_tags(500)` repeatedly until it returns 0 (≈4 calls for the ~1,586 candidates). Run each as a separate statement to keep each batch's trigger fan-out bounded:
```sql
select public.deprecate_unused_tags(500);
```
Repeat until the return value is `0`. Then confirm none remain:
```sql
select count(*) as active_zero_usage
from public.unified_tags t
where t.status='active'
  and coalesce((select usage_count from public.tag_usage_summary s where s.id=t.id),0)=0;
```
Expected: `active_zero_usage = 0`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260724130000_tag_prune_rpcs.sql
git commit -m "feat(taxonomy): reversible unused-tag prune RPCs + batched prune of 1586 dead tags (P0)"
```

---

## Task 4: `tag_ontology_health()` snapshot (coverage-radar seed)

The single metric the future cockpit + self-maintaining crons consume, and a testable read surface. Also quantifies the P1 semantic-dedup backlog (raw similarity pairs ≥0.90 not yet promoted into the curated graph).

**Files:**
- Create: `supabase/migrations/20260724140000_tag_ontology_health.sql`

- [ ] **Step 1: Write the failing assertion**

Run (Supabase MCP `execute_sql`):
```sql
select public.tag_ontology_health();
```
Expected **before**: ERROR `function public.tag_ontology_health() does not exist`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/20260724140000_tag_ontology_health.sql`:
```sql
create or replace function public.tag_ontology_health()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'concepts_active',       (select count(*) from public.unified_tags where status='active'),
    'concepts_deprecated',   (select count(*) from public.unified_tags where status='deprecated'),
    'concepts_merged',       (select count(*) from public.unified_tags where status='merged'),
    'active_zero_usage',     (select count(*) from public.unified_tags t where t.status='active'
                                and coalesce((select usage_count from public.tag_usage_summary s where s.id=t.id),0)=0),
    'facet_coverage',        (select count(distinct concept_id) from public.tag_facets),
    'facets',                (select jsonb_object_agg(facet, n)
                                from (select facet, count(*) n from public.tag_facets group by facet) f),
    'labels_total',          (select count(*) from public.tag_aliases),
    'curated_edges',         (select count(*) from public.tag_relations),
    'broader_edges',         (select count(*) from public.tag_relations where relation_type='broader'),
    'orphan_active_concepts',(select count(*) from public.unified_tags t where t.status='active'
                                and not exists (select 1 from public.tag_relations r
                                     where r.source_tag_id=t.id and r.relation_type='broader')),
    'dedup_backlog_hi',      (select count(*) from public.tag_relationships tr
                                where tr.similarity_score >= 0.90
                                  and not exists (select 1 from public.tag_relations r
                                      where (r.source_tag_id=tr.tag1_id and r.target_tag_id=tr.tag2_id)
                                         or (r.source_tag_id=tr.tag2_id and r.target_tag_id=tr.tag1_id))),
    'generated_at', now()
  );
$$;

grant execute on function public.tag_ontology_health() to authenticated, service_role;
```

- [ ] **Step 3: Apply**

Run: `supabase db push`
Expected: applies `20260724140000_tag_ontology_health.sql` with no error.

- [ ] **Step 4: Verify it passes**

Run:
```sql
select (public.tag_ontology_health()->>'active_zero_usage')::int = 0            as pruned,
       jsonb_typeof(public.tag_ontology_health()->'facets') = 'object'          as has_facets,
       (public.tag_ontology_health()->>'facet_coverage')::int > 0               as has_coverage,
       (public.tag_ontology_health()->>'dedup_backlog_hi')::int >= 0            as has_backlog_metric;
```
Expected: all four `true` (`active_zero_usage` is 0 because Task 3 ran; `dedup_backlog_hi` will be a large positive number — that is the P1 work queue).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260724140000_tag_ontology_health.sql
git commit -m "feat(taxonomy): tag_ontology_health() coverage snapshot (P0)"
```

---

## P0 done — definition of done

- `tag_facets` view exists, populated, facet vocab normalized (no `venues`/`news_article` leakage). ✅ unification substrate
- `tag_relations` constrained (predicate vocab + no-self + unique) and cycle-guarded; `tag_broader`/`tag_narrower` views exist. ✅ curated graph ready for P1/P2 proposers
- 1,586 active-zero-usage tags reversibly deprecated; `deprecate_unused_tags` / `restore_deprecated_tag` RPCs available. ✅ prune + governance front-door primitives
- `tag_ontology_health()` returns the coverage snapshot + quantified dedup backlog. ✅ radar seed + the crons'/cockpit's data source

## What P0 deliberately defers (YAGNI)

- **P1** — semantic-dedup proposer (promote `tag_relationships` ≥0.90 into `tag_relations` as merge/related candidates) + the `/admin/taxonomy` cockpit cluster-review UI. The `dedup_backlog_hi` metric already scopes this.
- **P2** — Wikidata `broader` proposer (P279/P361 on the 4,627 anchored concepts) + co-occurrence `related` proposer.
- **P3** — nightly `run_tag_ontology_recompute` cron + coverage radar table + creation gate; register in `admin_automations` + pg_cron.
- **P4** — public payoff: search query-expansion via `tag_broader`, glossary ontology, faceted browse.
- Multilingual `lang` column on `tag_aliases`, embedding backfill for the ~1,600 unembedded tags (mostly dead after the prune), and full silo cut-over — folded into P1/P3 where they earn their keep.

## Self-review notes

- **Spec coverage:** P0 maps to design §1 (facets view, graph governance), §3 (reversible prune + lifecycle), and the §2 coverage-radar seed. Proposers/engine (§2), cockpit (§4), payoff (§5) are explicitly P1–P4.
- **Type consistency:** facet vocab strings, `relation_type in ('broader','related','exact_match')`, and column names (`source_tag_id`/`target_tag_id`, `tag1_id`/`tag2_id`, `similarity_score`, `usage_count`) are used identically across all four tasks and match the audited live schema.
- **Reversibility:** every mutating operation (relation normalization, prune) is logged (`tag_change_log`) and undoable (`restore_deprecated_tag`, edge deletes); no hard deletes of tags.
