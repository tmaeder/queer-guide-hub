# Signup consent records not persisted (2026-05-23 → 2026-08-21)

**Status:** fixed forward in `20260915090000_handle_new_user_restore_consent_and_defaults.sql`.
**Deliberately not backfilled.** See *Remediation*.

## What happened

The signup form collected three consent timestamps and sent them as Supabase
signup metadata. The `handle_new_user()` trigger stopped writing them to
`profiles`, so they were discarded on arrival. The UI gave no sign of this —
the checkbox worked, the account was created, the record simply was not kept.

Two successive rewrites of the same function each dropped columns the previous
one had added. Neither was the point of its migration; both were collateral:

| Migration | Date | Effect on `handle_new_user` |
|---|---|---|
| `20260411120001_signup_safe_defaults.sql` | 2026-04-11 | **Added** `signup_provider`, `terms_accepted_at`, `privacy_accepted_at`, `age_confirmed_at` |
| `20260523330001_handle_new_user_persists_avatar.sql` | 2026-05-23 | Added `avatar_config`/`avatar_type`; **dropped all four of the above** |
| `20260612160000_username_v2.sql` | 2026-06-12 | Rewrote for v2 username rules; **dropped `avatar_config`/`avatar_type` too** |

So the consent gap opens on **2026-05-23**, not 2026-06-12 — the later
migration widened an existing gap rather than creating it.

## Scope (measured on prod, 2026-08-21)

| Metric | Value |
|---|---|
| Profiles created since 2026-05-23 | 11 |
| …of those, with no `terms_accepted_at` | **9** |
| Profiles overall with no `signup_provider` | 15 of 17 |
| Profiles overall with no `avatar_config` | 8 of 17 |

The client was sending all seven fields throughout (`Signup.tsx`), so this is
purely a write-side loss.

## Remediation

**Consent timestamps are not backfilled, by decision.** GDPR Art. 7(1) requires
the controller to be able to *demonstrate* consent. A timestamp written by a
migration demonstrates nothing about what a person was shown or agreed to,
while being indistinguishable in the table from a record that does. That
converts a known, documented gap into a false record — strictly worse than the
gap. `now()` would be provably wrong and `created_at` a guess.

The nine accounts are therefore recorded here as a known gap. If a real record
is required for them, the defensible route is a one-time re-consent
interstitial on next sign-in that writes a genuine timestamp — cheap at this
scale, and it produces evidence rather than the appearance of it.

**`signup_provider` and `avatar_config` are backfilled.** Both are derivable
facts (provider from `auth.identities`; the avatar is a deterministic default
seeded on `user_id`, byte-identical to `20260612160200`'s), not assertions
about a person's choices.

## Second finding: `signup_validation_error` was never writable

Found while widening the funnel-event vocabulary in the same migration.

`signup_funnel_events.event` carries an enumerated `CHECK` listing ten literals.
The TypeScript `FunnelEvent` union in `src/hooks/useSignupFunnel.ts` drifted to
include `signup_validation_error`, which **is not in the constraint**. Verified
against the live constraint on 2026-08-21: the value is absent. `Signup.tsx`
emits it on every failed validation; Postgres rejects the INSERT; the hook
swallows the rejection in a `catch` that only calls `console.debug`.

This matters beyond the missing rows. The funnel reads 3,675 signup-form views,
4 completions, and **zero** validation errors — and that zero was initially
read as a finding about users ("they leave without ever submitting"). It is not
evidence of anything: the row could not be written regardless of what anyone
did. Any conclusion drawn from the absence of this event is unfounded.

The constraint is widened to include it, plus `signup_submit_attempt` (emitted
before validation, so "never tried" and "tried and was blocked" become
distinguishable) and the two password-reset events.

**Generalisable:** a fire-and-forget analytics writer that silently drops
rejected rows will always produce this failure mode — the client vocabulary and
the database constraint drift apart, and the resulting zeros read as
measurements. Either the vocabulary must be generated from one source, or the
writer must surface rejections loudly enough to notice.

## Verification

The new trigger was exercised against prod inside a rolled-back transaction
(two synthetic `auth.users` inserts, one with full metadata and one empty,
then `ROLLBACK`; confirmed zero leaked rows afterwards):

| Case | username | `display_name` = email local part | avatar | `signup_provider` | consent |
|---|---|---|---|---|---|
| Full metadata, `provider=email` | auto-assigned | **no** (mirrors handle) | auto | `email` | **recorded** |
| Empty metadata, `provider=apple` | auto-assigned | **no** (mirrors handle) | auto | `apple` | absent (none sent — not fabricated) |

The `display_name` column is the one to watch: `trg_mirror_username_to_display_name`
only fires when `username IS NOT NULL`, so a row inserted without a handle keeps
the **email local part** as its public display name — the outing vector
`20260612180000_display_name_never_email.sql` exists to close. Generating the
username inside `handle_new_user` is what keeps that trigger firing on the
insert, which is why the one-screen signup depends on this migration landing
first.
