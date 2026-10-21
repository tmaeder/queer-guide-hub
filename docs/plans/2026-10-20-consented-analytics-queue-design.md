# Consented analytics event queue

## Problem

The first-party analytics script is loaded asynchronously after consent and after
first paint. Trip and travel event helpers currently call `window.umami.track`
directly and silently discard an event when the script has not finished loading.
Page views then appear once the script becomes ready, leaving rollout evidence
unable to distinguish no engagement from a dropped early action.

## Design

Add one shared client event writer that remains fail-closed:

- Send immediately when effective analytics permission exists and the Umami
  tracker is ready.
- Queue a bounded, in-memory copy only when effective permission already exists
  but the tracker is not ready. Never retain pre-consent, DNT, or automated
  client events.
- Have the tracker dispatch a readiness event after installing
  `window.umami`; flush queued events in order when that event arrives.
- Clear the queue immediately when effective permission is withdrawn.
- Bound both queue length and waiting time so an unavailable script cannot
  retain an unbounded or stale interaction history.
- Use `keepalive` on the first-party fetch so a named event survives a document
  navigation.

Trip and travel helpers will keep their current public APIs and event schemas,
but delegate delivery to this shared writer.

## Verification

Unit tests will cover immediate delivery, consented queuing and ordered flush,
pre-consent/DNT/automation rejection, withdrawal clearing, queue bounds, and
travel/trip helper integration. Existing analytics-loader, tracker-script, trip,
and travel tests must remain green.

## Rollout impact

Deploying this repair starts a new Stage-1 observation window. Existing zero
event evidence is not retroactively interpreted as healthy traffic. Promotion
still requires real consented use and all runbook guardrails; automated QA stays
excluded.
