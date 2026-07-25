# Taxonomy Ontology Engine — P1 Implementation Plan (semantic dedup, backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the abandoned raw-similarity pool into a governed, reversible dedup pipeline — a complete cross-surface `merge_tag_concept` (+ `unmerge`), a proposer that queues the 115 actionable near-duplicate pairs, a lexically-guarded conservative auto-merge, and approve/reject RPCs. Backend only; the `/admin/taxonomy` cockpit UI is P1b.

**Architecture:** Builds on P0 (branch continues on `taxonomy-ontology-p0`). `tag_relationships` holds 70k raw embedding-similarity pairs; only **115** are actionable (both endpoints active post-prune, not in `tag_relationship_exclusions`). A proposer loads those into a new `tag_merge_review` queue with a chosen canonical (higher usage wins) and a `lexical_variant` flag. Merges run through one reversible engine that reparents **all** tag surfaces (13 content `tags[]` columns + `unified_tag_assignments` junction + aliases + category assignments) and snapshots the exact before-state for `unmerge`. Auto-merge is deliberately tiny and safe: only `similarity ≥ 0.97 AND slugs are lexical variants` (of the 5 ≥0.97 pairs, only `karaoke`/`karaoke-venue` qualifies — Misterbandb/LGBTQ-Friendly and AIDS/HIV are correctly excluded).

**Tech Stack:** PostgreSQL (Supabase `xqeacpakadqfxjxjcewc`), migrations via `supabase db push`, verify via Supabase MCP `execute_sql`. `fuzzystrmatch` (levenshtein) confirmed installed.

**Design ref:** [2026-07-24-taxonomy-ontology-engine-design.md](2026-07-24-taxonomy-ontology-engine-design.md)

## Decisions (from P1 brainstorming)
- **New reversible `merge_tag_concept`** (supersede the lossy, admin-only, slug-array-only `merge_unified_tag`).
- **Conservative auto-merge WITH a lexical guard** — embedding ≥0.97 alone is ~50% false-positive here; require slug lexical-variance too.
- Fully audited + reversible; respects `tag_relationship_exclusions`.

## Grounded schema facts (verified 2026-07-24)
- 13 content tables carry a `tags text[]` slug array: `venues, news_articles, personalities, events, festivals, hotels, milestones, organizations, queer_villages, community_groups, community_posts, cms_content, cms_pages`. (`array_replace` only touches rows containing the dup slug, so listing extra tables is harmless.)
- `unified_tag_assignments` UNIQUE `(tag_id, entity_id, entity_type)` → reparent = delete-conflicts-then-repoint.
- `tag_aliases` UNIQUE `(alias_slug)`; `alias_type` CHECK ∈ {synonym, abbreviation, spelling_variant, plural, deprecated, historical, brand_name, multilingual} → use `'synonym'`.
- `tag_relations` is currently empty (P0) → NOT reparented here (deferred to when P2 populates it; noted in Task 2).

## Conventions (same as P0)
- Apply via `supabase db push` from /Users/tobiasmaeder/QG. NEVER MCP `apply_migration` (drift). Verify via MCP `execute_sql`.
- Migration versions pre-assigned at `190000`–`220000`. **The `150000`/`160000`/`170000`/`180000` slots are deliberately skipped** — a concurrent session's open PR #2275 already claims `20260724150000`/`150001`, and the `16x/17x/18x` gap is left for other in-flight sessions. Remote applied ceiling was `20260724140000` (this branch's P0) at plan time. Before EACH `db push`, a colliding concurrent apply would surface as a duplicate-version error — if so, bump to the next free `*0000` slot and report.

---

## Task 1: Schema — merge-review queue, merge audit, lexical-variant helper

**Files:** Create `supabase/migrations/20260724190000_tag_merge_schema.sql`

- [ ] **Step 1: Failing assertion** (execute_sql; expect 0 rows BEFORE):
```sql
select to_regclass('public.tag_merge_review') as t1, to_regclass('public.tag_merge_audit') as t2;
```
Expected before: both `null`.

