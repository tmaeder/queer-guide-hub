# Groups: Private Test Group Seed

## Trans IT Professionals

A stable private group seeded for QA to exercise the request-to-join / approval
flow end-to-end.

**Why:** no deterministic private group existed; public-group join works on
`/groups` but the private membership-request flow had no test data.

**Where it lives**

- Table: `public.community_groups`, `name = 'Trans IT Professionals'`
- Seed migration: `web/supabase/migrations/20260420120100_seed_trans_it_professionals.sql`
- Companion schema migration (table + RLS + RPCs):
  `web/supabase/migrations/20260420120000_group_join_requests.sql`

The seed is applied by the standard Supabase migration pipeline — no separate
seed runner. It is idempotent (guarded on `name`), safe to re-run, and survives
`supabase db reset` because it is checked into version control like every
other migration.

**Owner**

The oldest `auth.users` row is assigned as `created_by` and inserted into
`group_memberships` with `role = 'admin'`. This guarantees the approval RPCs
have a valid admin actor. If the users table is empty, the seed is a no-op.

**Reset**

```sql
delete from public.group_memberships
  where group_id = (select id from public.community_groups where name = 'Trans IT Professionals');
delete from public.community_groups where name = 'Trans IT Professionals';
```

Then re-run migrations (or `supabase db reset`).

## Request-to-Join Flow

- **Private groups** render a **"Request to Join"** CTA in `GroupCard.tsx`.
- Clicking inserts into `public.group_join_requests` (RLS enforced).
- The CTA switches to a disabled **"Requested"** button + `Pending` badge.
- Admins/moderators see a **Pending Join Requests** panel at
  `/admin/groups`; they click **Approve** / **Reject**, which calls the
  `approve_group_join_request` / `reject_group_join_request` RPCs
  (SECURITY DEFINER).
- On approval, a `group_memberships` row is created atomically; on next fetch,
  the requester sees the group under **My Groups** with a **Leave** CTA.

Public groups bypass the request flow and keep the direct **Join** button.
