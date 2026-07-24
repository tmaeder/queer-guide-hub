# Taxonomy Ontology Engine — P2 Implementation Plan (build the graph)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Populate the governed but empty `tag_relations` DAG. Two proposers: (1) **pure-SQL co-occurrence** → `related` edges (self-contained, ships first); (2) **Wikidata P279** → `broader` hierarchy edges (circuit-broken edge fn). Both auto-apply conservatively, are reversible, and feed the P4 public payoff (search query-expansion, glossary "related concepts", faceted browse).

**Branch:** continue on `taxonomy-ontology-p0`.

## Grounded facts (verified 2026-07-24)
- `tag_relations`: **0 rows**. Columns `id, source_tag_id, target_tag_id, relation_type, confidence, review_status`. NOT on `unified_tags` → bulk inserts fire **no** search-sync trigger (safe to write in bulk).
- **TRAP — two overlapping `relation_type` CHECKs coexist** (`_check` allows `related,broader,narrower,similar,distinct_from`; `_chk` allows `broader,related,exact_match`). Both are ANDed → the only insertable predicates are **`related`** and **`broader`**. `narrower` is a derived VIEW (P0), never stored. Do not attempt `exact_match`/`narrower`/`similar` inserts — they violate one of the two CHECKs.
- `review_status ∈ {auto, approved, rejected}` (CHECK). Auto-applied edges use `'auto'`.
- UNIQUE `(source_tag_id, target_tag_id, relation_type)`. FKs ON DELETE CASCADE.
- Cycle guard `trg_tag_relations_no_cycle` fires **only for `broader`** (recursive ancestor walk). `related` is exempt.
- `unified_tag_assignments`: **150,960** rows over **43,265** distinct entities; UNIQUE `(tag_id, entity_id, entity_type)`. Co-occurrence must join on `entity_id AND entity_type`.
- Active tags: 3,552; **2,161** have `wikidata_id`.
- Raw co-occurrence pairs sharing ≥5 entities: 13,122 (needs lift/Jaccard to denoise — popular tags co-occur with everything).
- Conventions: apply via `supabase db push`; NEVER MCP `apply_migration`; verify via MCP `execute_sql` (project `xqeacpakadqfxjxjcewc`). Keep assigned versions; on duplicate-version error bump to next free `*0000` slot and report. Register any cron in `admin_automations` + `pg_cron` (mirror an existing pure-SQL job like `run_city_completeness_recompute`).

---

## Task 1: Co-occurrence `related` proposer (pure SQL) — SHIPS FIRST

**File:** create `supabase/migrations/20260724240000_tag_cooccurrence_relations.sql`

Approach: **Jaccard similarity** as confidence (bounded [0,1], robust): `J(A,B) = C(A,B) / (N(A) + N(B) − C(A,B))` where `C` = entities tagged with both, `N` = entities per tag. Gate on minimum support (`C ≥ p_min_support`) to kill small-sample noise, a Jaccard floor, and a **top-K per tag** cap so a hub tag doesn't emit hundreds of edges. Store ONE canonical row per unordered pair (`source = least(id)`, `target = greatest(id)`); `related` is symmetric, queried on both columns. Idempotent: delete prior `relation_type='related' AND review_status='auto'` rows, recompute, re-insert (never touches human-`approved`/`rejected` related edges).

- [ ] **Step 1 — failing assertion** (execute_sql): `select to_regprocedure('public.run_tag_cooccurrence_relations(integer,numeric,integer)');` → null.