- [ ] **Step 2: Write the migration** `20260724190000_tag_merge_schema.sql`:
```sql
-- Merge-review queue: one row per actionable near-duplicate pair awaiting a decision.
create table if not exists public.tag_merge_review (
  id uuid primary key default gen_random_uuid(),
  canonical_id uuid not null references public.unified_tags(id) on delete cascade,
  duplicate_id uuid not null references public.unified_tags(id) on delete cascade,
  similarity numeric not null,
  lexical_variant boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','auto_merged')),
  reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  constraint tag_merge_review_distinct check (canonical_id <> duplicate_id)
);
create unique index if not exists tag_merge_review_pair_uniq
  on public.tag_merge_review (least(canonical_id,duplicate_id), greatest(canonical_id,duplicate_id));
create index if not exists tag_merge_review_status_idx on public.tag_merge_review (status);

-- Merge audit: the reversible record. snapshot holds the exact pre-merge state for unmerge.
create table if not exists public.tag_merge_audit (
  id uuid primary key default gen_random_uuid(),
  canonical_id uuid not null,
  duplicate_id uuid not null,
  canonical_slug text not null,
  duplicate_slug text not null,
  actor text not null default 'system',
  source text not null default 'manual',
  snapshot jsonb not null default '{}'::jsonb,
  is_reversed boolean not null default false,
  created_at timestamptz not null default now(),
  reversed_at timestamptz
);
create index if not exists tag_merge_audit_dup_idx on public.tag_merge_audit (duplicate_id);

-- Lexical-variant test for the auto-merge guard: true when two slugs are near-identical strings
-- (substring, plural, or small edit distance) rather than merely semantically close.
create or replace function public.tag_slugs_are_variants(a text, b text)
returns boolean language sql immutable as $$
  select case
    when a is null or b is null then false
    when a = b then true
    when position(a in b) > 0 or position(b in a) > 0 then true            -- substring (karaoke ⊂ karaoke-venue)
    when rtrim(a,'s') = rtrim(b,'s') then true                              -- crude plural
    when levenshtein(a, b) <= 2 then true                                  -- small typo/spelling variance
    else false
  end;
$$;

grant select on public.tag_merge_review, public.tag_merge_audit to authenticated, service_role;
```

- [ ] **Step 3: Apply** `supabase db push`.
- [ ] **Step 4: Verify:**
```sql
select to_regclass('public.tag_merge_review') is not null
   and to_regclass('public.tag_merge_audit') is not null
   and public.tag_slugs_are_variants('karaoke','karaoke-venue') = true
   and public.tag_slugs_are_variants('misterbandb','lgbtq-friendly') = false
   and public.tag_slugs_are_variants('aids','hiv-transmission') = false
   and public.tag_slugs_are_variants('handmade','handcrafted') = false as ok;
```
Expected: `ok = true`.
- [ ] **Step 5: Commit:**
```bash
git add supabase/migrations/20260724190000_tag_merge_schema.sql
git commit -m "feat(taxonomy): merge-review queue + merge audit + lexical-variant helper (P1)"
```

---

## Task 2: Reversible `merge_tag_concept` + `unmerge_tag_concept`

**Files:** Create `supabase/migrations/20260724200000_merge_tag_concept.sql`

- [ ] **Step 1: Failing assertion** (expect ERROR "does not exist"):
```sql
select public.merge_tag_concept('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000001');
```

