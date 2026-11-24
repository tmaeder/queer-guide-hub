# Strict mutual dating matching

Approved by the user on 2026-11-24. Requirements remain strict; widening is an explicit, separate settings change.

## Contract

One server-side eligibility predicate is authoritative for dating discovery, detail, recommendations, couple cards and likes. Check both directions before ranking or limiting. Unknown required answers fail closed. Preferences affect ranking only. Never fall back to an unfiltered discovery view on errors or missing ranks.

Separate self-description, partner requirements, private matching use and profile display. Sexual/romantic orientation, gender, pronouns, flags, disability, neurodivergence and coming-out status do not imply attraction or availability. Use explicit connection goals and partner preferences. Romantic discovery can be enabled without an intimate/anatomy profile.

Requirements cover gender, age, relationship style/status, goals, location/distance, sexual position and power dynamics separately, activities, protection boundaries and optional body preferences. Optional activities never veto a person; required activities must not conflict with a boundary. Chemistry/checklist, cultural affinities and hanky inputs require separate matching consent on both sides. Health status is never a safety score.

The settings editor distinguishes Required / Preferred / No preference and explains missing answers. Private criteria are never returned in candidate explanations. Return a generic mutual-requirements explanation instead of an unvalidated percentage or detailed chemistry score.

## Delivery and validation

Add private matching settings with self-only RLS, validated rules and explicit adult/discovery consent. Migrate no sensitive matching consents implicitly. Route existing dating entry points through the shared predicate; preserve non-dating modes and existing conversations. Invalidate discovery/detail queries after settings and profile mutations. Empty states link to review requirements without modifying them.

Verify executable SQL scenarios on an isolated PostgreSQL instance, including reverse preferences, unknown values, optional vs required activities, consent revocation, direct endpoint access, couple membership and caller impersonation. Verify UI saves, errors, cache invalidation and both deck/grid behavior with focused frontend tests and type/lint checks.

## Production integration and verification

The release is based on production commit fc43da08, preserving the current Meet UI, saved seeking editor, full kink taxonomy and hanky filters. Intimate profiles use auth user IDs; likes and passes use profile IDs. The new RPCs bridge those spaces explicitly.

Saved seeking values remain strict requirements in both directions alongside the new Required / Preferred / No preference rules. Existing saved filters cannot be relaxed by clearing a temporary discovery filter. New permissions for private identity, interests, checklist, hanky chemistry and culture remain opt-in. Anatomy display still requires mutual intimate-profile eligibility; romantic discovery can be enabled independently.

`dating_private.pair_ok` owns eligibility for discovery, detail and likes, including profile audience, moderation, blocks, expiry, live-presence safety and hidden test accounts. Request filters are evaluated before ranking and limits. Ranking stays private; the UI does not claim compatibility percentages. Couple/wing integration definitions activate only if those existing modules are present; the release does not create or enable unrelated social modules.

Validation:

- Production build passed and the repository typecheck reported no new errors (596 baseline errors).
- All 36 focused React tests passed, including the existing dating cards and profile tab.
- The disposable PostgreSQL harness passed reciprocal, unknown-answer, consent, privacy, boundary and seeking tests. Run with `PG_BIN=/path/to/postgresql/bin node scripts/test-dating-matching.mjs`.
- The complete migration passed a rolled-back execution on the actual production schema. A second rollback-only check used existing test accounts to exercise eligibility, reciprocal requirements, saved seeking, discovery/detail exclusion and rejected likes. No test changes were retained.
- `supabase/tests/strict_mutual_dating_production_preflight.sql` records that rollback-only check for post-deploy verification.

Deployment and live browser verification are tracked in this chat.
