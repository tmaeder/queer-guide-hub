# Scope — gate `personalities` reads on `visibility`

**Status:** SHIPPED as `supabase/migrations/20260903100000_personalities_visibility_rls.sql`.

Verified in a rolled-back transaction against production data before shipping:

| role | non-public rows | total visible |
|---|---|---|
| anon | **0** | 1,614 |
| moderator (via `user_roles` fallback) | 14,446 | 16,060 |
| signed-in, no role | **0** | 1,614 |

## The hole

```sql
-- current, on public.personalities
CREATE POLICY "Public read access for personalities"
  FOR SELECT TO PUBLIC USING (true);
```

`SELECT USING (true)` for `PUBLIC`. The **anon key** — which ships in the frontend bundle — can read every row:

| | rows |
|---|---|
| public | 1,612 |
| **non-public (`visibility='draft'`)** | **14,448** |
| of those, `is_adult` | 6,967 |
| of those, `review_status='archived'` | 2,947 |

The archived cohort is the personhood-disposition output: organizations misfiled as people ("9th Ave Pub Corp", "The Avenue Grill"), deliberately taken out of circulation. They are readable by anyone.

This is **not** the leak recorded in `queerguide_draft_personalities_leaked_to_crawlers` — that one is the *edge* path preferring `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS by design. This is the ordinary browser client.

Because the policy is open, every client query must remember `visibility=eq.public` by hand. Three surfaces have already failed to:

- `functions/_lib/detail.ts` — 4,669 drafts served to Googlebot (fixed)
- `useBornThisWeek` — #2734 (fixed)
- `usePersonalitiesByProfession` — 171 profession pages, #2741 (fixed)

`personalities` is essentially the only table like this. A sweep for unconditional public `SELECT` policies on tables carrying a `visibility`/`review_status`/`is_adult` column returns just it and `tag_aliases` (vocabulary rows, low sensitivity).

## The fix

```sql
DROP POLICY "Public read access for personalities" ON public.personalities;

CREATE POLICY "personalities_public_read" ON public.personalities
  FOR SELECT TO PUBLIC
  USING (
    visibility = 'public'
    OR has_any_role_jwt(ARRAY['admin','moderator','editor']::app_role[])
    OR (SELECT auth.uid()) = created_by
  );
```

Three arms, each load-bearing:

1. **`visibility = 'public'`** — the gate. Matches the house pattern: `guides` uses `status='published' AND …`, `news_articles` uses `published_at IS NOT NULL`, `organizations` uses `status='active' … OR is_admin(…)`.
2. **Staff roles, not just admin.** `has_any_role_jwt(app_role[])` already exists (SECURITY DEFINER). **`is_admin()` alone would be wrong**: the personalities CMS sits under the `content` nav section at `minRole: 'editor'`, and the ladder is `admin(3) > moderator(2) > editor(1)`, so today's single **moderator** can open it. An admin-only policy would silently show them an empty console — the failure mode is invisible, not an error.
3. **`created_by`** — the existing UPDATE policy already lets a submitter edit their own row (`auth.uid() = created_by`). Without a matching read arm they could update a row they cannot see.

## Who is unaffected

- **`service_role`** bypasses RLS: every edge function, cron, pipeline stage, search indexer and data-quality script is untouched.
- **SECURITY DEFINER** RPCs and views run as owner — unaffected.
- **The public app**: 6 of its 7 personality hooks already pass `visibility=eq.public`, so they return identical rows.

## What changes behaviour (deliberately)

- **`v_popular_entities`** is SECURITY INVOKER and does not filter visibility, so it *looked* like a second anon leak path. **Measured and disproved:** `anon` has no grant on the view at all (`permission denied for view v_popular_entities`), so it was never reachable. It still tightens for any authenticated non-staff caller, but it was not a leak. Recorded because the assumption was wrong and the check was one query.
- **`useGeoLink.ts`** is the one public hook with no visibility filter. It will stop resolving draft personalities. Intended.
- **`personality_data_health`** is SECURITY INVOKER but filters visibility itself and is read by authenticated staff, who keep access via arm 2.

## Verification

Run as **anon** (the frontend key) and as **an authenticated moderator** — the moderator leg is the one that catches the `is_admin`-only mistake:

```sql
-- as anon: expect 1,612 / 0
select count(*) from personalities where visibility = 'public';
select count(*) from personalities where visibility <> 'public';
```

Plus, from the app: `/personalities`, `/professions/drag queen` and the homepage rails render unchanged (they already filter), and `/admin/content/personalities` still lists drafts when signed in as the moderator.

## Rollback

One statement — restore `USING (true)`. No data is touched, no column added, nothing to backfill.

## Risks

- **Low blast radius, invisible failure mode.** Nothing errors under RLS; rows simply vanish. The moderator console is the specific thing to check by hand, because no test covers it.
- A future non-staff role that needs draft access (e.g. `partner`) would have to be added to arm 2 explicitly.
- `app_role` also contains `partner` and `user`; both are deliberately excluded.

## Follow-up, separate

`tag_aliases` has the same unconditional public read with a `review_status` column. Much lower sensitivity (vocabulary, not people), so it does not belong in this migration.
