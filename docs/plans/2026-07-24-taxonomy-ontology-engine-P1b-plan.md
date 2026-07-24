# Taxonomy Ontology Engine — P1b Implementation Plan (merge cockpit UI)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give admins a governed UI over the P1 merge engine. The backend shipped (`tag_merge_review` queue = 114 pending pairs + 1 auto_merged; `merge_tag_concept`/`unmerge_tag_concept`; `approve_tag_merge`/`reject_tag_merge`). P1b adds (A) a read path + security lockdown and (B) a review-queue panel on the existing **Tags Management** page (`src/pages/AdminTags.tsx`), replacing the superseded `TagMergeCandidates` (which drives the old lossy `merge_unified_tag`).

**Branch:** continue on `taxonomy-ontology-p0`.

## Grounded facts (verified 2026-07-24)
- `tag_merge_review`: `id, canonical_id, duplicate_id, similarity numeric, lexical_variant bool, status ('pending'|'approved'|'rejected'|'auto_merged'), reason, created_at, decided_at, decided_by`. **RLS is OFF and `authenticated` has a table-level SELECT grant → any logged-in user can read it via PostgREST. Close this.**
- `tag_merge_audit`: `id, canonical_id, duplicate_id, canonical_slug, duplicate_slug, actor, source, snapshot jsonb, is_reversed, created_at, reversed_at`. Also RLS-off; lock down too.
- RPCs (all SECURITY DEFINER, gated by `assert_admin_or_internal`, granted to `authenticated`): `approve_tag_merge(p_review_id uuid, p_actor text default 'admin')` → returns audit uuid; `reject_tag_merge(p_review_id uuid, p_add_exclusion boolean default false, p_actor text default 'admin')` → bool; `unmerge_tag_concept(p_audit_id uuid)`.
- `unified_tags` has `id,name,slug,category,usage_count,status`.
- Conventions (same as P0/P1): apply via `supabase db push` from `/Users/tobiasmaeder/QG`; NEVER MCP `apply_migration`; verify via MCP `execute_sql` (project `xqeacpakadqfxjxjcewc`). Keep the assigned version; on a duplicate-version error bump to the next free `*0000` slot and report.

---

## Task 1: Cockpit read RPCs + RLS lockdown (backend)

**File:** create `supabase/migrations/20260724230000_tag_merge_cockpit_rpcs.sql`

- [ ] **Step 1 — failing assertion** (execute_sql; expect both null → error/false):
```sql
select to_regprocedure('public.tag_merge_queue(integer)') as q, to_regprocedure('public.tag_merge_recent(integer)') as r;
```

- [ ] **Step 2 — write the migration EXACTLY** (`assert_admin_or_internal()` returns `void` and RAISES for non-admins, so both fns are `plpgsql` with a leading `perform` guard — a non-admin caller gets the exception, never rows):
```sql
-- Enriched pending merge-review queue for the admin cockpit. Definer + admin-gated;
-- joins both endpoints so the UI shows names/slugs/usage without a client-side second fetch.
create or replace function public.tag_merge_queue(p_limit int default 200)
returns table (
  review_id uuid, similarity numeric, lexical_variant boolean, created_at timestamptz,
  canonical_id uuid, canonical_name text, canonical_slug text, canonical_usage int, canonical_category text,
  duplicate_id uuid, duplicate_name text, duplicate_slug text, duplicate_usage int, duplicate_category text
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_or_internal();
  return query
    select r.id, r.similarity, r.lexical_variant, r.created_at,
           c.id, c.name, c.slug, coalesce(c.usage_count,0)::int, c.category,
           d.id, d.name, d.slug, coalesce(d.usage_count,0)::int, d.category
    from public.tag_merge_review r
    join public.unified_tags c on c.id = r.canonical_id
    join public.unified_tags d on d.id = r.duplicate_id
    where r.status = 'pending'
    order by r.lexical_variant desc, r.similarity desc
    limit greatest(p_limit, 0);
end $$;

-- Recent live (non-reversed) merges, for the reversibility/undo panel.
create or replace function public.tag_merge_recent(p_limit int default 20)
returns table (
  audit_id uuid, canonical_slug text, duplicate_slug text, actor text, source text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_or_internal();
  return query
    select a.id, a.canonical_slug, a.duplicate_slug, a.actor, a.source, a.created_at
    from public.tag_merge_audit a
    where a.is_reversed = false
    order by a.created_at desc
    limit greatest(p_limit, 0);
end $$;

-- Lock down the base tables: all cockpit access is via the definer RPCs above
-- (which bypass RLS). Enabling RLS with no policies default-denies direct PostgREST reads;
-- also drop the stray table grants. service_role bypasses RLS for the pipeline.
alter table public.tag_merge_review enable row level security;
alter table public.tag_merge_audit  enable row level security;
revoke select, insert, update, delete on public.tag_merge_review from authenticated, anon;
revoke select, insert, update, delete on public.tag_merge_audit  from authenticated, anon;

revoke all on function public.tag_merge_queue(int)  from public;
revoke all on function public.tag_merge_recent(int) from public;
grant execute on function public.tag_merge_queue(int)  to authenticated, service_role;
grant execute on function public.tag_merge_recent(int) to authenticated, service_role;
```

- [ ] **Step 3 — apply:** `supabase db push`.

