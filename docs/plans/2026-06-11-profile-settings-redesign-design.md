# Profile Settings Redesign — queer.guide

## Context

`/profile/settings` ([ProfileSettings.tsx](src/pages/ProfileSettings.tsx)) is a 5-tab administrative form (You / Preferences / Privacy / Account / Dating) with 3s-debounce auto-save. Goal: make it feel like part of the product, not a form. Six hard requirements: mandatory avatar (3 paths), pronouns combobox, occupation combobox (shared professions vocab), personalization moved in-context, mandatory permanent-ish username, personal-documents removal.

User decisions already made:
- **Documents:** remove personal docs only (`trip_documents` rows with `trip_id IS NULL`); trip-attached docs stay.
- **Scope:** whole settings IA restructured (Dating/Privacy content kept, re-homed).
- **Username format:** relaxed before mandatory rollout (3–20 chars, lowercase-normalized); existing usernames grandfathered.

## Assumptions (flagged)

- Page not inspected live; structure from code (`ProfileSettings.tsx`, `profileForm.ts`, settings tab components).
- `avatars` storage bucket exists (referenced in `AvatarSettings.tsx:99`, no migration found).
- `privacy_settings.pronouns_public` toggle exists but may be unwired in render sites.
- Trust-tier system (visitor→guardian, `useTrustTier.ts`) is live and usable as motivation surface.

---

## 1. Three divergent UX concepts

### Concept A — "The Card Is the Settings" (live-preview editing)
Your public profile card is rendered live at the top of the page, exactly as others see it. Every element on it (avatar, name, @username, pronouns, occupation, bio) is directly tappable; tapping opens a focused bottom sheet editing just that field, and the card updates live. Below the card: a short list of plain rows for non-visible stuff (account, privacy, notifications). Editing becomes "shaping what people see" rather than filling fields; the privacy payoff is immediate because the preview can toggle between "public view / community view / private view".

Structure: sticky `IdentityPreviewCard` → visibility-lens toggle → flat row list (Account, Privacy, Notifications, Dating opt-in) → preference mirror chips.

### Concept B — "Hub & Sheets" (overview dashboard, everything edits in focused sheets)
Settings collapses to a dashboard of compact summary cards, each showing *current values* (not inputs): Identity (avatar+name+pronouns+occupation), Account (@username, email), Privacy (one-line summary "Profile: community · Identity: friends"), Preferences (read-only mirror of in-context choices with "set where you search" links), Dating (opt-in state). Tapping a card opens a full-screen mobile sheet with only that domain's fields. Nothing on the top level is a form control — it's a glanceable state-of-your-account.

Structure: 6 summary cards in single scroll → per-card `Sheet` editors → completion ring integrated into Identity card.

### Concept C — "Profile Quests" (progressive, prompt-driven)
Settings becomes a feed of dismissible prompt cards driven by the existing trust-tier/completion system: "Add your pronouns — 30s", "Pick your avatar style", "Claim your @username (12 days left)". Completed items collapse into a compact "Your profile" summary at top. Preferences are never asked here at all — the feed only *reflects* what search/trips elicited in context. Strongest at converting the username/avatar migrations into engagement; weakest as a place to *find* a specific setting later.

Structure: summary header → prioritized prompt feed → "All settings" escape-hatch list.

### Recommended direction: **B as chassis, A's identity card as the hero, C's prompts as the migration vehicle**

- **B (Hub & Sheets)** is the chassis: it kills the form-feeling at the root (top level shows *state*, not inputs), is the best one-handed mobile pattern (full-screen sheets, one domain at a time), maps 1:1 onto shadcn `Sheet`/`Card`/`Command`, and preserves the existing auto-save loop per sheet.
- The Identity card at top is rendered as **A's live preview** (avatar, display name, @username, pronouns, occupation — what others actually see), with the public/community/private lens toggle. This is the single highest-leverage "product, not form" move and gives privacy controls a visible payoff.
- **C's prompt cards appear only when there's a gap**: unclaimed username, default avatar, unset pronouns. They are the carrier for the username claim flow and avatar nudge — temporary, not the permanent IA.
- Pure A fails for non-visible settings (privacy, notifications, account) — half the page has no "card element" to tap. Pure C makes settings un-navigable as a reference surface. The hybrid takes each where it's strong.

