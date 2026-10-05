# Rounded, borderless UI completion

## Objective

Make the user-facing interface obey two global visual invariants:

1. Decorative thin borders and hairline separators do not render.
2. Every visible UI surface has intentionally rounded corners. No filled or elevated product surface may expose a sharp corner.

The supplied Queer Guide subway-map templates remain the visual authority for the radius ladder: 26px for page-level panels, 18px for cards and fields, 12px for controls and rows, and 9px for compact badges and marks.

## Chosen approach

Use a shared rendered-surface contract plus targeted component repairs.

- Strengthen the global CSS fallback so filled and elevated media wells, navigation states, fixed utilities, banners, and nested surfaces receive a semantic radius even when a legacy call site omitted one.
- Replace decorative separators with spacing, grouped rounded plates, or tonal surface changes.
- Repair partial-radius media wells whose square lower corners are visible while loading or when images are missing.
- Keep genuine information geometry: focus indicators, subway tracks, station rings, map/chart marks, progress indicators, and print-only document rules. These are not decorative UI frames.
- Expand runtime tests to scan the complete representative public-route set at desktop and mobile sizes, checking all visible surfaces and all visible thin borders rather than only selected controls or legacy hairline classes.

## Rejected approaches

- A blanket `border: 0` and `border-radius` rule on every DOM node would corrupt maps, charts, tables, progress indicators, and focus visibility.
- Rewriting every page component would create unnecessary churn and make the invariant harder to maintain.

## Verification contract

- Static scan: no non-semantic radius utilities or raw zero radii on product surfaces.
- Runtime scan: every visible filled/elevated surface at least 24×20px has a minimum exposed radius of 8px, with composite table rows evaluated by their outer endpoints.
- Runtime scan: no visible 1–2px decorative border or separator remains; only explicit focus and information-geometry exceptions are allowed.
- Desktop and 390px mobile passes across the representative public routes.
- Existing unit, typecheck, lint, build, accessibility, and production E2E gates remain green.

