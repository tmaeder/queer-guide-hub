---
name: queer.guide email admin
description: Inherited paper and ink controls for email preparation, journeys, operations and preferences.
colors:
  paper: "hsl(60 33% 97%)"
  ink: "hsl(0 0% 6.7%)"
  wash: "hsl(60 22.2% 89.4%)"
  muted-ink: "hsl(0 0% 33%)"
  control-plate: "hsl(60 15% 84.3%)"
  tab-plate: "hsl(60 15.8% 88.8%)"
  divider: "hsl(60 7.4% 81.4%)"
  input-stroke: "hsl(60 4.8% 44.9%)"
  focus: "hsl(330 100% 56%)"
typography:
  headline:
    fontFamily: "Anton, Space Grotesk, system-ui, sans-serif"
    fontSize: "2rem"
    lineHeight: 1.25
  title:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "0.875rem"
    lineHeight: 1.428571
  label:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
rounded:
  element: "0.75rem"
  badge: "0.5625rem"
spacing:
  control-gap: "8px"
  field-gap: "16px"
  section-gap: "24px"
  major-gap: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.element}"
    height: "44px"
    padding: "0 24px"
  button-outline:
    backgroundColor: "{colors.control-plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.element}"
    height: "44px"
    padding: "0 24px"
  input:
    backgroundColor: "{colors.control-plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.element}"
    height: "40px"
    padding: "8px 16px"
  tab-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.badge}"
    height: "36px"
    padding: "0 16px"
  capability-notice:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    padding: "16px"
---

# Design System: queer.guide email admin

## Overview

**Creative North Star: "Paper and ink utility workspace"**

This local surface extends the incumbent admin system. It inherits the existing editorial title, warm paper, ink actions, tonal controls and direct language; it establishes no new brand or global tokens. The governing sources remain root `DESIGN.md`, `PRODUCT.md`, `docs/design-system/README.md` and `docs/plans/2026-10-21-email-platform-completion.md`.

The workspace puts preparation, saved records, review and operational evidence in a readable vertical sequence. Campaign approval and audience collection prepare content; the persistent capability notice states that promotional dispatch is unavailable. Profile preferences give activity mail and newsletters separate control groups and save actions.

**Key Characteristics:**

- Inherited paper/ink hierarchy and compact labelled controls.
- Plain lists and section rules rather than a new dashboard card system.
- Visible versions, explicit effects and recoverable editing states.
- Responsive field grids and wrapping action clusters.

Evidence: `src/pages/admin/EmailPlatform.tsx`, `src/components/admin/email/{EmailCampaigns,EmailJourneys,EmailOperations}.tsx`, `src/components/profile/EmailPreferences.tsx`, shared UI primitives and `src/index.css`. All eight PNGs in `.impeccable/review/` were inspected: `desktop`, `mobile`, `journeys-desktop`, `journeys-mobile`, `operations-desktop`, `operations-mobile`, `preferences-desktop`, `preferences-mobile`. They are actual browser captures with local synthetic records, not production validation. The finish review accepted serialized editing and preservation of the activity draft after newsletter save; the detector returned an empty finding list. Neither result establishes full marketing-platform parity or inbox delivery. Frontmatter records the inherited light palette; implementation semantic variables retain authority for dark mode.

## Colors

### Primary

Ink carries primary actions, active tabs and strong text. Paper reverses type on ink. Focus uses the existing pink ring for keyboard visibility, not a new email identity.

### Neutral

Wash distinguishes the persistent provider-capability notice. Control plate supports shared inputs and outline actions; tab plate groups the workspace tabs. Muted ink carries explanations, timestamps and metadata. Dividers and input strokes inherit the shared semantic border values. The screenshots also include the incumbent pale subway-line ground; email components introduce no decorative track colors.

**The Capability Rule.** Keep the transactional-only limitation visible and express state with words before color.

## Typography

Anton is reserved here for the short admin page title. Space Grotesk carries section headings, form labels, prose, lists and actions. The route locator is the inherited small uppercase admin line; section headings use the title role and bold weight. Body text remains compact, while explanations use muted ink. Shared inputs use base-sized text below the medium breakpoint and small text above it. Email HTML inside the preview is separate content and may use the saved template's typography.

## Layout