---

## 2. Information architecture

### Stays in settings (`/profile/settings`, single scroll, summary-cards → sheets)

1. **Identity card (hero)** — live preview: avatar, display name, @username, pronouns, occupation, bio excerpt. Visibility-lens toggle (eye icon: "view as public / community / private"). Tap any element → field sheet. Completion ring lives here.
2. **Prompt slot** (conditional) — at most ONE active prompt card: username claim > default avatar > pronouns nudge. Dismissible (re-surfaces weekly until resolved, except username deadline).
3. **Profile** card — bio, location, languages, website/socials, name details (first/last/chosen/pronunciation), DOB/age range, education. → sheet.
4. **Identity & Dating** card — opt-in state + one-line summary. → sheet containing current IdentityTab/RelationshipsTab/IntimateTab content behind the existing opt-in. Content unchanged, re-homed.
5. **Privacy** card — one-line state summary ("Profile: community · Identity: friends · Travel: public"). → sheet with existing visibility controls; ADD the lens-toggle link back to the Identity card preview.
6. **Account** card — @username (+ change policy state), email, mailbox forwarding, push notifications, danger zone. → sheet.
7. **Preferences (mirror only)** card — read-only chips of travel/search/accessibility prefs with per-chip deep links to where they're edited in-context. One "review all" sheet allows *removal* (clearing a pref) but not adding — adding happens in product surfaces.

### Moves out of settings (in-context capture)

| Preference | Captured/edited at | Mechanism |
|---|---|---|
| Search vibes (`profiles.interests`) | Search filter sheet | persistent chips, see §5 |
| Budget level | Search/marketplace price filter + trip planner budget step | "Save as my default" inline affordance |
| Travel interests, accommodation, transport, travel style | Trip planner creation flow + filter sheets | progressive elicitation, one question at the moment it's relevant |
| Accessibility needs | Venue/search accessibility filter + first venue-detail visit prompt | chips + payoff badges, see §5 |
| Home city / languages | Onboarding (`/onboarding/search`) stays; editable via Profile sheet | unchanged |

### Removed
- "Personalize your search" link-card (Preferences tab) — replaced by the mirror card.
- Personal documents (`DocumentsList tripId={null}`) — removed from settings entirely (§7).
- The 5-tab `Tabs` chrome itself.

---

## 3. Field spec — Avatar (mandatory)

### Mandatory-without-walls model
- **Default:** every account already gets a random BigHeads `avatar_config` at signup (`Signup.tsx:43`). Extend: backfill ALL existing avatar-less profiles with a deterministic builder config (seeded from user_id hash → stable, no two identical-by-default neighbors). `avatar_url` may stay null; `AvatarDisplay` renders builder config. Result: zero avatar-less users from day one, no blocking wall.
- **Nudge:** prompt card in settings + small dot on header avatar while `avatar_type` is the auto-assigned default. Never blocks.

### Chooser — one sheet, three segments (shadcn `Sheet` + `Tabs` as segmented control)
Current 4-tab `AvatarSettings` (Upload/Build/Initials/Random) is replaced. Initials/Random demoted to internal fallback/reroll, not user-facing paths.

**1. Upload**
- File picker / camera → client-side crop+zoom (square, pinch on mobile) → canvas resize to 512×512 webp (~50–150 KB) → upload to `avatars` bucket → `avatar_type='upload'`.
- New dependency needed: `react-easy-crop` (MIT, client-only, no network). Current flow has NO cropping (`AvatarSettings.tsx` uploads raw, 5 MB cap).
- States: idle → cropping (Save/Cancel) → uploading (spinner on preview) → done. Errors: too-large pre-resize cap 15 MB ("Image too large"), wrong type, upload failure (retry button, previous avatar untouched).