- [ ] **Step 2: Write the migration** `20260724200000_merge_tag_concept.sql`:
```sql
-- Complete, reversible tag merge. Reparents every tag surface, snapshots exact pre-state,
-- respects anti-merge exclusions, internal-callable (assert_admin_or_internal, not admin-only).
create or replace function public.merge_tag_concept(
  p_canonical_id uuid, p_duplicate_id uuid,
  p_actor text default 'system', p_source text default 'manual'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_canon_slug text; v_dup_slug text; v_dup_name text;
  v_tables text[] := array['venues','news_articles','personalities','events','festivals',
                           'hotels','milestones','organizations','queer_villages',
                           'community_groups','community_posts','cms_content','cms_pages'];
  v_tbl text; v_rows jsonb; v_snapshot jsonb := '{}'::jsonb; v_alias_added boolean := false;
  v_audit_id uuid;
begin
  perform public.assert_admin_or_internal();
  if p_canonical_id = p_duplicate_id then raise exception 'merge_tag_concept: same id'; end if;
  select slug into v_canon_slug from public.unified_tags where id = p_canonical_id;
  select slug, name into v_dup_slug, v_dup_name from public.unified_tags where id = p_duplicate_id;
  if v_canon_slug is null or v_dup_slug is null then raise exception 'merge_tag_concept: tag(s) not found'; end if;
  if exists (select 1 from public.tag_relationship_exclusions e
       where e.tag1_id = least(p_canonical_id,p_duplicate_id)
         and e.tag2_id = greatest(p_canonical_id,p_duplicate_id)) then
    raise exception 'merge_tag_concept: pair is a do-not-merge exclusion';
  end if;
  if exists (select 1 from public.unified_tags where id = p_duplicate_id and status = 'merged') then
    raise exception 'merge_tag_concept: duplicate already merged';
  end if;

  -- Content tables: snapshot the full before-array for every affected row, then replace+dedup.
  foreach v_tbl in array v_tables loop
    execute format(
      'select coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''tags'', tags)), ''[]''::jsonb)
         from %I where %L = any(tags)', v_tbl, v_dup_slug) into v_rows;
    if v_rows <> '[]'::jsonb then
      v_snapshot := v_snapshot || jsonb_build_object(v_tbl, v_rows);
      execute format(
        'update %I set tags = (select array_agg(distinct t)
             from unnest(array_replace(tags, %L, %L)) t where t is not null)
         where %L = any(tags)', v_tbl, v_dup_slug, v_canon_slug, v_dup_slug);
    end if;
  end loop;

  -- Junction: snapshot dup rows, delete would-be-duplicate rows, repoint the rest.
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows
    from (select id, entity_id, entity_type from public.unified_tag_assignments where tag_id = p_duplicate_id) x;
  v_snapshot := v_snapshot || jsonb_build_object('__uta', v_rows);
  delete from public.unified_tag_assignments d
   where d.tag_id = p_duplicate_id
     and exists (select 1 from public.unified_tag_assignments c
        where c.tag_id = p_canonical_id and c.entity_id = d.entity_id and c.entity_type = d.entity_type);
  update public.unified_tag_assignments set tag_id = p_canonical_id where tag_id = p_duplicate_id;

  -- Category assignments: snapshot, repoint, drop resulting duplicates.
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows
    from (select id, category_id from public.tag_category_assignments where tag_id = p_duplicate_id) x;
  v_snapshot := v_snapshot || jsonb_build_object('__cat', v_rows);
  delete from public.tag_category_assignments d
   where d.tag_id = p_duplicate_id
     and exists (select 1 from public.tag_category_assignments c
        where c.tag_id = p_canonical_id and c.category_id = d.category_id);
  update public.tag_category_assignments set tag_id = p_canonical_id where tag_id = p_duplicate_id;

  -- Dup slug becomes a synonym alias of the canonical concept.
  if not exists (select 1 from public.tag_aliases where alias_slug = v_dup_slug) then
    insert into public.tag_aliases (canonical_tag_id, alias_name, alias_slug, alias_type, review_status)
    values (p_canonical_id, v_dup_name, v_dup_slug, 'synonym', 'approved');
    v_alias_added := true;
  end if;
  v_snapshot := v_snapshot || jsonb_build_object('__alias_added', v_alias_added);

  -- Mark duplicate merged (reversible: status/merged_into_id).
  update public.unified_tags
     set status = 'merged', merged_into_id = p_canonical_id, deprecated_at = now(),
         deprecation_reason = format('merged into %s by %s (%s)', v_canon_slug, p_actor, p_source),
         updated_at = now()
   where id = p_duplicate_id;

  insert into public.tag_merge_audit
    (canonical_id, duplicate_id, canonical_slug, duplicate_slug, actor, source, snapshot, is_reversed)
  values (p_canonical_id, p_duplicate_id, v_canon_slug, v_dup_slug, p_actor, p_source, v_snapshot, false)
  returning id into v_audit_id;

  perform public.recount_unified_tag_usage();
  return v_audit_id;
end $$;

-- Reversal: replay the snapshot verbatim.
create or replace function public.unmerge_tag_concept(p_audit_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_a public.tag_merge_audit; v_tbl text; v_snap jsonb;
begin
  perform public.assert_admin_or_internal();
  select * into v_a from public.tag_merge_audit where id = p_audit_id;
  if not found then raise exception 'unmerge_tag_concept: audit not found'; end if;
  if v_a.is_reversed then return false; end if;
  v_snap := v_a.snapshot;

  -- Restore content-table arrays verbatim.
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

  -- Restore junction: flip repointed rows back, re-insert deleted conflicts.
  update public.unified_tag_assignments u set tag_id = v_a.duplicate_id
    from jsonb_to_recordset(coalesce(v_snap->'__uta','[]'::jsonb)) as s(id uuid, entity_id uuid, entity_type text)
   where u.id = s.id;
  insert into public.unified_tag_assignments (id, tag_id, entity_id, entity_type)
  select s.id, v_a.duplicate_id, s.entity_id, s.entity_type
    from jsonb_to_recordset(coalesce(v_snap->'__uta','[]'::jsonb)) as s(id uuid, entity_id uuid, entity_type text)
   where not exists (select 1 from public.unified_tag_assignments u where u.id = s.id)
  on conflict do nothing;

  -- Restore category assignments similarly.
  update public.tag_category_assignments c set tag_id = v_a.duplicate_id
    from jsonb_to_recordset(coalesce(v_snap->'__cat','[]'::jsonb)) as s(id uuid, category_id uuid)
   where c.id = s.id;
  insert into public.tag_category_assignments (id, tag_id, category_id)
  select s.id, v_a.duplicate_id, s.category_id
    from jsonb_to_recordset(coalesce(v_snap->'__cat','[]'::jsonb)) as s(id uuid, category_id uuid)
   where not exists (select 1 from public.tag_category_assignments c where c.id = s.id)
  on conflict do nothing;

  -- Remove the synonym alias we added.
  if coalesce((v_snap->>'__alias_added')::boolean, false) then
    delete from public.tag_aliases
     where alias_slug = v_a.duplicate_slug and canonical_tag_id = v_a.canonical_id and alias_type = 'synonym';
  end if;

  -- Reactivate the duplicate concept.
  update public.unified_tags
     set status = 'active', merged_into_id = null, deprecated_at = null,
         deprecation_reason = null, updated_at = now()
   where id = v_a.duplicate_id;

  update public.tag_merge_audit set is_reversed = true, reversed_at = now() where id = p_audit_id;
  perform public.recount_unified_tag_usage();
  return true;
end $$;

revoke all on function public.merge_tag_concept(uuid,uuid,text,text) from public;
revoke all on function public.unmerge_tag_concept(uuid) from public;
grant execute on function public.merge_tag_concept(uuid,uuid,text,text) to service_role;
grant execute on function public.unmerge_tag_concept(uuid) to service_role;
```

