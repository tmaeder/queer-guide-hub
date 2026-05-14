# Trust Tiers — Design

Multi-stage reputation system for queer.guide. Five tiers, gated by verified
actions. Private by default — only the tier label is public; raw counts are
never exposed.

## Tiers

| Tier      | Glyph (lucide)   | Promotion criteria (cumulative)                          |
|-----------|------------------|----------------------------------------------------------|
| Visitor   | `Eye`            | default for every signed-in user                         |
| Local     | `MapPin`         | ≥1 accepted submission OR ≥1 validated safety report     |
| Scout     | `Compass`        | ≥5 accepted submissions AND ≥1 validated safety report   |
| Steward   | `Shield`         | ≥15 accepted submissions AND ≥3 validated safety reports AND ≥3 peer endorsements |
| Guardian  | `ShieldCheck`    | granted manually by staff (cannot self-promote)          |

Numbers are intentionally small for launch — easy to tune later from
`tier_thresholds` jsonb column on a single config row.

## Data model

```sql
-- 1. event log (append-only)
create table user_trust_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in
    ('submission_accepted','safety_validated','endorsement_received')),
  ref_table text,
  ref_id uuid,
  weight int not null default 1,
  created_at timestamptz default now()
);
create index on user_trust_events(user_id, kind);

-- 2. current tier per user (1:1)
create table user_trust_tiers (
  user_id uuid primary key references auth.users on delete cascade,
  tier text not null default 'visitor'
    check (tier in ('visitor','local','scout','steward','guardian')),
  submissions_accepted int not null default 0,
  safety_validated int not null default 0,
  endorsements_received int not null default 0,
  last_promoted_at timestamptz,
  manually_granted boolean not null default false,
  updated_at timestamptz default now()
);
```

RLS:
- `user_trust_events`: only owner + staff can SELECT; only triggers (SECURITY
  DEFINER inserts) write.
- `user_trust_tiers`: public can `SELECT user_id, tier` (via a view
  `user_public_tiers`); owner + staff can see counts.

## Recompute path

A SECURITY DEFINER function `recompute_user_tier(p_user uuid)` reads
`user_trust_events` aggregates and updates `user_trust_tiers`. Triggers:

1. `community_submissions` AFTER UPDATE when `status` transitions to
   `accepted`/`approved` and `submitted_by` is not null → insert
   `submission_accepted` event → recompute.
2. New `safety_reports.status` → `validated` (table already exists or stub)
   → `safety_validated` event → recompute.
3. New `user_endorsements` table (endorser_id, endorsee_id, created_at,
   unique pair) — insert fires `endorsement_received` event for endorsee.

For launch we ship #1 and #3 only; #2 wired as no-op insert helper that ops
can call until `safety_reports` exists.

## Privileges

`has_tier(p_user uuid, p_min text)` SQL helper returns boolean. Used by:

- review-gate edge function: if submitter has `steward+`, set
  `review_status='auto'` (fast-track).
- `venue_personal_visits` table: insert allowed only when
  `has_tier(auth.uid(),'scout')`.
- Early-access feature flag `guardian_early_access` checks `has_tier(...,
  'guardian')`.

## Frontend

- `src/hooks/useTrustTier.ts` — fetches own tier with counts; or tier-only for
  another user.
- `src/components/profile/TrustTierBadge.tsx` — monochrome lucide glyph
  + tier name, tooltip with description. Inline near username.
- `src/pages/ProfileTiers.tsx` (route `/profile/tiers`) — current tier,
  progress to next ("3 more accepted submissions to Scout"), tier ladder,
  privilege list. Uses shadcn `Card`, `Progress`. No point totals — only
  remaining-counts toward next tier.

Strict monochrome — glyphs inherit `currentColor`; progress bars use
`bg-foreground`/`bg-muted`.

## Out of scope

- Public leaderboard. Never.
- Demotion. Tiers are non-decreasing.
- i18n beyond English strings in this phase (keys added so future translations slot in).