**2. Import (unavatar)**
- Single input: handle or email + source select (GitHub/Twitter/X/Instagram/Telegram/Gravatar-via-email). Explicit helper copy: "We look this up through our own server via unavatar.io. Your input is sent to unavatar.io from our infrastructure, never from your device."
- Preview before confirm; confirm → persists.
- States: idle → resolving (spinner) → preview (Use/Try another) → saved. Errors: not found ("No image found for that handle"), upstream timeout (retry).

**3. Create (simplified builder)**
- Exactly 4 choices: **Style** (6 curated BigHeads presets, carousel — reuse `AvatarQuickPick` visuals), **Skin tone** (existing pool), **Hair color** (existing pool), **One accessory** (none/glasses/earrings/hat — pick 4). Reroll button. Maps deterministically onto full `AvatarConfig` → stored in `avatar_config`, fully back-compat with `AvatarDisplay`. The 16-control `AvatarBuilder` is removed from settings (kept in codebase only if used elsewhere; otherwise delete).

### unavatar privacy architecture — **recommended: Worker proxy + R2 cache. Do it.**
- New route on the existing **`workers/image-cdn`** worker (reuse its fetch→R2→serve pattern, `workers/image-cdn/src/index.ts`):
  - `POST /avatar/resolve` (auth: Supabase JWT) `{source, identifier}` → worker fetches `https://unavatar.io/{source}/{identifier}?fallback=false` server-side → stores image in R2 `IMAGES` bucket under `avatars/{sha256(user_id+source+identifier)}.webp` → returns `https://img.queer.guide/avatars/{hash}.webp`.
  - `profiles.avatar_url` points at our domain; `avatar_type='unavatar'` (extend the CHECK that currently allows `upload|builder|gravatar`; migrate/repurpose dead `gravatar` value).