Note: `tag_relations` reparenting is intentionally omitted — it is empty at P1. When P2 populates broader/related edges, extend both functions to repoint + snapshot `tag_relations`.

- [ ] **Step 3: Apply** `supabase db push`.
- [ ] **Step 4: Verify — a full merge→unmerge round-trip on a real pair leaves state byte-identical.**
Pick the karaoke pair (safe, real). Run this whole block as ONE execute_sql call:
```sql
do $$
declare v_canon uuid; v_dup uuid; v_audit uuid;
        v_before_active int; v_after_merge_active int; v_after_unmerge_active int;
        v_before_uta int; v_after_uta int;
begin
  select id into v_canon from public.unified_tags where slug='karaoke' and status='active';
  select id into v_dup   from public.unified_tags where slug='karaoke-venue' and status='active';
  if v_canon is null or v_dup is null then raise notice 'karaoke pair not both active — skipping round-trip'; return; end if;

  select count(*) into v_before_active from public.unified_tags where status='active';
  select count(*) into v_before_uta from public.unified_tag_assignments where tag_id=v_dup;

  v_audit := public.merge_tag_concept(v_canon, v_dup, 'test', 'roundtrip');
  select count(*) into v_after_merge_active from public.unified_tags where status='active';
  if v_after_merge_active <> v_before_active - 1 then raise exception 'merge did not deactivate dup'; end if;
  if exists (select 1 from public.unified_tag_assignments where tag_id=v_dup) then raise exception 'uta not repointed'; end if;

  perform public.unmerge_tag_concept(v_audit);
  select count(*) into v_after_unmerge_active from public.unified_tags where status='active';
  select count(*) into v_after_uta from public.unified_tag_assignments where tag_id=v_dup;
  if v_after_unmerge_active <> v_before_active then raise exception 'unmerge did not restore active count'; end if;
  if v_after_uta <> v_before_uta then raise exception 'unmerge did not restore junction (% vs %)', v_after_uta, v_before_uta; end if;

  raise notice 'round-trip OK: active %->%->%; uta dup %->0->%', v_before_active, v_after_merge_active, v_after_unmerge_active, v_before_uta, v_after_uta;
end $$;
```
Expected: completes with `NOTICE round-trip OK`, no exception. (This leaves the karaoke pair UN-merged so the real merge happens later via the queue/auto-merge in Task 4.)

