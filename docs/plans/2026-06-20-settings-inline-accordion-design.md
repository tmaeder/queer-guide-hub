# Settings: inline accordion (no pop-overs)

**Date:** 2026-06-20
**Page:** `/settings` (`src/pages/Settings.tsx`)

## Problem

Section editors on `/settings` open in a bottom `Sheet` (modal pop-over). They
should open inline, on the page itself.

## Decision

Replace the `Sheet` with a **single-open accordion**. Each summary card becomes
an accordion header; tapping it expands the editor inline directly below, inside
the same bordered container. Opening another collapses the previous one.

## Design

- Reuse the existing `Collapsible` primitive (already imported).
- One section open at a time — controlled by the existing state (`openSheet` →
  `activeSection`).
- Open card gets a stronger border so it reads as active; chevron rotates.
- On open via card, hero button, or `?section=` deep link → scroll the header
  into view.
- Editors are **unchanged** — `BasicInfoTab`, `IdentityTab`+`IntimateTab`,
  `PrivacyTab`, `TravelPreferencesEditor`, account panels — just relocated from
  the sheet body into the accordion body.
- **Avatar** (opened from the hero, not a card) renders as an inline panel
  directly under `IdentityPreviewCard` when active.
- **Save status:** the fixed bottom status bar is no longer covered by a sheet,
  so the duplicated in-sheet `SaveStatusLine` is removed. One bar, page-bottom.
- Deep links (`?section=`) and the `/profile/settings` redirect are preserved.

## Out of scope (YAGNI)

No multi-open, no sub-routing, no editor rewrites, no new components.