- Privacy properties: identifier never leaves the client except to our worker; no client→unavatar request; no hot-linking (third party can't see our users' page views); resolution is one-shot, then served from R2 forever; unavatar sees only our worker's egress IP.
- Residual disclosure (state honestly in UI + privacy policy): unavatar.io *does* receive the identifier from our server. Mitigation: user explicitly types the identifier for this purpose (consent by action) + helper copy. No background/automatic resolution ever (don't auto-try the account email).
- **No refresh job** — avatar frozen at import; user re-imports to update. Simpler, more private.

---

## 4. Field spec — Pronouns

- **Component:** multi-select combobox (shadcn `Popover`+`Command`, same chassis as [profession-autocomplete.tsx](src/components/ui/profession-autocomplete.tsx)). Curated suggestions: she/her, he/him, they/them, ze/zir, ze/hir, xe/xem, it/its, fae/faer, any pronouns, ask me. Free text via "Use '<input>'" row (cap 30 chars/entry, max 3 entries).
- **Ordered multi-select:** selection order preserved; chips reorderable by drag (and by remove/re-add as the accessible fallback). Display rule: join first segment of each set → ["she/her","they/them"] renders "she/they"; a single set renders in full ("they/them"); free text renders verbatim.
- **Storage:** new `profiles.pronoun_tags text[]` (ordered). Keep existing `profiles.pronouns text` as the denormalized display string, written on save — all current render sites keep working untouched. Migration backfills `pronoun_tags` by parsing existing `pronouns` text where it matches known sets; else `pronoun_tags = ARRAY[pronouns]`.
- **Optional + visibility:** field optional; wire the existing `privacy_settings.pronouns_public` to a per-field visibility select (public/community/private) directly inside the pronouns sheet row ("Visible to: …") rather than only in the Privacy sheet. The Identity-card lens preview reflects it.
- States: empty ("Add pronouns" ghost row on identity card) / set / error (free text >30 chars or >3 sets: inline message).

## 5. Field spec — Occupation

- **Component:** reuse `profession-autocomplete.tsx` as-is — Combobox sourced from the `professions` table via `useProfessions()` (single source of truth, zero duplication; vocab: 32 canonical terms + aliases, migrations `20260608200003/4`).
- **Free-text policy (documented decision): store as-is, never auto-normalize, never auto-insert into the shared vocab.**
  - `profiles.occupation` stores exactly what the user picked/typed. A user's self-description is identity data, not catalog data — silently rewriting "drag artist & nurse" to "Drag Queen" is wrong here even though it's right for Personalities.
  - Lightweight feedback loop instead: a read-only admin aggregate (view `occupation_freetext_candidates`: free-text values not matching `professions.name`/aliases, with counts) so editors can *manually* promote frequent terms into the vocab. No queue, no automation.
- Optional field. States: empty ("Add occupation") / suggestion picked / free text (rendered identically — no second-class styling) / cleared.

## 6. Field spec — Username (mandatory)

### Position: **stable, not immutable — max one change per 12 months, with a safety fast-track.**
Defense: on an LGBTQ+ platform, hard permanence is harmful — usernames chosen pre-transition can embed a deadname; forcing it forever is a real-world safety and dignity failure. But unrestricted change breaks @mentions, trust continuity, and invites impersonation. So: one self-service change per rolling 12 months; previous username reserved for 90 days and 301-redirected (`username_redirects` table, mirroring the existing `venue_slug_redirects` pattern); support/admin can fast-track outside the window for safety reasons (deadname, harassment, doxxing) — flagged in audit log, no questions stored.

### Format & validation (new, relaxed — per user decision)
- 3–20 chars; allowed: `a-z 0-9 _ .`; must start with a letter; must not end with `.` or `_`; no consecutive separators (`..`, `__`, `._`, `_.`). Regex: `^[a-z](?:[a-z0-9]|[._](?=[a-z0-9]))*[a-z0-9]$` + length check, plus 1–2 char rejection.
- **Normalization/Unicode policy: ASCII-only, lowercase-folded on input.** Unicode usernames invite homoglyph impersonation (а vs a) — unacceptable on a platform where impersonating a queer org/person causes harm. Unicode self-expression belongs in `display_name` (free Unicode, non-unique). Input is lowercased live; display always lowercase `@username`.
- **Uniqueness:** case-insensitive unique index exists (`profiles_username_lower_unique`); becomes plain unique on the lowercase-stored value. Additionally normalize separators for *collision* purposes: `mari.posa` vs `mari_posa` vs `mariposa` treated as colliding (store a `username_key` = stripped of `._`, unique index on it) — blocks lookalike-handle impersonation.
- **Reserved names:** new `reserved_usernames` table seeded with: route words (admin, settings, api, help, search, login, trips, events, venues, news, marketplace, …all top-level routes), brand terms (queerguide, queer_guide, official, support, moderator, staff), and a slur blocklist (source: product decision, see Open Questions). Checked inside `username_available()`.
- Grandfathering: all existing usernames (`[A-Za-z][A-Za-z0-9]{7,14}`) are valid under the wider rule after lowercase-fold; fold them in the migration; `username_key` backfilled.

### Display name vs username
`display_name`: free Unicode, 1–50 chars, non-unique, shown as primary label everywhere. `username`: machine-stable handle for @mentions, profile URL `/u/{username}`, uniqueness. Identity card shows both ("Mari ✨ · @mariposa").

### UX (in Account sheet + claim prompt)
Reuse `UsernameSelector` (LLM suggestions via `generate-usernames` fn + debounced `username_available()` RPC). States: idle → checking (spinner ≥400ms debounce) → available ✓ / taken ("@x is taken — try @x2, @x_y") / invalid (specific rule named: "usernames start with a letter") / reserved ("that name is reserved"). Change flow shows policy upfront: "You can change this once per year. Your old name is held for 90 days."

### Migration — existing users without usernames
1. **Claim window (60 days):** on next login, the settings prompt card + a one-time dismissible banner anywhere in-app: "Claim your @username". Pre-filled suggestion derived from display_name (slugified) or LLM suggestions. Email reminder at T-14d and T-2d (existing email_templates infra).
2. **Deadline behavior:** at T+60, auto-assign `{slugified display_name or 'member'}{4-digit}` (collision-resolved). Auto-assignment does **not** consume the once-per-year change — first self-service change after auto-assign is free.
3. **Collision handling during window:** first-claim-wins, atomic via the unique index (no holds/reservations).
4. **Enforcement:** `username NOT NULL` constraint only added by a final migration after backfill completes; signup flow already collects username (step 2) — make it required there at rollout start.

---

## 7. Personalization — in-context capture

### Two integration models considered

**Model 1 — "Settings as mirror".** All preference *capture* happens in product surfaces (filter sheets get a "save as default" affordance; trip planner elicits budget/style during creation; venue pages prompt accessibility needs once). Settings shows a read-only mirror card listing what's been learned, each item deep-linking to its source surface. Settings can clear a pref but never set one.

**Model 2 — "Traveling preference chips".** The user's saved prefs render as a persistent, editable chip row inside search/filter UI across search, map, listings, and marketplace ("wheelchair-accessible ✓ · mid-range · drag · trans-friendly"). Chips are live controls: tap to toggle off for this session, long-press/menu to edit or forget permanently. The same chip set IS the settings mirror card — one component, many surfaces.

**Recommendation: Model 2, with Model 1's "settings can only review/clear" rule.** Chips make preferences *visible at the moment they act* — that's what converts "creepy hidden personalization" into "my controls, traveling with me", which matters on a privacy-first product. Implementation reuses the existing facet-chip rendering in search and the `target_groups`/amenity vocab; storage consolidates on `profiles.travel_preferences` jsonb (already queried by search; the `user_travel_preferences` table duality is noted in Open Questions). Per-session toggle = local state; permanent edit = profile write.

### Progressive elicitation (both models need it)
- One-question prompts at moments of relevance, max 1 per session: first price filter use → "Make mid-range your default?"; first trip creation → budget/style step (already exists); first accessibility filter use → "Save these as your accessibility needs? They'll apply everywhere."
- Never elicit dating/identity fields contextually — those stay explicit-opt-in in settings.

### Accessibility needs — special care, visible payoff
- **Captured:** accessibility filter sheet (vocab: `amenities` table `kind='accessibility'`, ~15 terms via `useAmenityVocabulary`) + one-time prompt as above. Stored in `profiles.travel_preferences.accessibility_needs[]` (already exists).
- **Payoff surfaces (where the user SEES it working):**
  - *Venue cards & detail:* matched-needs badge — "✓ Step-free access — matches your needs" rendered from the venue's `accessibility_attributes` ∩ user needs; unmatched needs shown as "Not listed: hearing loop" (honest absence-of-data, not false negative). Builds on `AmenityDisplay`'s prominent accessibility block.
  - *Search:* accessibility chips pre-applied (visible, removable) — results honestly filtered, count shown.
  - *Travel guides / city pages:* accessibility section surfaces first when needs are set; city accessibility summary (count of accessible venues) prioritized.
  - *Trip planner:* itinerary candidates filtered + flagged the same way.
- **Privacy:** accessibility needs are health-adjacent — never public, never shown on profile, used only for the user's own ranking/filtering. Stated inline at capture: "Only you see this. We use it to rank and badge places for you."

---

## 8. Deprecation — personal documents

Scope: `trip_documents` rows with `trip_id IS NULL` + their storage objects. Trip-attached docs unaffected; `DocumentsList`, hooks, and `extract-document-fields` fn all stay (used by trips).

1. **T0 — notice:** settings card replaced by removal notice ("Personal documents are going away on <date>. Download yours until then."); email to affected users (those with ≥1 personal doc) via existing email infra. Stop accepting new personal-doc uploads immediately (`DocumentsList tripId={null}` becomes download/delete-only).
2. **T0→T+30 — export window:** "Download all" (sequential signed-URL downloads; no server-side zip needed — files are user's own, max 25 MB each). Per-doc download/delete stays.
3. **T+30 — verified deletion:** migration + script: delete storage objects (`trip-documents/{user_id}/{doc_id}.*` for affected ids) FIRST, then delete rows; post-delete verification query (`SELECT count(*) FROM trip_documents WHERE trip_id IS NULL` = 0; storage list cross-check) recorded in an audit doc (`docs/audits/`).
4. **Backups note (privacy-first honesty):** Supabase PITR/backups retain deleted data until retention expiry (project setting, ~7–35 days). User-facing copy: "Deleted documents disappear from backups within 35 days." Verify the project's actual retention before publishing the number.
5. **Code removal:** drop the settings embed (`ProfileSettings.tsx:303`), the `tripId: null` branch in `DocumentsList`/`useTripDocuments`, and the "personal" doc-type affordances. Keep table + bucket (trips use them).

---

## 9. Implementation skeleton (post-approval)

**DB migrations:** `pronoun_tags text[]` + backfill · username format/`username_key`/`reserved_usernames`/`username_redirects` + relaxed `username_available()` + fold existing · avatar_type CHECK extension (`unavatar`) · default-avatar backfill (seeded configs; batch ≤300 — `trg_search_documents_*` doesn't fire on profiles, but verify before bulk) · docs deletion (T+30) · `occupation_freetext_candidates` view.

**Worker:** `workers/image-cdn` — `POST /avatar/resolve` (JWT check, unavatar fetch, R2 put, URL return).

**Frontend:** new `SettingsHub` page (summary cards) + per-domain `Sheet` editors; `IdentityPreviewCard` with lens toggle; avatar chooser sheet (3 segments, `react-easy-crop` + canvas resize util); pronouns multi-combobox; occupation = existing `profession-autocomplete`; username claim prompt card; preference chip component shared by search/filter/mirror; accessibility payoff badges on venue cards/detail.

**Order:** 1) username migration machinery (longest user-facing window) → 2) avatar paths + proxy → 3) settings IA rebuild → 4) pronouns/occupation fields → 5) preference chips + payoff surfaces → 6) docs removal timeline runs in parallel from T0.

