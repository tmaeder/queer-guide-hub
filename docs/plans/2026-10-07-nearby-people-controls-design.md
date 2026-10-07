# Nearby people compact controls design

## Problem

The embedded Nearby people surface currently renders every Role, Into, Age and
Body option as a permanently visible button. The four button clouds take more
space than the results and become difficult to scan as the vocabulary grows.

The Into control also uses the original 20-value `INTO_TAGS` fallback while
onboarding stores `intimate-*` unified-tag slugs. This can make a visible filter
fail to match a profile. Separately, the product already has a consent-forward,
grouped kink taxonomy with about 130 items, but Nearby people cannot use it.

## Chosen design

- Replace the four expanded button rows with a compact filter toolbar.
- Use a two-thumb slider for contiguous age bands and display the selected
  human-readable range.
- Use accessible multi-select menus for Role and Body, summarized by count or
  the selected value instead of listing every option at rest.
- Use a searchable, grouped Into picker backed by the existing kink taxonomy.
  Preserve the taxonomy's deliberate exclusions and consent-oriented labels.
- Show active selections as removable chips and expose one contextual Clear
  action.
- In embedded mode, remove the duplicated Intimate heading and keep only the
  result count, profile action and view switcher.
- Translate taxonomy item selections through their `unified_tag_slug` where
  available, and support legacy values during matching so existing profiles do
  not disappear.

## Data and interaction contract

- The discovery query continues to use server-side array overlap filters.
- Age handles snap to the existing age-band sequence; the inclusive band slice
  is sent to the query. Both endpoints remain keyboard operable.
- Role, Body and Into are multi-select controls. Closing a menu never clears a
  selection.
- Into search matches item and category labels. Groups remain visible when they
  contain matching items.
- Loading or failure of the full kink taxonomy falls back to the baseline Into
  list, so discovery remains usable.
- Filter triggers expose their selected count, active state and expanded state
  to assistive technology. Focus returns to the trigger after dismissal.

## Verification

- Component tests for compact rendering, age-range conversion, multi-select
  behavior, grouped kink search, legacy slug compatibility and reset.
- Existing intimate discovery and onboarding tests remain green.
- Typecheck, lint ratchet and production build pass.
- Browser verification at desktop and mobile widths covers keyboard focus,
  dropdown positioning, result updates, empty/loading/error states and the
  embedded cruising layout.
- After deployment, authenticated production E2E verifies the cruising map and
  Nearby people controls together.
