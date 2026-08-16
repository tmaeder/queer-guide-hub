# Pride Flags + Hanky Code integration — design

Approved 2026-08-16 (brainstorm session). Phased: glossary reference layer →
profile identity flags → minimal discovery integration.

## Decisions (user-locked)

- **Literal colours** via the functional-categorical-scale ESLint exception —
  the colour IS the content; a monochrome trans flag is wrong information.
  Hexes live only in `src/lib/flags/**` (allowlisted in BOTH `no-restricted-syntax`
  blocks); components take colours as props. Every hex checked against the
  Wikimedia Commons SVG or designer's spec at curation time.
- **Hanky codes are reference-only.** No signaling feature, ever. The meanings
  table on `/tags/handkerchief-code` sits behind the existing 18+ affirmation,
  band-level; Safe Mode ON shows a note instead. `is_adult` was rejected: the
  page gate is category-driven so it would not gate the page, and it WOULD
  hide the term from Safe-Mode discovery — hiding queer history instead of its
  explicit payload. The tag was already `is_sensitive` with topics [bdsm, fetish].
- **Flag data is a committed TS const** (`tagRightTopics` precedent): small,
  consequential, hand-curated vocabulary; no external source can sync it, so a
  DB table buys nothing. No enrichment sweep — additions are hand-researched.
- **Seed flag tags** so every flag has a glossary destination: 17 slugs upserted
  under Symbols & Flags (migration `20260910171943`). Several already existed
  as deprecated rows; the upsert reactivates them. The conflict-update must
  never set `name` — `normalize_tag_input` re-slugs on rename (measured:
  renaming 'Pride Flag' moved the row to `rainbow-pride-flag`).
- **Profile flags default visibility: public** (pronouns precedent), per-field
  `privacy_settings.flags_visibility`, cap 8.

## Shape

- `src/lib/flags/prideFlags.ts` — 17 flags: stripes (hex + weight + meaning),
  typed overlay union (chevron / circle / triangle / heart / paw), designer,
  year, `flagTagSlug` (tag that IS the flag) + `identityTagSlugs` (tags that
  HAVE it). Flags whose designer declined stripe meanings (leather, bear)
  carry a note instead — inventing meanings is curation fraud.
- `src/lib/flags/hankyCode.ts` — classic tier = the ten-colour Townsend core
  (Leatherman's Handbook II, 1983); extended tier = six common later
  additions; copy says meanings varied by city and decade.
- Components (`src/components/tags/`): `FlagSwatch` (SVG from data, ink
  border, meanings never colour-only), `TagFlagBand` (full band, self-selects
  via `flagByTagSlug`), `TagFlagRailCard` (identity pages), `TagHankyCodeBand`
  (Safe-Mode note → 18+ reveal → classic/extended table).
- Phase 2: `profiles.identity_flags text[]` + `get_public_profile_safe`
  gating + IdentityTab picker + chips.
- Phase 3: flag wall on `/tags/c/symbols-flags` only. Explicitly NOT doing:
  flag swatches on TagChip/autocomplete (would chromatize the deliberately
  monochrome tag system), marketplace taxonomy changes (regex already bins
  flags/bandanas; relevance prompt already scores them HIGH), live hanky
  signaling.

## Verification

Unit: `src/lib/flags/__tests__/flags.test.ts` (unique ids/slugs, hex format,
no slug on both sides of the link relation). Visual: leather (heart), progress
(chevron), intersex (ring) verified; hanky gate flow (Safe Mode → note,
gate → modal → table) verified. Prod check after deploy: `/tags/lesbian`
rail card, `/tags/progress-pride-flag` band, `/tags/handkerchief-code` gate.
