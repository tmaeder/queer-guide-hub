# Personalised Travel Packages — Design

**Date:** 2026-11-09  
**Status:** Approved  
**Surface:** `/travel`

## Problem

The current planning entry point asks travellers to complete a large configuration form before it offers inspiration. Destination, dates, party size, budget, pace, and interest read as setup work rather than the beginning of a holiday. Existing trip templates, event data, venue data, transport tools, and booking tools are present elsewhere in the product, but they are not assembled into an immediate, emotionally compelling recommendation.

The redesigned experience must lead with personalised packages that show the value of Queer Guide before asking for operational detail. It must remain grounded in real platform data and must never invent availability, schedules, prices, safety claims, events, venues, transport, or accommodation.

## Product Direction

Use an explicit, short preference quiz presented as a live concierge. Starter packages are visible from the first paint; every quiz answer immediately reorders and refines them. The page is inspiration-first, while live booking becomes available inside each package.

The primary flow is:

1. See aspirational package recommendations immediately.
2. Answer three visual questions: mood, timing, and budget.
3. Watch the recommendations update after every answer.
4. Open a package to see its itinerary, events, venues, transport, stays, pricing, and safety context.
5. Swap individual pieces or continue to booking.

“Build my own” remains a secondary path for travellers who already know exactly what they want.

## First-Screen Experience

### Hero

- Eyebrow: personalised queer travel.
- Headline: “What kind of escape do you need?”
- Supporting copy promises a complete package assembled around the traveller rather than a blank itinerary.
- The quiz uses large, visual choices instead of select fields.

### Explicit Preference Quiz

The first release asks three compact questions:

1. **Mood:** nightlife, slow and romantic, Pride energy, culture, or outdoors.
2. **Timing:** this weekend, next month, or choose dates.
3. **Budget:** easy, comfortable, or special occasion.

Selections are reversible, keyboard operable, announced to assistive technology, and reflected in the URL when practical. A package rail remains visible while answering; it is refined rather than hidden behind a submit step.

### Package Recommendations

- One large “best match” package leads the section.
- Two secondary recommendations sit beside or beneath it.
- Each card communicates destination, evocative title, match reason, duration, anchor event or scene, venue highlights, indicative price, and discreet safety context.
- Opening a card reveals the complete package rather than immediately creating a trip.
- The package can be saved, shared, customised, or booked.

## Visual Direction

- Use real destination, event, hotel, and venue photography from the platform’s resolved data.
- Do not use generic stock imagery when a verified platform image exists.
- Mood choices may use expressive editorial illustrations or carefully cropped destination photography.
- The best-match package uses an immersive, full-bleed image; supporting cards use consistent landscape crops.
- Text overlays use restrained readability scrims only where needed.
- Package names should feel like editorial invitations, for example “Berlin After Dark,” “Lisbon, Slowly,” or “Pride Weekend in Madrid.”
- Image-shaped loading states preserve composition and prevent the page from collapsing back into a form-like experience.
- Missing imagery falls back to a considered editorial surface with legible ink, never an arbitrary gradient presented as destination photography.

## Events and Venues

Events and venues are core package ingredients, not supporting metadata.

- Upcoming Pride celebrations, festivals, nightlife, exhibitions, and community events may anchor a package.
- Event dates constrain the suggested travel window.
- Expired, cancelled, sold-out, or otherwise unavailable events must not be presented as bookable.
- Each package previews three or four real venues matched to the selected mood: bars, clubs, cafés, saunas, cultural spaces, outdoors places, or community venues as appropriate.
- Venue selection respects quality, verification, status, geography, accessibility data, and safety visibility rules.
- Closed, low-confidence, criminalisation-gated, or otherwise ineligible venues are excluded.
- The detailed itinerary combines events and nearby venues into realistic days, accounting for opening hours, event time, distance, and late-night return.
- Travellers can swap an individual event or venue without rebuilding the complete package.

The existing `useTripTemplates` tiers—preference, featured event, and measured seasonal scene—provide the starting recommendation pool. The package presentation should enrich those candidates with real event and venue details rather than replacing the established data-quality gates.

