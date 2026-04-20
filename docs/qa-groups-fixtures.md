# QA Fixtures: Groups

Deterministic seed data for manual QA and automated e2e coverage of the
Community Groups feature.

Seed migration: `web/supabase/migrations/20260420130000_seed_qa_groups.sql`
(depends on `20260420120000_group_join_requests.sql`).

## Reset

```bash
cd Dev/web
supabase db reset           # local; applies all migrations + seed
```

Or on a remote branch:

```bash
supabase db push
```

## Fixture users

Passwords: `qa-password` (bcrypt-hashed in the seed, safe for local/dev only).

| Role         | Email                  | UUID                                   |
|--------------|------------------------|----------------------------------------|
| Admin        | qa-admin@qa.local      | `aaaaaaaa-0000-0000-0000-000000000001` |
| Member       | qa-member@qa.local     | `aaaaaaaa-0000-0000-0000-000000000002` |
| Non-member   | qa-nonmember@qa.local  | `aaaaaaaa-0000-0000-0000-000000000003` |
| Requester    | qa-requester@qa.local  | `aaaaaaaa-0000-0000-0000-000000000004` |

## Fixture groups

| Group                           | Visibility | UUID suffix | Seeded memberships        | Pending requests |
|---------------------------------|------------|-------------|---------------------------|------------------|
| LGBTQ+ Book Club                | Public     | `…b001`     | admin + member            | —                |
| Trans IT Professionals          | Private    | `…b002`     | admin + member            | qa-requester     |
| Polyamory Discussion Circle     | Private    | `…b003`     | admin only                | —                |

Full UUIDs: prefix `aaaaaaaa-0000-0000-0000-00000000` + suffix.

## Manual test scenarios

### 1. Public immediate join / leave
1. Sign in as `qa-nonmember`.
2. Go to `/groups` → find **LGBTQ+ Book Club**.
3. Card shows globe icon + `Join` CTA. Click `Join`.
4. Card flips to `Leave`; group appears under **My Groups**; `member_count`
   increments by 1.
5. Click `Leave` → back to `Join`; `member_count` decrements.

### 2. Private request → admin approval
1. Sign in as `qa-requester`.
2. Open **Trans IT Professionals**. Card shows lock icon + `Requested`
   (disabled) with a **Pending** badge (pre-seeded).
3. Sign out, sign in as `qa-admin`.
4. Go to `/admin/groups`. The **Pending Join Requests** panel lists the
   request. Click `Approve`.
5. Sign back in as `qa-requester`. Card now shows `Leave`; group appears in
   **My Groups**.

### 3. Private request → rejection
1. Seed a fresh request manually if needed:
   ```sql
   INSERT INTO public.group_join_requests (group_id, user_id)
   VALUES ('aaaaaaaa-0000-0000-0000-00000000b003',
           'aaaaaaaa-0000-0000-0000-000000000004');
   ```
2. Sign in as `qa-admin`, go to `/admin/groups`, click `Reject`.
3. Request disappears from the pending panel. Row in `group_join_requests`
   has `status='rejected'`.

### 4. Search determinism
- Signed in as any user, on `/groups`:
  - Search `Trans` → exactly one card: **Trans IT Professionals**.
  - Search `Polyamory` → exactly one card: **Polyamory Discussion Circle**.
  - Search `zzz` → **No groups match your search** empty state with a
    *Clear filters* button. This is **not** the same as the
    "No groups here yet" message.

### 5. Listing representation
- Private cards render with a **Lock** icon in the header.
- Public cards render with a **Globe** icon.
- `member_count` on each card reflects approved memberships only
  (pending requests are excluded).
- Admin-only **Settings** icon appears on cards where `user_role` ∈
  {`admin`, `moderator`}.

## Simulating approval from SQL

If the admin UI is unavailable, approve directly:

```sql
SELECT public.approve_group_join_request(
  'aaaaaaaa-0000-0000-0000-00000000c001'
);
```

The RPC is `SECURITY DEFINER` but asserts caller is admin/moderator of the
group. Run it from a Supabase SQL editor session impersonating `qa-admin`,
or from a psql session that sets `request.jwt.claim.sub` to the admin UUID.

## Automated coverage

- Unit: `src/components/groups/__tests__/GroupCard.test.tsx` — covers
  public `Join`, private `Request to Join`, `Requested/Pending` disabled
  state, role badges, tag truncation.
- E2E: `e2e/groups.spec.ts` — search determinism, empty-match vs empty
  state, public/private CTA routing. Requires `E2E_TEST_EMAIL` /
  `E2E_TEST_PASSWORD` env for auth setup; test skips otherwise.

## Cleanup

```sql
DELETE FROM public.group_join_requests
  WHERE id::text LIKE 'aaaaaaaa%';
DELETE FROM public.group_memberships
  WHERE user_id::text LIKE 'aaaaaaaa%';
DELETE FROM public.community_groups
  WHERE id::text LIKE 'aaaaaaaa%';
DELETE FROM public.profiles
  WHERE user_id::text LIKE 'aaaaaaaa%';
DELETE FROM auth.users
  WHERE id::text LIKE 'aaaaaaaa%';
```
