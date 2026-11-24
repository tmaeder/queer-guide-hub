---
name: queer.guide travel connections
description: Destination, date, and activity-led invitations within the existing paper and ink system.
---

# Surface brief: Meet travel

## Overview

This Operate surface at `/meet/travel` extends the established SUBWAY MAP world. It helps travellers and locals arrange a small shared experience, with trips, events, and existing Messages providing context and continuity. It introduces no new brand, imagery, or asset system.

This record covers `src/pages/people/TravelMeet.tsx` and `src/components/travel-meet/*.tsx`. The root `PRODUCT.md`, `DESIGN.md`, and `docs/design-system/README.md` remain authoritative; the approved strategy is in `docs/plans/2026-11-24-travel-connections-design.md`.

## Colors

Reuse the existing background, foreground, muted foreground, hairline border, input border, surface-container, surface-container-high, ring, and destructive semantic tokens. Ink/paper controls carry actions; muted ink supports metadata and privacy explanations. Destructive text identifies form and mutation errors. No travel-specific accent palette is added.

## Typography

The shared `PageHeader` supplies the page title and lede. Section headings and the composer heading reuse display typography at the headline size. Invitation titles use the bold title style; descriptions use the body style and reading-width cap. Dates, host context, privacy guidance, and statuses use compact supporting text. Long titles and descriptions break within their available width; descriptions preserve authored line breaks.

## Layout

The existing Meet navigation precedes a shared `PageContainer`. A page header leads into a vertically ordered workspace with generous section gaps: search, status feedback, shared plans and inline composer, owned invitations, then real event suggestions and a community-group link.

The search form sits between hairline rules. Signed-in owners can first choose an eligible existing trip. Destination and date inputs stack on small screens, become a two-column grid at the small breakpoint, and use a wider destination column beside two date columns at the large breakpoint. Activity and the Find plans action stack on mobile and share a row from the small breakpoint. Privacy guidance remains immediately below the controls.

Invitation results are full-width editorial rows separated by hairlines, rather than a portrait grid. Each row presents city, dates, and activity before the title, optional detail, host identity and visitor/local context, optional event link, and request actions. Owned invitations follow in their own divided list, with requesters on tonal inset rows. Event suggestions use another compact divided list.

Headings, actions, metadata, and requester controls wrap as needed. The composer is inline, with two selector columns from the small breakpoint and a single column below it; its padding increases from 24px to 32px. No dedicated mobile overlay or new sticky chrome is introduced.

## Elevation & Depth

Hairlines, whitespace, and tonal washes establish hierarchy without a surface-specific shadow. The sign-in prompt, composer, notices, contextual links, and requester rows reuse existing tonal containers.

## Shapes

Reuse the element radius for controls, contextual links, notices, and requester rows, and the container radius for the composer and sign-in prompt. Discovery rows remain flat and open. Native selectors retain a minimum 44px height; shared Button, Input, Label, and Textarea primitives keep their incumbent interaction treatments.

## Components

### Context, privacy, and recovery

Destination, overlapping dates, and activity are selected before authentication. Trips and event links can prefill context without publishing presence or changing trip visibility. Search context survives authentication in the return URL; invitation copy is held only in session storage, matched to its context, and accepted for up to 30 minutes. Publishing requires a fresh explicit consent checkbox. Its copy states that members see the invitation and dates, the trip and itinerary stay private, and the invitation expires after its end date. Composer guidance asks for a public meeting place and excludes accommodation and private contact details.

Initial guidance, context loading/failure with retry, authentication loading, member sign-in, invitation loading/failure with retry, successful empty results, and destination safety restrictions are separate visible states. Empty results offer publication, events/groups, and an optional match alert in Messages. Event suggestions independently distinguish loading, failure, and no events. Safety restrictions replace discovery with an explanation and a destination-rights link. Field validation requires a destination and future dates within a 31-day window; changed search controls must be applied before publishing.

### Invitation lifecycle

Members can ask to join; a pending request shows a waiting status and withdrawal action. Host acceptance opens the existing Messages conversation. Accepted requests link back to that conversation; declined and withdrawn requests retain plain status text. Owners see active sharing, cancellation, expiry, and destination-safety-hidden states, with acceptance/decline only for eligible pending requests. Active invitations can be cancelled. Report or block opens the existing moderation dialog, and closing it refreshes discovery. Busy actions disable their relevant controls; mutation failures appear as alerts and successful actions as status feedback.

### Composer and keyboard focus

The inline composer includes activity, visitor/local role, invitation title, optional detail, consent, and publish/cancel actions. Event entry points prefill the invitation and activity, show a removable linked-event summary, and preserve the selected city/dates. The title requires 3–100 characters; optional detail allows 600 characters. Publish remains disabled until consent and a valid title are present.

Opening the composer focuses its programmatically focusable heading and scrolls its wrapper into view with a header offset. The heading has an explicit visible focus ring. Closing or successfully publishing returns focus to the initiating invitation/event button, falling back to the main Invite someone along button. Status and error feedback use status/alert semantics, and form controls retain explicit labels. The contextual trip link also uses the shared visible ring treatment and appears only when destination safety permits it.

## Do's and Don'ts

- Do lead with destination, dates, and a shared activity; keep identity subordinate to the plan.
- Do retain explicit member-sharing consent, private trip boundaries, lifecycle statuses, and distinct failure/empty/restricted states.
- Do reuse the existing semantic tokens, primitives, layout gutters, and Messages/moderation flows.
- Don't imply that browsing or choosing a trip publishes presence, or that a request creates a conversation before host acceptance.
- Don't turn this scoped composition into a new global brand or token system.