## Transport

Package detail must support the full door-to-door journey:

- flights;
- rail;
- coach;
- ferry;
- car rental;
- airport or station transfer;
- taxi or rideshare;
- local public transport;
- cycling; and
- walking.

Transport comparisons include total journey time, price, transfers, baggage constraints, accessibility, overnight travel, and estimated emissions when data supports them. Multi-city packages select the most suitable mode for each leg instead of forcing one mode for the entire trip.

Unavailable, disrupted, estimated, and live-bookable routes must be visibly distinct. The interface must never invent a schedule, connection, fare, or booking state.

## Hotels and BnBs

Stay recommendations are ranked by package fit:

- neighbourhood and proximity to included events and venues;
- live or clearly labelled estimated price;
- review quality;
- accessibility;
- cancellation terms;
- room and party fit; and
- documented queer-friendly evidence where available.

Each package offers three stay positions: **good value**, **best match**, and **special stay**. A package itinerary includes arrival, transfer, check-in, late-night return, checkout, and departure rather than treating accommodation as a detached affiliate list.

## Package Detail

The package detail surface contains:

1. A strong photographic cover and concise match explanation.
2. Day-by-day itinerary combining anchor events and nearby venues.
3. Transport comparison for arrival, departure, inter-city legs, and local movement.
4. Three ranked stay choices.
5. Live booking controls where providers return current data.
6. A transparent price breakdown separating live totals from estimates.
7. Safety and legal context at the point it affects a decision.
8. Swap controls for individual events, venues, transport legs, and stays.
9. Save, share, customise, and book actions.

## Personalisation and Ranking

Signed-in profile data may improve the initial ordering, but explicit quiz choices take precedence. Guests receive broadly useful starter recommendations and the same quiz. Ranking should combine:

- quiz mood;
- timing and event availability;
- budget fit;
- existing travel preferences;
- measured scene strength;
- destination and content quality;
- transport feasibility;
- accommodation availability; and
- applicable safety gates.

Every visible match explanation must be supported by the same signals used for ranking.

## Responsive and Accessible Behaviour

- Mobile shows the quiz as horizontally scrollable visual choices with a persistent results count and no hidden submit step.
- The best match appears first without requiring horizontal scrolling.
- Package cards preserve meaningful alternative text and do not encode match state through colour alone.
- All quiz cards are real controls with keyboard, focus, selected, and disabled states.
- Dynamic recommendation changes use a polite live region without stealing focus.
- Reduced-motion preferences disable reordering and reveal animations.
- Price, date, safety, and booking status remain readable without relying on imagery.

## Data Integrity and Safety

- Existing criminalisation, visibility, and content-safety gates remain authoritative.
- No synthetic events, venue claims, transport schedules, hotel availability, or prices.
- Estimates are labelled with their timestamp and basis.
- Package creation occurs only after an explicit user action.
- Signed-out users may explore fully; authentication is requested when saving, customising persistently, or booking requires it.

## Analytics

Measure the experience without fabricating rollout traffic:

- quiz started and each preference selected;
- recommendation impression and position;
- package opened;
- event, venue, transport, or stay swapped;
- live booking availability requested;
- trip saved or created; and
- booking handoff.

The existing Ambient Trip Layer rollout guardrails remain in force. Implementation and QA must not generate synthetic production analytics or contaminate an active observation window.

## Success Criteria

- The first viewport contains inspiration and at least one package recommendation, not a large configuration form.
- A traveller can refine recommendations with three explicit visual decisions.
- Recommendations visibly incorporate real events and venues.
- Package detail covers all major transport modes and ranked hotels/BnBs.
- Live and estimated booking information are unambiguous.
- Existing safety, criminalisation, and branch-protection gates remain intact.
- The secondary build-your-own path remains available.

## Non-Goals

- Building a new inventory or payment platform.
- Pretending affiliate links are live inventory.
- Replacing the full trip workspace.
- Forcing account creation before browsing packages.
- Shipping every booking provider in the first UI iteration.
