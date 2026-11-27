---
name: queer.guide Meet
description: City, activity and date-led invitations for locals and visitors.
---

# Surface brief: Meet

Meet is an Operate surface answering “Who can I do something with here?” Its visual authority remains PRODUCT.md, DESIGN.md and the SUBWAY MAP system. The approved revision is `docs/plans/2026-11-25-meet-find-company-design.md`.

## Structure

`/meet` opens the existing invitation experience (`src/pages/people/TravelMeet.tsx`); `/meet/travel` remains a compatible entry. Explicit city slugs resolve before entering it. New event and trip links point to `/meet` and preserve their identifiers, city, dates and activity. No second invitation model or database migration is introduced.

One navigation row contains Meetups, People, Groups and signed-in Dating. Travel is meetup context; Nearby is reached through the labelled Live map action on People. Personal Connections links to Hub from People, outside the discovery tab row. One underlined active label communicates the current destination; it does not depend on the site's suppressed chrome borders.

The shared MeetPageLayout uses a compact display title, short lede and optional action. Its two PageContainers explicitly own their vertical spacing with `flush`, preventing inherited responsive padding from producing a large gap below navigation. It preserves shared gutters, semantic tokens, visible focus and 44px controls.

## Main task

Direct activity choices, city, date disclosure and Find meetups form the first working region. Activity chips wrap on phones instead of hiding choices in a dropdown. Dates default to an explicitly labelled next-two-weeks window; exact dates remain editable and visible in the composer. An optional trip selector is disclosed only for signed-in owners with eligible trips.

After a valid city resolves, Suggest a meetup is the primary action. It applies edited search context and opens the inline composer. Invitation cards reuse Card, Badge and Avatar to lead with the activity, shared plan and real host, before clearly separate public event opportunities. Worldwide public interest groups use the same NestedEntityCard as other cross-type discovery links in initial, empty and signed-out states, labelled as non-local alternatives. A successful populated invitation result does not need the group list.

The opening page has no featured-group hero, venue catalogue, full member directory or large map. People retains its directory and progressively disclosed filters; its sign-in prompt is an inline explanation and outline action rather than a large promotional panel.

## States and privacy

Loading, failed context resolution, failed invitations, empty results, signed-out access and restricted destinations remain distinct. Explicit city lookup failure never silently becomes another location. Group alternatives have independent loading/error/empty states and retry. All supporting group links retain explicit discovery context.

Browsing publishes nothing. Public group and event content remains readable; member invitations and profiles follow existing access rules. Sign-in preserves destination, dates and activity. Anonymous invitation drafts remain session-scoped and require fresh sharing consent after return. Publishing retains server validation, safety restrictions, private trip references, moderation and request limits. Accepted requests open the existing Messages conversation. Cancelling the composer restores focus to its trigger; no publication occurs on selection or composer opening.

## Visual rules

Use existing paper/ink semantic tokens, display typography for the compact page title, readable body text and small operational section headings. Activity choices use the shared ToggleChip with existing icons and translated labels. Invitations use the shared white Card with a pink ink activity Badge and a real host Avatar. Preserve the existing consent composer. Do not introduce a separate hero style, custom stylesheet, new palette, invented imagery, sticky toolbar or second navigation layer.

## Finishing details

Dates use a shared locale-aware calendar range formatter across search, invitation rows, composer summaries and owned invitations. Cross-year ranges keep their years visible. Signed-out copy is a single sentence. The member-directory empty state is a compact, left-aligned recovery region rather than a large decorative card. Groups shares the compact heading scale, discloses advanced filters, and shows an opening meetup summary only for a real upcoming event (with separate loading/error recovery). Repeated featured group links and the redundant Browse groups jump action are removed from its opening. Event suggestions observe known 18+/21+ metadata and the shared age-affirmation preference.

Group cards render their cover only when a photo is supplied. Missing photos do not create a large repeated station placeholder; the name and purpose lead instead. Long names can wrap to two lines. Real photo covers keep the existing community badge.