## 10. Verification

- Unit: username regex/normalization/collision-key cases; pronoun display-rule; crop/resize util output size.
- E2E (Playwright, `e2e/`): claim flow, avatar 3-path chooser, settings sheets keyboard-navigable.
- A11y: sheets focus-trapped, combobox `aria-activedescendant`, lens toggle announced, WCAG AA contrast (monochrome system already compliant); axe pass on the new page.
- Worker: resolve→R2→serve round-trip via `wrangler dev`; confirm no client→unavatar.io request in network panel.
- Prod check on queer.guide after deploy (per project rule): settings loads, sheets work one-handed on mobile viewport, avatar default visible for a fresh signup.

---

## Open questions (product decisions needed before implementation)

1. **unavatar sources:** allow email-based lookup (Gravatar) at all, or handle-only (GitHub/X/Instagram/Telegram)? Email-based sends the user's email to unavatar.io (via our proxy). Recommend handle-only default, email behind an extra confirm.
2. **Slur/abuse blocklist source** for reserved usernames — curate internally, or adopt an existing list (e.g. a maintained OSS blocklist)? Who maintains it?
3. **Username deadline auto-assign** (proposed) vs. soft-locking social features (mentions/posts) until claimed — acceptable to auto-assign a name the user didn't choose?
4. **Lookalike collision rule** (`mari.posa` blocks `mariposa`): accept the stricter rule, or plain uniqueness only?
5. **Default-avatar backfill timing:** assign generated avatars to ALL existing avatar-less users at rollout (recommended), or nudge-only and accept lingering avatar-less accounts?
6. **`react-easy-crop` dependency** (MIT, client-only, no network) — approve as the one new package?
7. **Travel-prefs storage duality:** consolidate `user_travel_preferences` table into `profiles.travel_preferences` as part of this work, or defer?
8. **Dating opt-in placement:** keep Dating as a settings card (proposed), or move opt-in to a dedicated `/dating` surface entirely?
9. **Documents export format:** sequential individual downloads (proposed, simplest) vs. server-side ZIP bundle (needs a new edge fn touching sensitive files)?
10. **Backup retention number** for the deletion notice — confirm the Supabase project's actual PITR/backup retention before publishing "within N days".
11. **Old-username redirect duration:** 90 days proposed — long enough? Should redirects be permanent for safety-changes (so old links never leak the new identity — or is that backwards: should safety-changes have NO redirect)? ⚠️ Recommend: safety fast-track changes get **no redirect** (linkability is the threat); normal changes get 90-day redirect.
12. **Trust-tier integration:** should completing identity fields feed the visitor→guardian tier (engagement lever), or keep tiers contribution-only?
