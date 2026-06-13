# Profile Ecosystem Rebuild — Declutter + Unify + Integrate

## Context

The user-profile surface of queer.guide is fragmented across 9 routes (`/me`, `/user/:userId`, `/profile/settings`, `/profile/footprint`, `/profile/footprint/:userId/public`, `/profile/tiers`, `/me/passport`, `/me/missions`, `/me/leaderboard`) plus `/news/me`, each with overlapping identity/gamification widgets. The `profiles` table carries ~150 columns of dating-app residue (zodiac, body type, kink, income, sleep schedule…) most of which is never rendered anywhere, plus 8 unused `*_encrypted` shadow columns and 4 stale JSONB bucket columns from a March 2026 half-finished normalization.

**Critical finding (privacy):** any authenticated user can `select=*` a public-visibility profile and read `kink_interests`, `bdsm_role`, `sexual_frequency_preference`, and the stale `dating_profile` JSONB snapshot — sexual data living on the row-level-readable `profiles` table instead of behind `intimate_profiles`' mutual-opt-in RLS. The declutter is a privacy fix, not just hygiene.

Per-user features that exist but never surface on the profile: favorites (7 tables), trips, reviews (no aggregation anywhere), submissions, news reading streak, friends, photos (partially).

**User decisions:** full rebuild including another pass at the 2026-06-11 settings redesign; deprecate unused DB columns (audit → archive → drop); balanced-hybrid identity (travel + community + opt-in dating); all four integrations (trips+favorites, contributions, gamification, social graph).

Two pre-existing bugs get absorbed: `/settings/privacy` linked from `MarketplaceMissions.tsx:191` 404s today; `ProfileTiers.tsx` uses `motion/react` + `AnimatedBeamConnector` (design-system violation).

---

## Target Information Architecture

**4 profile routes, down from 9+:**

| Route | Renders | Notes |
|---|---|---|
| `/me/:tab?` | `ProfilePage` (own mode) | Stable own-profile URL; bottom nav unchanged |
| `/user/:userId/:tab?` | `ProfilePage` (public mode, own mode if self) | All existing inbound links keep working |
| `/settings` | `Settings` (relocated ProfileSettings) | `?section=` deep links to sheets |
| `/intimate/*` | unchanged | Opt-in dating module, stays separate |