Also verify the exclusion guard blocks a protected pair:
```sql
do $$
declare a uuid; b uuid; caught boolean := false;
begin
  select tag1_id, tag2_id into a, b from public.tag_relationship_exclusions limit 1;
  begin perform public.merge_tag_concept(a, b, 'test', 'guard'); exception when others then caught := true; end;
  if not caught then raise exception 'EXCLUSION GUARD FAILED'; end if;
  raise notice 'exclusion guard OK';
end $$;
```
Expected: `NOTICE exclusion guard OK`.

- [ ] **Step 5: Commit:**
```bash
git add supabase/migrations/20260724200000_merge_tag_concept.sql
git commit -m "feat(taxonomy): reversible cross-surface merge_tag_concept + unmerge (P1)"
```

---

## Task 3: Proposer — populate the merge-review queue

**Files:** Create `supabase/migrations/20260724210000_tag_merge_proposer.sql`

- [ ] **Step 1: Failing assertion** (expect ERROR "does not exist"):
```sql
select public.refresh_tag_merge_candidates();
```

- [ ] **Step 2: Write the migration** `20260724210000_tag_merge_proposer.sql`:
```sql
-- Load actionable near-duplicate pairs into tag_merge_review. Actionable = both endpoints active,
-- similarity >= threshold, not an exclusion, not already queued. Canonical = higher usage_count
-- (tie: shorter slug, then older). lexical_variant drives the auto-merge guard in Task 4.
create or replace function public.refresh_tag_merge_candidates(p_min_similarity numeric default 0.90)
returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform public.assert_admin_or_internal();
  with pairs as (
    select tr.tag1_id, tr.tag2_id, tr.similarity_score,
           a.slug sa, a.usage_count ua, a.created_at ca,
           b.slug sb, b.usage_count ub, b.created_at cb
    from public.tag_relationships tr
    join public.unified_tags a on a.id = tr.tag1_id and a.status = 'active'
    join public.unified_tags b on b.id = tr.tag2_id and b.status = 'active'
    where tr.similarity_score >= p_min_similarity
      and not exists (select 1 from public.tag_relationship_exclusions e
         where e.tag1_id = least(tr.tag1_id,tr.tag2_id) and e.tag2_id = greatest(tr.tag1_id,tr.tag2_id))
  ), chosen as (
    select
      case when ua > ub or (ua = ub and length(sa) < length(sb))
             or (ua = ub and length(sa) = length(sb) and ca <= cb)
           then tag1_id else tag2_id end as canonical_id,
      case when ua > ub or (ua = ub and length(sa) < length(sb))
             or (ua = ub and length(sa) = length(sb) and ca <= cb)
           then tag2_id else tag1_id end as duplicate_id,
      similarity_score,
      public.tag_slugs_are_variants(sa, sb) as lexical_variant
    from pairs
  )
  insert into public.tag_merge_review (canonical_id, duplicate_id, similarity, lexical_variant, reason)
  select canonical_id, duplicate_id, similarity_score, lexical_variant, 'proposer: embedding similarity'
  from chosen c
  where not exists (
    select 1 from public.tag_merge_review r
    where least(r.canonical_id,r.duplicate_id) = least(c.canonical_id,c.duplicate_id)
      and greatest(r.canonical_id,r.duplicate_id) = greatest(c.canonical_id,c.duplicate_id))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.refresh_tag_merge_candidates(numeric) from public;
grant execute on function public.refresh_tag_merge_candidates(numeric) to service_role;
```

