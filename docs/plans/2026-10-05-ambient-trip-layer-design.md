# Ambient Trip Layer Design

_Approved 2026-10-05_

## Objective

Transform trips from an isolated planner into an ambient context connecting discovery, saving, booking, preparation, live travel, and memory. Preserve the existing route architecture and trip data model while making trip intent visible and continuous for anonymous and signed-in users.

## Product Model

An active trip behaves like a temporary user mode:

- Anonymous visitors see clear planning actions on destination and entity surfaces. Their selected entity, destination, dates, source, and return route survive authentication for up to 24 hours in session storage.
- Signed-in visitors without a trip can create a prefilled trip without leaving the discovery context permanently.
- Signed-in visitors with an active trip add relevant entities directly to its unscheduled pool, receive an Undo action, and can choose another trip as a secondary path.
- A dismissible Trip Dock surfaces the active trip across the public product. It grows from a compact status bar into a responsive tray containing recent additions, unscheduled items, gaps, and readiness warnings.
- Ambient presence increases from seed to plan, countdown, live, and memory phases; irrelevant or archived trips never take over the interface automatically.

## Surface Hierarchy

### Global shell

Replace the passive trip context bar with a phase-aware Trip Dock. Desktop opens a right-side tray; mobile opens a bottom sheet above the bottom navigation. Suppress it in the trip workspace and auth, account, admin, legal, settings, onboarding, and checkout flows.

### Travel and discovery

Keep `/travel` as the Travelling intent. Without an active trip it retains the current trip-start experience. With an active trip its opening becomes destination and date aware. City, country, village, venue, event, hotel, search, map, Saved, Pride, and recommendation surfaces share one trip-action contract.

### Hub

Render the trip portfolio persistently above the `/hub/plans` calendar. The calendar remains the schedule view; trips are no longer hidden behind its drawer.

### Trip workspace

Keep `/trips/:id` and make its hierarchy URL-backed:

- `section=plan`: itinerary, unscheduled pool, map, suggestions, and deterministic/AI day-building tools.
- `section=prepare`: reservations and booking, budget, safety, documents, and packing.
- `section=together`: members, sharing, chat, polls, and presence.

Retain `view=today|booklet`. Share, Offline, Import, and settings are workspace actions rather than peer views. Default ranking adapts to phase: creation for seed, readiness for countdown, Today for live, recap and journal for memory.

## Shared Interfaces

- `TripCaptureIntent`: discriminated union for starting from a destination, adding an entity, adding a saved collection, and opening the active trip.
- `useTripCapture`: resolves authentication, active-trip selection, creation, direct add, duplicates, offline failures, pending-intent persistence, and telemetry.
- `TripAction`: one accessible action component with detail, card, and compact variants.
- Ambient trip UI state extends the active-trip context with dock visibility and pending-intent resumption without fetching trip details until the tray opens.
- Workspace section parser/writer owns `section=plan|prepare|together`; invalid values fall back by trip phase.

## Delivery

1. Ship shared intent/actions, authentication resumption, direct-add Undo, and baseline instrumentation.
2. Ship Trip Dock/tray, active-trip Travel context, and the persistent Hub trip portfolio.
3. Ship workspace sections and phase-aware ranking; remove the old accordion only after feature-parity tests pass.

No new core trip tables are required. Existing trip and trip-place timestamps plus consented client analytics provide the baseline and outcome measures.

## Success Measures

After collecting a two-week baseline, target:

- 20% more trip starts per eligible discovery session.
- 25% more new trips receiving their first item within 24 hours.
- 15% higher seven-day trip return rate.
- Under 5% Undo usage after direct add.

Segment results by source surface, device, authentication state, and trip phase. Monitor booking conversion and page performance for regressions.

## Required Verification

- Unit coverage for intent expiry/resume, state resolution, duplicates, direct add, Undo, active selection, and phase defaults.
- Component coverage for desktop/mobile dock states, labelled actions, Hub visibility, and URL-backed workspace sections.
- Integration coverage for discovery → authentication → resumed action, active-trip add/switch, and section/history restoration.
- Feature-parity assertion proving every former “More tools” capability remains reachable.
- Accessibility, reduced-motion, responsive, locale-coverage, and lazy-detail-fetch checks.