Tabs: **Overview · Travel · Contributions · Progress** (Progress = own-only; redirects to Overview on others' profiles).

**Redirects (all old routes survive as `Navigate`):**
- `/profile/footprint` → `/me/travel`; `/profile/footprint/:userId/public` → `/user/:userId/travel`
- `/me/passport`, `/me/missions`, `/me/leaderboard`, `/profile/tiers`, `/news/me` → `/me/progress`
- `/profile/settings` → `/settings`; `/settings/privacy` → `/settings?section=privacy`
- Re-point existing legacy chains (`/me/settings`, `/me/tiers`, `/venues/passport`, `/venues/leaderboard`)

`/friends`, `/favorites`, `/trips`, `/feed` stay standalone task surfaces — the profile **summarizes and links** to them.

## Page Design

**ProfileHeader** (all tabs): `AvatarDisplay`, display_name, @username, pronouns, location, joined date; `UserModeBadge` + `TrustTierBadge` + compact `ScoreLevelChip`; `StatusBar` (editable own / read-only public); bio; `SocialLinksDisplay`. Actions — others: `StartConversationButton`, `UserRelationshipActions`, share, report; own: "Edit profile" → `/settings`, `ViewAsToggle`, `CompletionRing` if incomplete.

**Overview:** about facts via trimmed `SecureProfileViewer`/`PrivacyGuard`; `ActivityStrip`; new `SocialSummaryRow` (friends/groups/posts counts → links); own-only: `CompletionNudge` + gap-prompt slot (moved here from settings).

**Travel:** footprint components moved wholesale from `src/components/footprint/` (`StatsPanel`, `BadgeRow`, `YearHeatmap`, `EntityMap`, `CityCompletionList`, `ShareControls`, `YearInReview`); new `TripsSummaryCard` (`useTrips`, next 3 trips → `/trips`); new `FavoritesSummaryCard` (`useFavorites`, counts → `/favorites`); `PreferencesMirrorCard` with edit link. Public lens: `footprint_public_stats` RPC honoring per-stat `share_*` flags (logic from `FootprintPublic.tsx`).

**Contributions:** stacked sections — Reviews (new `useUserReviews` — first-ever aggregation), Photos (`PhotoGallery`), Posts (`UserPostsList`), Submissions (own-only, new `useUserSubmissions`). "No X yet" empty states.

**Progress (own-only, hard-private):** `ScoreLevelChip` full + `DomainBreakdown`; `AchievementsGrid` + `VisitedVenuesList` (extracted from `VenuesPassport.tsx`); `StreaksPanel` (guide streak + news streak from `MarketplaceMissions.tsx`/`NewsMe.tsx`); `LocalSupporterBlock`; `LeaderboardPanel` (from `VenuesLeaderboard.tsx`); `TrustTierLadder` (from `ProfileTiers.tsx`, **motion removed**, static Progress bars).

## Settings Second Pass

Keep the hub-and-sheets architecture. Changes:
- **5 sheets:** Profile (BasicInfoTab trimmed + `SocialLinksManager` finally mounted + languages) · Identity (IdentityTab + folds in the 3 kept relationship fields `romantic_orientation`/`current_relationship_status`/`relationship_style` + IntimateTab opt-in entry) · Privacy (three-lens rework) · **Travel preferences (new sheet — `TravelPreferencesEditor` finally gets a permanent home)** · Account (unchanged). Avatar stays its own sheet.
- **Delete `RelationshipsTab.tsx`** — all kink/sexual fields leave settings; a card links to `/intimate` onboarding instead.
- Remove 9 dating keys from save payload (`ProfileSettings.tsx:269-305`) and `src/types/profileForm.ts`: romance_style, physical_affection_preference, sexual_frequency_preference, communication_about_sex, sexual_exploration_openness, sexual_health_status, kink_experience_level, bdsm_role, jealousy_comfort_level.
- Remove orphaned `RecognitionMailingForm` (imported, never rendered); delete component.
- Gap-prompt moves to profile Overview; `DocumentsList` deprecation card stays until 2026-07-11.

## Privacy Model — three-lens system

Lenses: `public` · `community` (signed-in) · `private`. Section gates in `privacy_settings`: `profile_visibility` (whole profile), `identity_visibility`, `travel_visibility` + per-stat `share_*`, new `contributions_visibility`, new `social_visibility`. Progress is hard-private. `coming_out_status` renders on no lens but "You".

**`ViewAsToggle`** on own header: "You · Community · Public" segmented control re-rendering the page through the chosen lens (lens prop flows into `PrivacyGuard` + section gates). Hidden sections collapse to "Hidden at this visibility" + link to privacy settings. Biggest trust win for a queer platform — privacy becomes legible.

Notes: `validate_privacy_settings` trigger only fills defaults when empty (verified, baseline L13483) — new keys are additive-safe. It calls `log_enhanced_security_event` (the 2026-06-11 profile-save-404 incident fn) — regression-check profile saves after any change. Verify live whether `profile_visibility` is boolean or string (baseline default is boolean `false`, RLS policy reportedly compares `= 'public'`).

## DB Declutter — three buckets

**KEEP:** account/core (all username v2 + avatar + pronoun_tags columns untouched), core queer identity (gender_identity, sexual_orientation, coming_out_status, romantic_orientation, chosen_family_status, disability_status, neurodivergent_status, cultural_background, current_relationship_status, relationship_style — privacy-gated, NOT clutter), personalization (travel_preferences, languages, interests, accessibility_needs), plus phone/education/date_of_birth/age_range/website/is_business/mailbox_address.

**MOVE → `intimate_profiles`** (only `WHERE opted_in_at IS NOT NULL`; non-opted-in data preserved in attic only — opt-in contract): kink_interests→`into_tags`, bdsm_role→`role`, boundaries_and_limits→`limits`, protection_preferences+sexual_health_status→`safer_sex_prefs`, and 14 dating-pref scalars/JSONBs → new `intimate_profiles.dating_prefs jsonb`.

**DROP (after attic archive):** 8 `*_encrypted` shadows; 4 stale JSONB buckets (`physical_attributes`, `lifestyle`, `dating_profile`, `identity_details` — privacy hazard, contain March kink snapshot); appearance (height_cm, body_type, hair/eye color, ethnicity, zodiac_sign, personality_type); lifestyle (smoking/drinking, diet/food, exercise, sleep, children/pets, hobbies, favorite_*); work/financial/housing (industry, company, job_title, work_schedule, income_range, financial_situation, housing_situation, neighborhood_preference, willing_to_relocate, transportation_method); beliefs (political_views, religious_beliefs, life_philosophy); community/activism arrays (zero code usage — attic preserves them); mental-health/safety fields; emergency_contact_*; legacy (relationship_status, sexual_orientation_details, relationship_goals*, background_check, photos_visibility — verify-then-drop); stub `get_secure_profile_data()`.

**Validated safe:** `get_public_profile_safe`, `public_profiles` view, `can_view_sensitive_profile_data` reference only KEEP fields. Profiles is NOT in search_documents sync; only trigger is `validate_privacy_settings_trigger`. Only edge fn reading beyond core is `recommendation-engine` (travel_preferences — KEEP). Watch item: 3 `algolia_supabase_connector_*` roles have SELECT on profiles — confirm dead before drops (dashboard check; algolia-sync is deprecated).

**Migration mechanics:** `DROP COLUMN` is metadata-only (instant, no rewrite, no disk spike — do NOT `VACUUM FULL` on this disk-constrained instance). Attic uses `jsonb_strip_nulls` so it stores only populated values — run data-census + disk pre-flight first. 14-digit versions after `20260612160200`, never reused, forward-only.

```sql
-- 20260613100000_profiles_attic.sql: profiles_attic(user_id PK, archived_at, reason, data jsonb)
--   RLS forced, ZERO policies, REVOKE ALL from anon+authenticated (service_role only). INSERT…SELECT jsonb_strip_nulls(...).
-- 20260613100100_intimate_migrate_dating_fields.sql: ADD dating_prefs jsonb; array-union merges; WHERE opted_in_at IS NOT NULL.
-- 20260614100000_profiles_drop_residue.sql: encrypted shadows + lifestyle + appearance + beliefs + work + emergency + community + mental-health.
-- 20260614100100_profiles_drop_dating_and_buckets.sql: kink/dating columns + 4 JSONB buckets + legacy; DROP FUNCTION get_secure_profile_data.
```

**Ordering constraint (load-bearing):** PostgREST rejects an entire upsert containing an unknown column → frontend must stop writing dating fields and be verified live on queer.guide BEFORE drop migrations merge.

**Rollback:** attic is the restore source (`ADD COLUMN` + `UPDATE … FROM profiles_attic` snippet documented in migration header). Retain ≥90 days; final `DROP TABLE profiles_attic` migration ~2026-09-15. Intimate move is non-destructive (union/additive).

## File Migration Map

**New:** `src/pages/profile/ProfilePage.tsx`; `src/components/profile/{ProfileHeader,ViewAsToggle,SocialSummaryRow}.tsx`; `src/components/profile/tabs/{OverviewTab,TravelTab,ContributionsTab,ProgressTab}.tsx`; `src/components/profile/travel/{TripsSummaryCard,FavoritesSummaryCard}.tsx`; `src/components/profile/progress/{AchievementsGrid,VisitedVenuesList,StreaksPanel,LocalSupporterBlock,LeaderboardPanel,TrustTierLadder}.tsx` (extractions); `src/components/profile/contributions/{UserReviewsList,UserSubmissionsList}.tsx`; `src/hooks/{useUserReviews,useUserSubmissions,useSocialSummary}.ts`; `src/pages/Settings.tsx` (moved ProfileSettings).

**Modified:** `src/routes.tsx`; `src/components/layout/MobileBottomNav.tsx` (matchPrefixes); `src/components/profile/settings/{BasicInfoTab,IdentityTab,PrivacyTab}.tsx`; `src/types/profileForm.ts`; `src/hooks/useSecurePublicProfile.tsx`; `src/components/profile/SecureProfileViewer.tsx` (lens prop); `src/components/security/PrivacyGuard.tsx` (lens override, additive); `src/components/footprint/ShareControls.tsx`; `src/hooks/useAuth.tsx` (stray `looking_for`); regen `src/integrations/supabase/types.ts` after drops.

**Deleted (each after its redirect lands):** `src/pages/{Me,UserProfile,VenuesPassport,MarketplaceMissions,VenuesLeaderboard,ProfileTiers,NewsMe,ProfileSettings}.tsx`; `src/pages/profile/{Footprint,FootprintPublic}.tsx`; `src/components/profile/settings/RelationshipsTab.tsx`; `src/components/profile/RecognitionMailingForm.tsx`; later `AchievementsRow`/`MissionsRow`/`CompletionNudge` if unreferenced.

## Phasing (each phase = one shippable PR; repo auto-lands claude/*)

**Phase 0 — DB audit (read-only, no PR).** Run pg_depend view-dependency query, pg_proc body grep, trigger/policy/index/publication/column-grant checks, data census, disk pre-flight (queries in DB plan above). Confirm Algolia connectors dead. Confirm `profile_visibility` boolean-vs-string.

**Phase 1 — Privacy fix: settings slim + attic + intimate move (PR A).** Frontend: remove 9 dating fields from profileForm.ts + save payload; delete RelationshipsTab (fold kept fields into IdentityTab + intimate link card); remove RecognitionMailingForm. DB: attic migration + intimate move migration. Verify profile save on prod queer.guide.

**Phase 2 — Column drops (PR B).** Two drop migrations + `supabase gen types`. Merge only after Phase 1 verified live. Smoke: `get_public_profile_safe`, profile save, /intimate.

**Phase 3 — Profile shell + Overview.** ProfilePage + ProfileHeader + OverviewTab + SocialSummaryRow; `/me` + `/user/:userId/:tab?` wired; delete Me.tsx + UserProfile.tsx (old dead Identity/Contact stub-tabs gone). Test inbound links from PostCard/CommentsSection/UserDirectory.

**Phase 4 — Travel tab.** Footprint move + trips/favorites cards + redirects + delete 2 footprint pages. Test public lens honors share_* flags.

**Phase 5 — Progress tab.** 6 panel extractions + redirects (`/me/passport|missions|leaderboard`, `/profile/tiers`, `/news/me`, legacy chains) + delete 5 pages + motion removal.

**Phase 6 — Contributions tab.** New hooks + lists; Photos/Posts move in.

**Phase 7 — Settings structural pass.** `/settings` rename + redirect; Travel-preferences sheet; PrivacyTab three-lens rework (+ new `contributions_visibility`/`social_visibility` keys); ViewAsToggle on profile. Legacy `?tab=` deep links keep working via extended map.

**Phase 8 — Sweep.** i18n keys (groups: `profile.tabs.*`, `profile.header.*`, `profile.travel.*`, `profile.contributions.*`, `profile.progress.*`, `settings.sheets.*`, `settings.privacy.lens.*`) — en authored in-PR, 10 locales via existing translate-i18n pipeline; redirect audit; dead-component removal; sitemap/useMeta canonical updates. Schedule attic deletion migration ~2026-09-15.

## Verification

- After every phase: `npm run build && npm run typecheck && npm test`; deploy; verify on **production queer.guide** (CF Pages), not just localhost — check `wrangler pages deployment list` if auto-deploy lags.
- Phase 1/2 DB: profile save round-trip on prod (regression-check `log_enhanced_security_event` path); `SELECT get_public_profile_safe('<uuid>')`; verify attic has 0 policies + 0 anon/authenticated grants; verify a non-owner `select=*` on a public profile no longer returns kink/dating data.
- Privacy lens: e2e — same profile viewed signed-out vs community vs owner; ViewAsToggle parity with actual public render.
- Redirects: hit every old URL, confirm 200 destination.
- `graphify update .` after code changes.

## Key references

- Plans agents validated against: baseline.sql (profiles L17651, RPCs L7111/L1976, policies L29637, grants L34283), `20260330400000_cms_tables_and_profiles_normalization.sql` (stale buckets), `20260514210000_intimate_profile.sql` (move target), `src/routes.tsx:510-524`, `src/pages/ProfileSettings.tsx:269-305`, `src/types/profileForm.ts`.
- Memory gotchas honored: disk-constrained DB, migration version discipline, batch-update search-trigger storms (N/A — profiles not in search sync), worktree push `--no-verify`, auto-land branch behavior.
