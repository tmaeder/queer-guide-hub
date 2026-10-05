# Ambient Trip Layer Rollout

## Release control

The ambient trip layer ships behind `VITE_AMBIENT_TRIP_RELEASE`:

| Value | Enabled capability | Safe rollback behavior |
| --- | --- | --- |
| `1` | Shared capture actions, sign-in resume, direct add, Undo and baseline telemetry | Context and workspace restructuring remain hidden. |
| `2` | Release 1 plus Trip Dock, contextual Travel and persistent Hub trips | Workspace renders its parity-preserving all-tools view. |
| `3` | Release 2 plus URL-backed Plan, Prepare and Together sections | Fully shipped experience. |

Unset defaults to release 3. Invalid values fail closed to release 1. The legacy
`VITE_TRIP_CONTEXT_BAR=off` switch remains an emergency dock-only kill switch.

Promote one stage at a time. Hold each stage for at least one normal traffic cycle and
compare device, surface, authentication state and trip phase before promotion. Roll back
the build-time value if a guardrail trips; no data migration is involved.

## Dashboard definitions

Use consented Umami events plus the existing `trips` and `trip_places` timestamps.
Every new client event includes `device`, `locale` and `online`; capture events also include
`source` and `auth_state`, while dock/workspace events include phase where applicable.

| Metric | Definition | Target / guardrail |
| --- | --- | --- |
| Trip starts per eligible discovery session | Sessions with `trip_created` divided by sessions with `trip_intent_started` from discovery sources | +20% versus the frozen two-week baseline |
| First-item activation | Trips whose first `trip_places.created_at` is within 24 hours of `trips.created_at` | +25% versus baseline |
| Seven-day return | Creators returning to a trip workspace 1–7 days after creation | +15% versus baseline |
| Direct-add failure | `trip_item_add_failure / trip_item_add_attempt` | Alert above 3% for 30 minutes |
| Direct-add Undo | `trip_item_add_undo / trip_item_add_success` | Alert above 5% for 24 hours |
| Resume completion | `trip_intent_resumed / signed-out trip_intent_started` | Alert on a 20% day-over-day drop |
| Dock reliability | `trip_dock_load_failure / trip_dock_open` | Alert above 2% for 30 minutes |
| Booking conversion | Existing `affiliate_click` sessions divided by trip workspace sessions | Monitor by phase and device |
| Page performance | Existing Web Vitals for `/travel`, `/hub/plans` and `/trips/:id` | Alert on >10% LCP or INP regression |

Freeze the pre-release comparison window before enabling release 1. Exclude automated
clients and users without analytics consent. Use database timestamps—not client events—for
first-item latency so consent does not bias activation.

## Promotion checklist

1. Release 1: confirm sign-in resume, duplicate handling, direct add and Undo on venue,
   event, hotel, search, map, Saved, Pride and recommendation surfaces.
2. Release 2: confirm trip details are not requested until the dock opens; verify mobile
   safe areas, desktop sticky offset, Hub portfolio loading/error/empty states and contextual
   Travel copy.
3. Release 3: confirm every former More tools capability appears under Plan, Prepare or
   Together; verify `?section=`, `?view=today` and `?view=booklet` history restoration.
4. Run keyboard, screen-reader, reduced-motion, RTL and 200% zoom checks before each
   promotion. Compare mobile and desktop screenshots in the same inspection pass.

## Rollback and incident response

- Workspace navigation or parity regression: set release to `2`.
- Dock, Hub or contextual Travel regression: set release to `1`.
- Dock-only privacy or layout incident: additionally set `VITE_TRIP_CONTEXT_BAR=off`.
- Direct-add incident: keep release 1 enabled for intent preservation, then disable the
  affected surface action in its local component while retaining the selection-dialog path.

Archived trips never activate automatically. New additions remain blocked offline. Existing
safety and criminalisation gates stay authoritative throughout every release stage.
