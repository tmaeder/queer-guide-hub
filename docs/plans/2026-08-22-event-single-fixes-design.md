# Event single — correctness, not compaction

2026-08-22. Fourth in the series (country → city → venue → event). Like the
venue single, the length premise did not carry: the event page has three
sections and no bulk problem. What it had was three defects, one of which was
hidden by another.

## The corpus

40,119 live events, **324 upcoming**. So 99.2% of every event page served is a
record of something that already happened, and `description` (97.6%) and
`tags` (79.2%) are well filled while `venue_id` (0.8%), `organizer_id` (0.0%),
`target_groups` (1.7%) and `age_restriction` (0.9%) are not.

## Three defects

**1. "Who's going" rendered as a bare heading.** Its three possible bodies are
a count, the "be the first to RSVP" prompt (suppressed once the event is over)
and `PeopleHereRail` (whose `enabled` is `Boolean(user) && …` and whose
`emptyState` defaults to `null`). For a signed-out reader on a past event all
three are empty, so the section printed a heading and nothing else — the exact
shape spec rule 2 forbids, on the dominant state of the corpus and on every
crawler fetch. Fixed with `hasWhoIsGoingContent(event, user, isPast)` at the
page, because a component that self-hides is invisible to the section filter.

**2. It printed its own `<h2>Who's going</h2>`** while `SingleSection` already
supplies that heading — the same duplication the city description had (#2916)
and the venue signals card had (#2932).

**3. A live "Get Tickets" button on finished events.** In the decision card,
`ticketHref ? <Get Tickets> : (!isPast && <Add to Trip>)`. Every sibling
control in that card — both "Add to Trip" variants and the RSVP pair — already
checked `!isPast`; the primary CTA was the single place a finished event still
invited a purchase. **443 live events are past and carry a `ticket_url`.**

Plus: past events had **no status chip at all**. `statusPill` covered
cancelled / postponed / sold-out / moved-online but not "over", so the corpus's
dominant state was the one the reader had to infer from a date. Added `Ended`
(`outline`, not `destructive` — finishing is not a fault), ordered last so a
cancelled past event keeps the stronger label.

## Defect 2 was hiding defect 1 from the test written to catch it

`e2e/singles.spec.ts`'s empty-section guard did:

```js
const h = el.querySelector('h2');
const text = (el.textContent ?? '').replace(h?.textContent ?? '', '').trim();
```

It strips only the FIRST heading. The duplicate `h2` carried the same words, so
"Who's going" survived the strip, counted as a body, and the guard passed green
on an otherwise-empty section. The guard now clones the node, removes **every**
heading, and measures what is left — including for the media check, since a
heading may carry its own icon.

## A wrong claim this work produced, and how it was caught

The first version of this analysis asserted that the e2e fixture
`/events/capital-pride-ottawa-2026` "became a past event six days ago", making
the route silently change meaning. **That was wrong.** It is a multi-day
festival whose `end_date` is 2026-08-23 — still ahead. The error came from
querying `start_date < now()` when the page computes
`coalesce(end_date, start_date) < now()`. Running the guard against that route
without the source fix passed, which is what exposed the mistake.

The route therefore never covered the past-event case at all. `ROUTES` now also
carries `/events/denver-pridefest-2026`, a genuinely finished event with zero
attendees — the same reasoning that put `/venues/lehighton` in the list.

## Non-vacuity, proven rather than assumed

With the hardened guard in place and only the source fix reverted, the suite
fails with:

```
Error: sections rendered with a heading and no body: going
```

and passes with the fix restored (39/39 against a local build). A guard edited
in the same change as the bug it is meant to catch is not evidence until it has
been shown to fail without the fix.

## Deliberately not done

No compaction and no module merging. The event single is already three
sections; `event_occurrences` (module 03) has 0 rows and module 15 is absent
because `max_attendees` is set on 14 rows — both already correctly unrendered.