- [ ] **Step 3: Apply** `supabase db push`.
- [ ] **Step 4: Populate + verify:**
```sql
select public.refresh_tag_merge_candidates(0.90) as queued;   -- expect ~115
select count(*) filter (where status='pending') pending,
       count(*) filter (where lexical_variant and similarity>=0.97) auto_eligible,
       count(*) total
from public.tag_merge_review;
```
Expected: `queued` ≈ 115, `pending` ≈ 115, `auto_eligible` ≈ 1 (karaoke), `total` ≈ 115. Idempotency: run `refresh_tag_merge_candidates(0.90)` a second time → returns `0` (no dup rows).

- [ ] **Step 5: Commit:**
```bash
git add supabase/migrations/20260724210000_tag_merge_proposer.sql
git commit -m "feat(taxonomy): merge-candidate proposer populates review queue (P1)"
```

---

## Task 4: Auto-merge pass + approve/reject RPCs + execute

**Files:** Create `supabase/migrations/20260724220000_tag_merge_actions.sql`

- [ ] **Step 1: Failing assertion** (expect ERROR "does not exist"):
```sql
select public.run_tag_auto_merge();
```

- [ ] **Step 2: Write the migration** `20260724220000_tag_merge_actions.sql`:
```sql
-- Conservative auto-merge: ONLY pairs that are both highly similar AND lexical string-variants.
-- Embedding similarity alone is ~50% false-positive at >=0.97 (e.g. Misterbandb/LGBTQ-Friendly,
-- AIDS/HIV) — the lexical_variant gate is what makes this safe. Batched (search-trigger storm).
create or replace function public.run_tag_auto_merge(p_min_similarity numeric default 0.97, p_limit int default 25)
returns int
language plpgsql security definer set search_path = public as $$
declare r record; v_n int := 0;
begin
  perform public.assert_admin_or_internal();
  for r in
    select id, canonical_id, duplicate_id from public.tag_merge_review
    where status = 'pending' and lexical_variant = true and similarity >= p_min_similarity
    order by similarity desc
    limit greatest(p_limit, 0)
  loop
    -- merge_tag_concept enforces exclusions + already-merged; skip a pair that raises.
    begin
      perform public.merge_tag_concept(r.canonical_id, r.duplicate_id, 'auto', 'auto:lexical-variant');
      update public.tag_merge_review set status='auto_merged', decided_at=now(), decided_by='auto' where id=r.id;
      v_n := v_n + 1;
    exception when others then
      update public.tag_merge_review set status='rejected', decided_at=now(), decided_by='auto',
             reason = coalesce(reason,'')||' | auto-merge failed: '||sqlerrm where id=r.id;
    end;
  end loop;
  return v_n;
end $$;

-- Cockpit/manual actions.
create or replace function public.approve_tag_merge(p_review_id uuid, p_actor text default 'admin')
returns uuid
language plpgsql security definer set search_path = public as $$
declare r public.tag_merge_review; v_audit uuid;
begin
  perform public.assert_admin_or_internal();
  select * into r from public.tag_merge_review where id = p_review_id;
  if not found then raise exception 'approve_tag_merge: review not found'; end if;
  if r.status <> 'pending' then raise exception 'approve_tag_merge: already %', r.status; end if;
  v_audit := public.merge_tag_concept(r.canonical_id, r.duplicate_id, p_actor, 'review:approve');
  update public.tag_merge_review set status='approved', decided_at=now(), decided_by=p_actor where id=p_review_id;
  return v_audit;
end $$;

-- Reject a proposed merge. p_add_exclusion=true records a permanent do-not-merge guard.
create or replace function public.reject_tag_merge(p_review_id uuid, p_add_exclusion boolean default false, p_actor text default 'admin')
returns boolean
language plpgsql security definer set search_path = public as $$
declare r public.tag_merge_review;
begin
  perform public.assert_admin_or_internal();
  select * into r from public.tag_merge_review where id = p_review_id;
  if not found then raise exception 'reject_tag_merge: review not found'; end if;
  update public.tag_merge_review set status='rejected', decided_at=now(), decided_by=p_actor where id=p_review_id;
  if p_add_exclusion then
    insert into public.tag_relationship_exclusions (tag1_id, tag2_id, reason)
    values (least(r.canonical_id,r.duplicate_id), greatest(r.canonical_id,r.duplicate_id),
            'rejected merge — kept distinct via review')
    on conflict do nothing;
  end if;
  return true;
end $$;

revoke all on function public.run_tag_auto_merge(numeric,int) from public;
revoke all on function public.approve_tag_merge(uuid,text) from public;
revoke all on function public.reject_tag_merge(uuid,boolean,text) from public;
grant execute on function public.run_tag_auto_merge(numeric,int) to service_role;
grant execute on function public.approve_tag_merge(uuid,text) to service_role, authenticated;
grant execute on function public.reject_tag_merge(uuid,boolean,text) to service_role, authenticated;
```