- [ ] **Step 4 — verify** (execute_sql, running as service_role/admin here):
```sql
select count(*) as queue_rows from public.tag_merge_queue();          -- expect 114
select * from public.tag_merge_queue(3);                              -- 3 enriched rows, lexical first
select count(*) as recent_rows from public.tag_merge_recent();        -- >=1 (karaoke)
-- security: RLS now on, no policies
select relrowsecurity from pg_class where oid='public.tag_merge_review'::regclass;  -- true
```
Confirm: 114 queue rows, enriched fields populated, recent shows the karaoke merge, RLS true.

- [ ] **Step 5 — commit:**
```bash
git add supabase/migrations/20260724230000_tag_merge_cockpit_rpcs.sql
git commit -m "feat(taxonomy): admin cockpit read RPCs (queue/recent) + RLS lockdown on merge tables (P1b)"
```

---

## Task 2: Merge-review queue panel (frontend)

**Files:** create `src/components/admin/TagMergeReviewQueue.tsx`; edit `src/pages/AdminTags.tsx`; delete `src/components/admin/TagMergeCandidates.tsx` + its test.

- [ ] **Step 1** — Build `TagMergeReviewQueue.tsx`, mirroring the existing panel idiom in this repo (`useQuery`/`useMutation` from `@tanstack/react-query`, `supabase.rpc(...)`, `Button`/`Badge` from `@/components/ui/*`, `toast` from `sonner`, lucide icons). Requirements:
  - Collapsible section header "Merge review queue" with a pending count badge (matches `TagMergeCandidates`' collapsible pattern).
  - `useQuery(['tag-merge-queue'], () => supabase.rpc('tag_merge_queue', { p_limit: 200 }))`. Handle the `{ data, error }` shape; surface RPC errors via toast.
  - Each row: **duplicate → canonical** direction shown clearly (duplicate slug struck/merged INTO canonical). Show both `name` + mono `slug` + `usage` count for each side, the `similarity` (as %), and a `lexical variant` badge when true. Canonical is the higher-usage side (already chosen by the proposer).
  - **Approve** button → `supabase.rpc('approve_tag_merge', { p_review_id })`; on success toast "Merged <dup> → <canonical>", invalidate `['tag-merge-queue']` and `['tag-merge-recent']`.
  - **Reject** → `supabase.rpc('reject_tag_merge', { p_review_id, p_add_exclusion })`. Include a small checkbox/toggle "keep distinct permanently" that sets `p_add_exclusion=true` (records a do-not-merge guard). Toast + invalidate.
  - Disable a row's buttons while its mutation is pending; keep the rest interactive (per-row pending state).
  - Empty state: "No pending merge proposals." (design copy rule — no metaphors).
  - Second collapsible "Recently merged" block: `useQuery(['tag-merge-recent'], () => supabase.rpc('tag_merge_recent', { p_limit: 20 }))`, each row `duplicate_slug → canonical_slug`, actor/source, and an **Undo** button → `supabase.rpc('unmerge_tag_concept', { p_audit_id })` (toast "Unmerged", invalidate both queries). This is the reversibility payoff.
  - Follow the design system: `rounded-element`/`rounded-badge`, 8pt spacing, monochrome, no shadows/gradients, lucide icons (`GitMerge`, `Undo2`, `Check`, `X`, `ChevronDown/Up`). No new colors.
- [ ] **Step 2** — In `AdminTags.tsx`: replace `import TagMergeCandidates from '@/components/admin/TagMergeCandidates';` with `import { TagMergeReviewQueue } from '@/components/admin/TagMergeReviewQueue';`, and swap `<TagMergeCandidates />` for `<TagMergeReviewQueue />` in the `beforeTable` slot (same position, after `<TagCategorizer />`).
- [ ] **Step 3** — Delete `src/components/admin/TagMergeCandidates.tsx` and `src/components/admin/__tests__/TagMergeCandidates.test.tsx`. Grep the repo to confirm no other importers remain (`grep -rn TagMergeCandidates src` → only the deleted files).
- [ ] **Step 4** — Add a focused test `src/components/admin/__tests__/TagMergeReviewQueue.test.tsx` (vitest + RTL): mock `supabase.rpc` to return two queue rows; assert both pairs render with slugs + a lexical badge on the flagged one; click Approve → assert `approve_tag_merge` called with the right `p_review_id`; toggle "keep distinct" + Reject → assert `reject_tag_merge` called with `p_add_exclusion: true`. Mirror the mocking style of the existing `TagMergeCandidates.test.tsx` before deleting it.
- [ ] **Step 5** — `npm run typecheck` and `npm test -- TagMergeReviewQueue` (and lint the two touched files). Fix anything red.
- [ ] **Step 6 — commit:**
```bash
git add src/components/admin/TagMergeReviewQueue.tsx src/pages/AdminTags.tsx src/components/admin/__tests__/TagMergeReviewQueue.test.tsx
git rm src/components/admin/TagMergeCandidates.tsx src/components/admin/__tests__/TagMergeCandidates.test.tsx
git commit -m "feat(taxonomy): merge-review cockpit panel on Tags admin, supersede lossy TagMergeCandidates (P1b)"
```

## Notes
- Do NOT approve/reject any real pairs during implementation — leave the 114 pending for the human admin. Tests use mocks. Only the karaoke row is already auto_merged.
- The old `merge_unified_tag`/`find_unified_tag_duplicates` path is now fully superseded by the governed engine; removing `TagMergeCandidates` retires the last UI that called it.