- [ ] **Step 2 — write the migration EXACTLY:**
```sql
-- Co-occurrence `related` edges: tags that co-tag the same entities well above chance.
-- Jaccard as confidence; support floor + top-K per tag denoise the hub tags.
-- Idempotent over auto rows only (human decisions preserved). related is symmetric →
-- one canonical row per unordered pair. Not on unified_tags → no search-sync storm.
create or replace function public.run_tag_cooccurrence_relations(
  p_min_support int default 6,
  p_min_jaccard numeric default 0.18,
  p_top_k int default 12
) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform public.assert_admin_or_internal();

  -- per-tag entity counts (active tags only)
  create temp table _n on commit drop as
    select a.tag_id, count(distinct (a.entity_id, a.entity_type)) as n
    from public.unified_tag_assignments a
    join public.unified_tags t on t.id = a.tag_id and t.status = 'active'
    group by a.tag_id;

  -- co-occurrence counts for candidate pairs (canonical order id-asc), with Jaccard
  create temp table _pairs on commit drop as
    with co as (
      select a.tag_id as t1, b.tag_id as t2, count(distinct (a.entity_id, a.entity_type)) as c
      from public.unified_tag_assignments a
      join public.unified_tag_assignments b
        on a.entity_id = b.entity_id and a.entity_type = b.entity_type and a.tag_id < b.tag_id
      join public.unified_tags ta on ta.id = a.tag_id and ta.status='active'
      join public.unified_tags tb on tb.id = b.tag_id and tb.status='active'
      group by a.tag_id, b.tag_id
      having count(distinct (a.entity_id, a.entity_type)) >= p_min_support
    )
    select co.t1, co.t2, co.c,
           round((co.c::numeric) / (n1.n + n2.n - co.c), 4) as jaccard
    from co
    join _n n1 on n1.tag_id = co.t1
    join _n n2 on n2.tag_id = co.t2
    where (co.c::numeric) / (n1.n + n2.n - co.c) >= p_min_jaccard
      -- not already a hierarchy edge or a do-not-relate exclusion
      and not exists (
        select 1 from public.tag_relations r
        where r.relation_type = 'broader'
          and ((r.source_tag_id=co.t1 and r.target_tag_id=co.t2)
            or (r.source_tag_id=co.t2 and r.target_tag_id=co.t1)))
      and not exists (
        select 1 from public.tag_relationship_exclusions e
        where e.tag1_id = least(co.t1,co.t2) and e.tag2_id = greatest(co.t1,co.t2));

  -- top-K per tag (each pair counts toward BOTH endpoints' budgets)
  create temp table _kept on commit drop as
    with ranked as (
      select p.*, row_number() over (partition by t1 order by jaccard desc) rk1,
                  row_number() over (partition by t2 order by jaccard desc) rk2
      from _pairs p
    )
    select distinct t1, t2, c, jaccard from ranked
    where rk1 <= p_top_k or rk2 <= p_top_k;

  -- rewrite auto related edges only
  delete from public.tag_relations where relation_type='related' and review_status='auto';
  insert into public.tag_relations (source_tag_id, target_tag_id, relation_type, confidence, review_status)
  select t1, t2, 'related', jaccard, 'auto' from _kept
  on conflict (source_tag_id, target_tag_id, relation_type) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.run_tag_cooccurrence_relations(int,numeric,int) from public;
grant execute on function public.run_tag_cooccurrence_relations(int,numeric,int) to service_role;

-- nightly recompute (pure SQL, cheap). Register in admin_automations + pg_cron.
-- admin_automations real shape: slug/name, NOT-NULL jsonb trigger+action, managed_by='system'.
insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('tag_cooccurrence_relations','Tag co-occurrence relations',
        'Rebuilds auto `related` edges in tag_relations from tag co-occurrence (Jaccard).',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"rpc","fn":"run_tag_cooccurrence_relations"}'::jsonb, '40 4 * * *')
on conflict (slug) do update set schedule=excluded.schedule, enabled=excluded.enabled,
  description=excluded.description, name=excluded.name, action=excluded.action, trigger=excluded.trigger;

select cron.schedule('tag_cooccurrence_relations','40 4 * * *',
  $cron$ select public.run_tag_cooccurrence_relations(); $cron$);
```
> `admin_automations` shape confirmed (mirrors `city_completeness_recompute`): `on conflict (slug)`. If `cron.schedule` errors on a duplicate jobname, `select cron.unschedule('tag_cooccurrence_relations');` first. Keep the function body verbatim.

- [ ] **Step 3 — apply:** `supabase db push`.

- [ ] **Step 4 — execute + verify** (execute_sql):
```sql
select public.run_tag_cooccurrence_relations() as edges;            -- a few hundred–low-thousands
select count(*) total, round(avg(confidence),3) avg_conf, min(confidence) minc
  from tag_relations where relation_type='related';
-- spot-check top edges read sensibly (should be genuinely-related concepts, not noise)
select c.slug s1, d.slug s2, r.confidence
  from tag_relations r join unified_tags c on c.id=r.source_tag_id
  join unified_tags d on d.id=r.target_tag_id
  where r.relation_type='related' order by r.confidence desc limit 25;
-- idempotency: second run yields same count, no growth
select public.run_tag_cooccurrence_relations() as edges_second;
select count(*) from tag_relations where relation_type='related';
-- cron registered
select jobname, schedule from cron.job where jobname='tag_cooccurrence_relations';
```
Confirm: reasonable edge count; `min(confidence) >= 0.18`; the top-25 slug pairs are semantically plausible (eyeball — e.g. gay-bar/nightclub, hiking/nature); second run identical count (idempotent); cron present. **Report the top-25 list in your result so the coordinator can sanity-check precision.**

