# Consolidation 2026-Q2 — addendum: DB advisor findings

Run after the main sprint via Supabase MCP advisor APIs against
production project `xqeacpakadqfxjxjcewc` on 2026-05-01. Closes
the gap noted in [the final report](consolidation-2026-Q2-final.md)
about Phase 4 needing Supabase MCP access.

**No DDL applied.** This is a backlog document. Each item below should
land as its own reviewed migration.

## Phase 1c verification (`trip_reviews`)

Phase 0 inventory flagged `trip_reviews` as the one orphan in legacy SQL
(no application references). DB check:

```sql
SELECT to_regclass('public.trip_reviews');  -- returns NULL
```

The table **does not exist in production.** Already dropped by an
earlier migration; the legacy SQL file that creates it is dead-letter.
No drop migration needed. State doc updated; nothing to commit on
the schema side.

## Scratch tables (Phase 1c material)

Two leftover tables clearly meant to be temporary:

| Table | Size | Likely origin |
|---|---|---|
| `_cleanup_personalities_2026_04_26` | 35 MB | Pre-migration backup taken 2026-04-26 during personalities schema work |
| `_geonames_stage` | 8 kB | One-off staging table from a geonames import |

**Action:** confirm with the maintainer that the `personalities`
migration of 2026-04-26 is settled (>4 days observation window, no
rollbacks needed), then:

```sql
DROP TABLE public._cleanup_personalities_2026_04_26;
DROP TABLE public._geonames_stage;
```

35 MB freed and the security advisor's two `RLS Enabled No Policy` /
`RLS Disabled in Public` items vanish.

## Security advisor — production findings

### ERROR (2)

| Advisor | Object | Action |
|---|---|---|
| `rls_disabled_in_public` | `public._geonames_stage` | Drop the scratch table (see above). |
| `security_definer_view` | `public.user_submission_reputation` | Audit: does the view legitimately need SECURITY DEFINER? If it aggregates across users and the caller is always a privileged admin role, fine. Otherwise switch to `SECURITY INVOKER` and add explicit RLS on the underlying table. |

### WARN (72)

| Count | Advisor | Notes |
|---|---|---|
| 42 | `authenticated_security_definer_function_executable` | Functions runnable by any authenticated user with elevated privileges. Many are intentional (RPCs called from frontend), but worth a sweep. |
| 23 | `anon_security_definer_function_executable` | Same as above but exposed to unauthenticated traffic. Higher-priority audit. |
| 6 | `function_search_path_mutable` | Add `SET search_path = public, pg_temp` to each function definition. Fixes are mechanical. |
| 1 | `auth_insufficient_mfa_options` | Enable additional MFA methods (TOTP, WebAuthn) in Supabase Auth settings. |

### INFO (1)

| Advisor | Object |
|---|---|
| `rls_enabled_no_policy` | `public._cleanup_personalities_2026_04_26` (drop the table; see above) |

## Performance advisor — production findings

| Count | Advisor | Notes |
|---|---|---|
| **259** | `unused_index` | Indexes never hit by any query in the observation window. Each costs disk + write amplification. Highest-impact cleanup of the audit. **Recommend Phase 4 batch:** drop in groups of 20 with one-week observation between batches; rollback is `CREATE INDEX` from the schema dump. |
| **109** | `unindexed_foreign_keys` | FK columns without their own index — every parent row delete triggers a full scan of the child table. Mechanical fix per FK. |
| 2 | `no_primary_key` | Both unintentional; identify and add. |
| 2 | `auth_rls_initplan` | RLS policies that re-evaluate per row instead of caching the auth token. Wrap `auth.uid()` in `(select auth.uid())` to fix. |
| 2 | `multiple_permissive_policies` | Same role + same operation has multiple permissive policies — Postgres OR's them, but the planner can't push down. Consolidate per advisor remediation guide. |

## Recommended sequencing

These findings are bigger than the consolidation sprint and shouldn't
all land at once. Suggested cadence:

1. **Quick wins (single migration):** drop `_cleanup_personalities_2026_04_26` + `_geonames_stage`. Closes 3 advisor items, frees 35 MB. Low risk if user confirms personalities migration is settled.
2. **Mechanical sweep (single migration):** add `SET search_path = public, pg_temp` to the 6 functions flagged. Fix the 2 `auth_rls_initplan` policies. Fixed in one pass.
3. **Audit + RLS hardening (separate engagement):** the 65 SECURITY DEFINER function exposures (42 authenticated + 23 anon) need per-function review — deliberate vs accidental. Don't bulk-tighten; some intentional broad access exists for valid reasons.
4. **Index audit (Phase 4 sub-project):** 259 unused + 109 missing FK indexes. Should be its own multi-batch effort with observation between batches and a revert plan. Defer until after Phase 4 baseline migration is in place.
5. **MFA settings:** Supabase dashboard, not a migration. User toggles.

## Why no migrations applied this session

Each item above carries non-trivial review surface (which functions
genuinely need SECURITY DEFINER? which indexes are "unused" only
because the relevant query path hasn't been exercised in the window?).
Mass-applying advisor remediations is the kind of move that creates
hidden incidents weeks later. This document is the backlog; the
migrations need explicit human sign-off per category.

The Phase 4 schema baseline + rename ADR (deferred from the main
sprint) is the right vehicle for batches 1, 2, and 4 above.
