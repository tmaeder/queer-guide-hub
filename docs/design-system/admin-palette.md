# Admin chromatic palette (documented exception)

Admin/staff-only surfaces are the **only** place chromatic colors
beyond brand magenta + error red are allowed.

## What's monochrome

The `--cat-*` design tokens (`--cat-venues`, `--cat-events`, …) all
resolve to brand magenta in both light and dark themes. Use them
for content-type accents in admin sidebars and chips — they read
monochrome to users but stay token-driven so a future product
decision can re-color them centrally.

## What's chromatic

Admin **status / data-viz** colors are hardcoded hex by design:

| Use | Hex (light + dark) | Rationale |
|---|---|---|
| Success / completed | `#10b981` | Universal "good" green |
| In progress / running / info | `#3b82f6` | Universal "active" blue |
| Pending / queued / warning | `#f59e0b` | Universal "attention" amber |
| Failed / error | `#ef4444` | Universal "bad" red |

These are functional indicators, not branding. Adopting brand
magenta for "running" would lose the conventional traffic-light
mapping and make pipeline dashboards harder to scan. Keep these
exceptions confined to:

- `src/components/admin/ModerationQueue.tsx`
- `src/components/admin/WorkflowDashboard.tsx`
- `src/components/admin/NewsQualityReviewTab.tsx`
- `src/components/admin/AudioManager.tsx`
- `src/components/admin/CloudflareDashboard.tsx`

## Rule

If a non-admin surface (anything reachable without `is_admin` or
`is_moderator`) needs more than two colors, the design is wrong.
Use icons, weight, density, and copy to differentiate before
reaching for a new hue.
