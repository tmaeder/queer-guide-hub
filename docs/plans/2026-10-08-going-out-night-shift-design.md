# Going Out: Night Shift design

## Goal

Turn `/going-out` from a sparse directory page into an unmistakably nocturnal, high-energy editorial surface while preserving its current data sources, URLs, accessibility semantics, and honest coverage messaging.

## Direction

Night Shift extends Queer Guide's transit identity into an after-dark visual system. The page body uses a near-black canvas, warm-white type, Queer Guide pink as its primary accent, and the existing multi-colour transit artwork only where the product already supplies it. Oversized condensed typography, route-line navigation, and departure-board event rows provide the character; decoration remains subordinate to useful venue and event information.

## Page structure

### Hero

- Replace the large empty light hero with a compact, full-width midnight panel.
- Keep the eyebrow and headline, but add a pink route graphic and direct paths to venues and events.
- Preserve the city-aware title and destination link behavior.

### Section navigation

- Render the sticky section navigation as a transit route.
- Treat each anchor as a station and visibly fill the active station as the reader scrolls.
- Keep the existing anchored-section behavior, URL synchronization, and keyboard interaction.

### Where to go

- Present loaded venues in an asymmetric nightlife rail using the existing `VenueCard` data.
- Replace the unlocated empty sentence with a composed discovery panel that links to the venue directory and map.
- Do not add an “open now” filter because opening-hours coverage is too sparse.

### What's on

- Restyle upcoming events as a live departures board with stronger date, title, and city hierarchy.
- Retain the coverage caveat and fallback behavior.
- Use crisp hover and focus states rather than decorative animation.

### Before you go

- Integrate the existing gated-content notice and rights link into a high-contrast signal panel.
- Keep the language direct and avoid alarmist styling.

### Elsewhere

- Promote destination cities into large station tiles.
- Use existing `CityNetwork` illustrations as primary graphics rather than small decoration.
- Use a horizontal snap rail at narrow widths and an asymmetric grid at wider widths.

## Visual system

- Canvas: near-black, tinted toward warm charcoal rather than pure black.
- Type: warm white with muted grey supporting copy and the existing display face for headings.
- Accent: Queer Guide pink; semantic safety colors remain reserved for true status messaging.
- Surfaces: mostly square or lightly rounded editorial panels, avoiding generic floating cards.
- Texture: subtle, non-interactive grain and route-line geometry; no stock photography dependency.
- Motion: short line reveals and 2–3px hover movement, disabled under reduced-motion preferences.

## Responsive and accessibility behavior

- Collapse departure rows without hiding date or city information.
- Make destination tiles horizontally scrollable with scroll snapping on small screens.
- Keep the route navigation touch-friendly and keyboard accessible.
- Preserve heading order, list semantics, focus visibility, contrast, and reduced-motion support.
- Ensure the page remains useful when location, venue, event, or city data is missing.

## Scope

This is a page-specific redesign. Shared data hooks and routing remain intact. Shared layout components may gain optional styling hooks, but their default rendering and all other intent pages must remain unchanged.

