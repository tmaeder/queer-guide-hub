# Safety Signal Co-Authoring — Design

Strategy source: `~/.claude/plans/act-as-an-expert-playful-spindle.md` §4.

## Goal

10-second prompt on venue pages — "Were you here? Two questions." — capturing current safety/inclusivity signals. Aggregated with 90-day half-life decay, surfaced as recency-weighted score with confidence bar. No public reviews; only aggregates.

## Data model

### `safety_signal_questions` (curated pool)

| col | type | notes |
|---|---|---|
| id | uuid pk |  |
| slug | text unique | e.g. `felt_safe_pda` |
| prompt | text | English source; i18n at render time via slug |
| answer_type | text | `yes_no` only for v1 |
| weight | numeric | future tuning, default 1.0 |
| sort_order | smallint | rotation deterministic ordering |
| active | boolean | toggles availability |
| created_at | timestamptz |  |

Seeded with 6 questions: `felt_safe_pda`, `staff_welcoming`, `trans_inclusive_bathrooms`, `mixed_queer_crowd`, `accessible_entry`, `comfortable_solo`.

### `venue_safety_signals` (responses)

| col | type | notes |
|---|---|---|
| id | uuid pk |  |
| venue_id | uuid fk venues |  |
| question_id | uuid fk safety_signal_questions |  |
| user_id | uuid fk auth.users |  |
| answer | boolean | yes / no |
| created_at | timestamptz |  |
| flagged_at | timestamptz | admin-set; null rows excluded from aggregates |

Indexes: `(venue_id, question_id, created_at desc)`, `(user_id, venue_id, created_at desc)`.

No UNIQUE — users can re-answer over time. Rate-limit via RPC.

### RLS
- `safety_signal_questions`: public SELECT (only `active=true` effectively, via RPC).
- `venue_safety_signals`: no public SELECT; admin all; user can SELECT own rows. Inserts only via RPC (`SECURITY DEFINER`), so direct INSERT denied.

## RPCs (all `SECURITY DEFINER`, `SET search_path = public`)

### `get_venue_safety_questions(p_venue_id uuid)` → `setof (question_id, slug, prompt)`
Returns up to 2 active questions the **current user** has *not* answered in the last 30 days for this venue. Stable rotation by `sort_order` + hash(user_id, venue_id). `GRANT EXECUTE TO authenticated`.

### `submit_venue_safety_signal(p_venue_id uuid, p_question_id uuid, p_answer boolean)` → `(ok boolean, reason text)`
- Auth required.
- Account age >= 7 days (against `auth.users.created_at`).
- Rate-limit: max 1 answer per (user, venue, question) per 30 days; max 20 signals per user per day platform-wide.
- Insert row; return `(true, null)` or `(false, '<reason>')`.
- `GRANT EXECUTE TO authenticated`.

### `get_venue_safety_score(p_venue_id uuid)` → `setof (question_slug, prompt, yes_weighted, no_weighted, n_responses, score, confidence_low, confidence_high, last_signal_at)`
- Time decay: `weight = exp(-ln(2) * age_days / 90)` (90-day half-life).
- `score` = weighted yes / (weighted yes + weighted no).
- Confidence interval: Wilson score interval on **raw** counts (n responses), z=1.96.
- Only includes questions with `n_responses >= 3` (display threshold).
- `GRANT EXECUTE TO anon, authenticated`.

### `flag_venue_safety_signal(p_signal_id uuid)` → admin only, sets `flagged_at`.

Anti-abuse layered: account-age gate + per-question rate-limit + daily cap + admin flag.

(Spec mentions routing through `ingestion_staging`; per-signal staging would defeat the 10-second UX. We use rate-limit + flag-on-aggregate instead, which is the same anti-abuse property at a lower friction tier.)

## Frontend

### `useVenueSafetySignals(venueId)`
- `score` query: `get_venue_safety_score` (public, 5min stale).
- `prompts` query: `get_venue_safety_questions` (auth-gated, 60s stale).
- `submit` mutation: invalidates both on success.

### `<VenueSafetySignalPrompt venue />` modal
- Triggered automatically if user is authed AND has a `venue_checkins` row for this venue AND has unanswered prompts.
- Manual trigger button "Were you here?" for users without check-in.
- Shows up to 2 questions with Yes / No / Skip per-question.
- Submits sequentially; closes when both answered or all skipped.

### `<VenueSafetySignalDisplay venueId />` inline
- Renders per question with `n_responses >= 3`:
  - "<n> visitors in the last 90 days say…"
  - Confidence bar: monochrome 0–100% (Wilson CI band visible, point estimate marker).
- Position: under Amenities card in `VenueOverview`.

## Anti-gaming summary
- Min account age 7 days.
- 1 answer per (user, venue, question) per 30 days.
- 20 signals/user/day cap.
- Admin flag → row excluded from aggregates.
- No client-side enforcement — all in `SECURITY DEFINER` RPC.

## Monochrome compliance
- All chrome via existing tokens.
- Confidence bar uses `bg-muted` track + `bg-foreground` fill.
- No emoji, no color hues, no badges.