- [ ] **Step 5 — commit:**
```bash
git add supabase/migrations/20260724240000_tag_cooccurrence_relations.sql
git commit -m "feat(taxonomy): pure-SQL co-occurrence related-edge proposer + nightly cron (P2 Task 1)"
```

---

## Task 2: Wikidata P279/P361 `broader` proposer (edge fn) — SECOND

**Files:** create `supabase/functions/pipeline-tag-wikidata-hierarchy/index.ts`; add its `config.toml` entry; create `supabase/migrations/20260724250000_tag_wikidata_hierarchy.sql` (cron + admin_automation only).

Grounded facts: `unified_tags.wikidata_id` is a bare QID (`Q661717`). 2,161 active anchored tags. Reusable: `claimQids(entity, prop)` in `supabase/functions/_shared/wikidata-resolve.ts` extracts a claim's target QIDs; `wbgetentities?ids=Q1|Q2|...&props=claims&format=json` (Wikidata API) fetches up to 50 entities per call. Mirror the **gate** from `tag-enrichment-sweep` and the **circuit breaker** (`withCircuitBreaker`/`CircuitOpenError` from `_shared/circuit-breaker.ts`) + timeout-fetch from `city-factual-backfill`.

### Task 2a: the edge function

- [ ] **Step 1 — write `supabase/functions/pipeline-tag-wikidata-hierarchy/index.ts`.** Algorithm:
  1. **Gate (verbatim from tag-enrichment-sweep):** `if (!hasValidWebhookSecret(req, 'TAG_ENRICHMENT_WEBHOOK_SECRET','WEBHOOK_SECRET')) { const gate = await requireInternalOrAdmin(req, supabase); if (gate instanceof Response) return gate }`. CORS + service client as in that file.
  2. **Load the anchor map** once: `select id, wikidata_id from unified_tags where status='active' and wikidata_id is not null`. Build `Map<QID, tag_id>`. **Ambiguity guard:** if a QID maps to >1 tag_id, mark it ambiguous and NEVER use it as a parent (drop from the usable map).
  3. **Batch of children:** body `{ batch_size?=2200, tag_ids? }`. Default = all anchored active tags (2,161 fits one invocation: ~44 API calls). Chunk their QIDs into groups of 50.
  4. For each chunk: `withCircuitBreaker('wikidata.tag-hierarchy', () => fetchJson('https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+chunk.join('|')+'&props=claims&format=json', { 'User-Agent': UA }))` (UA like the city fn). On `CircuitOpenError` → stop, return partial counts.
  5. For each returned entity (keyed by childQID): `parents = [...claimQids(entity,'P279'), ...claimQids(entity,'P361')]`. For each parentQID present in the usable map and mapping to a **different** tag_id than the child → candidate `broader` edge **child→parent** (`source_tag_id=childTagId, target_tag_id=parentTagId`). Tag confidence 0.95 for a P279 parent, 0.85 for P361-only.
  6. **Insert per-edge with try/catch** (the cycle guard RAISES on a loop — catch, count as `skipped_cycle`, continue): `insert into tag_relations (source_tag_id,target_tag_id,relation_type,confidence,review_status) values (child,parent,'broader',conf,'auto') on conflict (source_tag_id,target_tag_id,relation_type) do nothing`. Do inserts through the service client; batch-collect candidates then insert, OR insert one-by-one — one-by-one is fine at this volume and lets you isolate cycle raises. (Alternatively insert in a small RPC that loops with a per-row exception handler; either is acceptable.)
  7. Return `jsonResponse({ processed, candidates, edges_inserted, skipped_cycle, ambiguous_parents, api_errors })`.
- [ ] **Step 2 — `supabase/config.toml`:** add `[functions.pipeline-tag-wikidata-hierarchy]\nverify_jwt = false`.
- [ ] **Step 3 — deploy:** `supabase functions deploy pipeline-tag-wikidata-hierarchy`.
- [ ] **Step 4 — manual first run** via MCP `execute_sql` (triggers the deployed fn through the real webhook path; `WEBHOOK_SECRET` exists in vault):
```sql
select net.http_post(
  url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-tag-wikidata-hierarchy',
  headers := jsonb_build_object('Content-Type','application/json',
    'X-Webhook-Secret', (select decrypted_secret from vault.decrypted_secrets where name='WEBHOOK_SECRET')),
  body := '{"batch_size":2200}'::jsonb
) as request_id;
```
  Wait ~30-60s (poll), then read the fn logs to get the returned counts (or re-query the DB). If the run 401s, the fn likely lacks `WEBHOOK_SECRET` in its env — in that case add a `hasInternalSecret` path is already covered by `requireInternalOrAdmin`; try triggering with the internal-secret header instead, or report NEEDS_CONTEXT with the log line.