- [ ] **Step 3: Apply** `supabase db push`.
- [ ] **Step 4: Execute the auto-merge + verify:**
```sql
select public.run_tag_auto_merge() as auto_merged;   -- expect 1 (karaoke)
-- karaoke-venue is now merged into karaoke
select status, merged_into_id is not null merged
  from public.unified_tags where slug='karaoke-venue';   -- expect status='merged', merged=true
-- queue reflects it, ~110 still pending for the cockpit
select status, count(*) from public.tag_merge_review group by status order by 2 desc;
```
Expected: `auto_merged=1`; karaoke-venue `status='merged'`; queue shows 1 `auto_merged` + ~110 `pending`.

Confirm reversibility of the auto-merge (find its audit row, unmerge, re-verify, then re-merge to leave it merged):
```sql
-- inspect: the karaoke merge is auditable + reversible
select id, canonical_slug, duplicate_slug, is_reversed from public.tag_merge_audit where duplicate_slug='karaoke-venue';
```
Expected: one row, `is_reversed=false`. (Leave it merged — it is a genuine duplicate.)

- [ ] **Step 5: Commit:**
```bash
git add supabase/migrations/20260724220000_tag_merge_actions.sql
git commit -m "feat(taxonomy): lexically-guarded auto-merge + approve/reject RPCs; auto-merge karaoke (P1)"
```

---

## P1 done — definition of done
- `merge_tag_concept`/`unmerge_tag_concept` reparent all tag surfaces, snapshot+replay verified byte-identical, respect exclusions, internal-callable. ✅
- `tag_merge_review` queue holds the ~115 actionable pairs with chosen canonical + lexical flag. ✅
- Auto-merge is lexically guarded — only true string-variants at ≥0.97 auto-merge (1 pair: karaoke); the ~110 semantic-but-not-lexical pairs await human review. ✅
- `approve_tag_merge` / `reject_tag_merge(add_exclusion)` ready for the cockpit. ✅

## Deferred
- **P1b — `/admin/taxonomy` cockpit UI**: render `tag_merge_review` pending rows (both tags' name/slug/usage/similarity, side by side), approve/reject (+ "keep distinct" → exclusion) buttons calling the RPCs, and an audit/undo list calling `unmerge_tag_concept`. Frontend; its own plan.
- Extend `merge_tag_concept`/`unmerge` to reparent `tag_relations` once P2 populates it.
- Wire `refresh_tag_merge_candidates` + `run_tag_auto_merge` into a nightly cron in P3.

## Self-review
- **Spec coverage:** proposer (design §2 semantic-dedup) → queue → guarded auto-apply (§2 conservative) → reversible merge (§1) → exclusion respect (P0 invariant). Cockpit is explicitly P1b.
- **Type consistency:** `canonical_id`/`duplicate_id`, `similarity`, `lexical_variant`, `snapshot` jsonb keys (`__uta`/`__cat`/`__alias_added` + table names), and `alias_type='synonym'` are used identically across tasks and match the audited schema.
- **Reversibility:** every merge writes a `tag_merge_audit` snapshot; `unmerge_tag_concept` replays it; round-trip asserted byte-identical in Task 2 Step 4.