The admin shell owns outer gutters. The local page uses a vertical section gap, with the header changing from stacked to a horizontal title/action row at the small breakpoint. The Email tab list is explicitly allowed to wrap; the mobile captures show two rows. This is the built local tab behavior and does not redefine the global sticky-switcher convention.

Campaign editing and receipt inspection have a maximum width (`42rem`). Campaign topic/language and journey fields become two columns at the small breakpoint. Operations metrics use one column, then two at small and three at large. Preference time-zone/start/end fields become three columns at small. Below these breakpoints fields stack, action groups wrap, and long identifiers break across lines. Forms use the field gap, sections use the section gap, and major operational/campaign groups use the major gap in frontmatter.

## Elevation & Depth

Most content stays directly on the inherited ground with section borders and whitespace. Shared outline buttons and inputs retain the soft shadow; the email surface adds no elevation tokens. Primary actions are solid ink. The white email preview is an isolated content viewport, not a restyled admin card. Hover inversion and focus rings provide interaction feedback without introducing decorative motion.

## Shapes

Shared buttons and inputs use the element radius; active tab marks use the badge radius. Native selects remain rectangular fields with the existing border, paper fill and horizontal padding. Capability notices, section rules and the preview frame retain square edges. Preserve these observed differences rather than rounding every element into a card or pill.

## Components

### Workspace tabs

Six text-labelled Radix tabs lead to Campaigns, Audiences, Journeys, Delivery, Operations and Subscribers. Active tabs invert to ink/paper inside a tonal group. Campaigns, audiences and journeys remain mounted when inactive so navigation retains drafts. This is tab state, not URL-backed navigation.

### Actions and fields

Shared primary buttons identify the next committed action; outline actions provide refresh, review, count, collection and editing controls. Buttons have a minimum target height from frontmatter, a visible keyboard ring, reduced opacity when disabled, and brief press feedback. Inputs retain the shared tonal well, border, focus treatment and disabled state. Native selects and checkboxes retain explicit labels; explanatory text remains adjacent to the controls it qualifies.

### Campaign preparation and review

A bounded labelled form precedes saved campaign rows and version-specific review. The desired local date is explicitly planning-only. Review displays saved HTML in a sandboxed, fixed-height (`24rem`) preview with remote assets disabled, plus a plain-text disclosure. Versions, review decisions, audience snapshots and inclusion/exclusion reasons are evidence, not sending affordances. Busy operations serialize editing; dirty drafts and version conflicts expose deliberate recovery actions instead of silently replacing the operator's work.

### Journey editor

Saved journeys precede a labelled form with trigger, re-entry, publication state, starting step and an ordered step list. Step connection controls replace an unlabelled visual graph. Addition, removal and save controls follow the list. The sample-profile preview is separate from actual recent runs and run traces; copy states that preview sends no mail. Publication copy explains enrollment, holding work and archival cancellation.

### Operations

A description list presents observed queue age, expired leases, latency, unmatched events and retention. Observation time and measurement window appear before metrics. Receipt inspection takes a message ID and reports recovery evidence; it does not resend uncertain messages. Collection jobs and operator events follow as plain lists, with explicit empty/loading/error states. Provider acceptance is not presented as inbox placement.

### Email preferences

Activity checkboxes, privacy/budget copy, quiet hours and their save action form one group. Newsletter topics and their subscription/save action form another. Saving newsletter choices preserves an unsaved activity draft. Conflict recovery is explicit, essential account mail remains available, and newsletter availability is explained next to the relevant choices.

## Do's and Don'ts

### Do:

- **Do** reuse inherited semantic colors, radii, typography and shared controls.
- **Do** keep provider limits, version context and action effects visible in plain language.
- **Do** preserve drafts across tab changes and failed operations, with explicit conflict recovery.
- **Do** distinguish sample previews, captured eligibility and observed delivery evidence.
- **Do** keep mobile labels, wrapping controls and long identifiers readable.

### Don't:

- **Don't** imply approval, a planning date or a snapshot authorizes promotional dispatch.
- **Don't** promote synthetic screenshot data or empty detector findings into production evidence.
- **Don't** introduce an email-specific palette, decorative graph canvas or elevation ladder.
- **Don't** let newsletter saves overwrite activity edits or asynchronous responses replace newer editing state.