- [ ] **Step 5 — verify** (execute_sql):
```sql
select count(*) broader_edges, round(avg(confidence),3) avg_conf from tag_relations where relation_type='broader';
-- eyeball: child → parent must read as genuine hypernymy (bar → drinking establishment, etc.)
select c.slug child, d.slug parent, r.confidence
  from tag_relations r join unified_tags c on c.id=r.source_tag_id
  join unified_tags d on d.id=r.target_tag_id
  where r.relation_type='broader' order by r.confidence desc, child limit 30;
-- no cycles slipped through (broader must be a DAG): this should return 0
with recursive up as (
  select source_tag_id root, target_tag_id node, 1 depth from tag_relations where relation_type='broader'
  union all
  select u.root, r.target_tag_id, u.depth+1 from up u
  join tag_relations r on r.source_tag_id=u.node and r.relation_type='broader'
  where u.depth < 50)
select count(*) as cycles from up where node=root;
```
  Confirm: a plausible number of `broader` edges (dozens–hundreds; Wikidata coverage of our exact QID pairs is sparse, so a few hundred at most), the child→parent list reads as real hypernymy, and **0 cycles**. **Paste the top-30 child→parent list into your report.**
- [ ] **Step 6 — commit** the fn + config.toml:
```bash
git add supabase/functions/pipeline-tag-wikidata-hierarchy/index.ts supabase/config.toml
git commit -m "feat(taxonomy): Wikidata P279/P361 broader-hierarchy proposer edge fn (P2 Task 2a)"
```

### Task 2b: weekly cron

- [ ] **Step 1 — create `supabase/migrations/20260724250000_tag_wikidata_hierarchy.sql`** mirroring `20260721150000_queer_image_backfill.sql`'s cron block:
```sql
select cron.schedule(
  'tag_wikidata_hierarchy', '0 5 * * 1',
  $$ select net.http_post(
       url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/pipeline-tag-wikidata-hierarchy',
       headers := jsonb_build_object('Content-Type','application/json',
         'X-Webhook-Secret', (select decrypted_secret from vault.decrypted_secrets where name='WEBHOOK_SECRET')),
       body := '{"batch_size":2200}'::jsonb); $$);

insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values ('tag_wikidata_hierarchy','Tag Wikidata hierarchy',
        'Weekly: pulls Wikidata P279/P361 chains for anchored tags → auto `broader` edges in tag_relations.',
        'system', true, '{"type":"schedule"}'::jsonb, '[]'::jsonb,
        '{"type":"edge_function","fn":"pipeline-tag-wikidata-hierarchy"}'::jsonb, '0 5 * * 1')
on conflict (slug) do update set schedule=excluded.schedule, enabled=excluded.enabled,
  description=excluded.description, name=excluded.name, action=excluded.action, trigger=excluded.trigger;
```
  (If `cron.schedule` errors on duplicate jobname, `select cron.unschedule('tag_wikidata_hierarchy');` first.)
- [ ] **Step 2 — apply:** `supabase db push`. **Step 3 — verify:** `select jobname, schedule from cron.job where jobname='tag_wikidata_hierarchy';` (1 row) + the `admin_automations` row present.
- [ ] **Step 4 — commit:**
```bash
git add supabase/migrations/20260724250000_tag_wikidata_hierarchy.sql
git commit -m "feat(taxonomy): weekly cron for Wikidata tag-hierarchy proposer (P2 Task 2b)"
```

---

## Notes
- `related` auto-apply is a deliberate, documented divergence from the design's "everything else review-gated": `related` is the weakest, non-destructive predicate (advisory for search/glossary), fully reversible by re-running the recompute; human review of thousands of advisory edges has no ROI. Merges + hierarchy stay gated/audited as designed.
- Do not delete or alter human-`approved`/`rejected` `related` rows — the recompute only rewrites `review_status='auto'`.
- After P2, the P4 public payoff (search query-expansion via `related`/`tag_broader`, glossary ontology) becomes buildable.
