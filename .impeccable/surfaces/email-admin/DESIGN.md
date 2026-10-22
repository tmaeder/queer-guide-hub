---
name: queer.guide email admin
description: Inherited paper and ink controls for email preparation, content, recipients, observed outcomes and preferences.
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

The workspace puts preparation, saved records, review and operational evidence in a readable vertical sequence. Content localization, public catalog references, recipient provenance and experiment definitions extend this same registry layout. Campaign approval, audience collection and stable experiment assignments prepare work; the persistent capability notice states that promotional dispatch is unavailable. Profile preferences give activity mail and newsletters separate control groups and save actions. The public Email updates form uses the same controls and explains newsletter availability before collecting choices.

**Key Characteristics:**

- Inherited paper/ink hierarchy and compact labelled controls.
- Plain lists and section rules rather than a new dashboard card system.
- Visible versions, explicit effects and recoverable editing states.
- Responsive field grids and wrapping action clusters.

Evidence: `src/pages/admin/EmailPlatform.tsx`, `src/components/admin/email/{EmailCampaigns,EmailJourneys,EmailOperations,EmailRecipients,EmailContacts,EmailContent,EmailCatalogBlocks,EmailExperiments,EmailMeasurement,AudienceRuleEditor}.tsx`, `src/components/profile/EmailPreferences.tsx`, `src/pages/EmailUpdates.tsx`, `src/components/layout/Footer.tsx`, shared UI primitives and `src/index.css`.

The current extension was inspected in fourteen synthetic browser captures under `.impeccable/review/`: `recipients-{desktop,mobile}`, `content-{desktop,mobile}`, `measurement-{desktop,mobile}`, `experiments-{desktop,mobile}`, `updates-{desktop,mobile}`, `content-preview-{desktop,mobile}` and `experiment-controls-{desktop,mobile}` (all `.png`). The full-page WebKit content/campaign images can leave an offscreen iframe blank; the supplemental viewport captures show painted preview content and readable experiment controls. This capture artifact is not an empty-content state. The refreshed recipient captures also show a long mailbox wrapping within its record, the contained “View history” action and the expanded pending-import form; the mailbox-specific accessible name is established by source inspection. Earlier campaign, journey, operations and preference captures remain historical evidence rather than coverage of every new state. These isolated fixtures use synthetic records and a public verification placeholder; they establish neither production authentication, live challenge verification, consent, delivery nor inbox placement. No screenshot or review result establishes full platform parity. Frontmatter records the inherited light palette; implementation semantic variables retain authority for dark mode.

## Colors

### Primary

Ink carries primary actions, active tabs and strong text. Paper reverses type on ink. Focus uses the existing pink ring for keyboard visibility, not a new email identity.

### Neutral

Wash distinguishes the persistent provider-capability notice. Control plate supports shared inputs and outline actions; tab plate groups the workspace tabs. Muted ink carries explanations, timestamps and metadata. Dividers and input strokes inherit the shared semantic border values. The screenshots also include the incumbent pale subway-line ground; email components introduce no decorative track colors.

**The Capability Rule.** Keep the transactional-only limitation visible and express state with words before color.

## Typography

Anton is reserved here for the short admin page title. Space Grotesk carries section headings, form labels, prose, lists and actions. The route locator is the inherited small uppercase admin line; section headings use the title role and bold weight. Body text remains compact, while explanations use muted ink. Shared inputs use base-sized text below the medium breakpoint and small text above it. Email HTML inside the preview is separate content and may use the saved template's typography.

## Layout

The admin shell owns outer gutters. The local page uses a vertical section gap, with the header changing from stacked to a horizontal title/action row at the small breakpoint. The Email tab list is explicitly allowed to wrap; the current 390px mobile captures show three rows for the eight tabs; the desktop captures show one row. This is the built local tab behavior and does not redefine the global sticky-switcher convention.

Campaign editing and receipt inspection have a maximum width (`42rem`). Campaign topic/language and journey fields become two columns at the small breakpoint. Operations metrics use one column, then two at small and three at large. Preference time-zone/start/end fields become three columns at small. Content template/translation selectors and catalog fields become two columns at small; experiment window and share fields become three columns at small. Content editing is bounded to `48rem`, while experiment and CSV import forms use `42rem`. The public updates route uses the existing form-sized PageContainer. Below these breakpoints fields stack, action groups wrap, and long identifiers break across lines. Forms use the field gap, sections use the section gap, and major operational/campaign groups use the major gap in frontmatter.

## Elevation & Depth

Most content stays directly on the inherited ground with section borders and whitespace. Shared outline buttons and inputs retain the soft shadow; the email surface adds no elevation tokens. Primary actions are solid ink. The white email preview is an isolated content viewport, not a restyled admin card. Hover inversion and focus rings provide interaction feedback without introducing decorative motion.

## Shapes

Shared buttons and inputs use the element radius; active tab marks use the badge radius. Content, catalog and experiment native selects remain rectangular fields with the existing border, paper fill and horizontal padding; the recipient-type selector explicitly uses the shared element radius. Capability notices, section rules and the preview frame retain square edges. Preserve these observed differences rather than rounding every element into a card or pill.

## Components

### Workspace tabs

Eight text-labelled Radix tabs lead, in order, to Campaigns, Audiences, Journeys, Content, Delivery, Operations, Measurement and Subscribers. Active tabs invert to ink/paper inside a tonal group. Campaigns, audiences, journeys, content and subscribers remain mounted when inactive so navigation retains local editing state. This is tab state, not URL-backed navigation. Experiments remain within campaign review and entity recipients within Subscribers; neither adds another peer tab.

### Actions and fields

Shared primary buttons identify the next committed action; outline actions provide refresh, review, count, collection and editing controls. Buttons have a minimum target height from frontmatter, a visible keyboard ring, reduced opacity when disabled, and brief press feedback. Inputs retain the shared tonal well, border, focus treatment and disabled state. Native selects and checkboxes retain explicit labels; explanatory text remains adjacent to the controls it qualifies.

### Campaign preparation and review

A bounded labelled form precedes saved campaign rows and version-specific review. The desired local date is explicitly planning-only. Review displays saved HTML in a sandboxed, fixed-height (`24rem`) preview with remote assets disabled, plus a plain-text disclosure. Versions, review decisions, audience snapshots and inclusion/exclusion reasons are evidence, not sending affordances. Busy operations serialize editing; dirty drafts and version conflicts expose deliberate recovery actions instead of silently replacing the operator's work.

### Content, languages and public references

Content begins with fallback explanation, the shared base-editor link and labelled template/translation selectors. Locale code, subject, HTML and plain text follow in one editing form, with active-locale choice, preserved-variable feedback and explicit save/discard controls. Dirty editing locks selection; version conflict recovery offers reload or keeping content for another locale. The local preview is a white, sandboxed `24rem` iframe: variables stay placeholders, scripts and navigation are blocked, remote images are disabled, and no mail is sent. Its saved-template typography is not a new admin type role.

Campaign catalog controls pair public content type with record ID, then add/preview actions and an ordered reference list. Up to twelve event, venue, news or organization references are retained as IDs. Preview checks current public records, records its observation time and labels unavailable references for removal. These are content references, not permission or delivery controls.

### Entity recipients and subscriber provenance

Subscribers starts with the entity directory, a labelled recipient-type selector and a browse/refresh action. Organisations, venues, linked vendors and verified user mailboxes show contact source, eligibility and topics before the pending-contact action. Listing evidence establishes contact provenance; it establishes neither ownership nor subscription consent. Shared mailboxes share subscription and suppression state. The Audiences editor adds the same Recipient type condition alongside its existing rules.

The subscription list follows with refresh, export-this-page, source/confirmation metadata, history inspection and previous/next controls. Pages contain up to 100 contacts; the export label names that scope. The history action uses the short visible label “View history” with a mailbox-specific accessible name, so long addresses remain in wrapping record text. An import disclosure contains source label, nonpersonal reference/checksum and CSV input. Copy states the 100-row/100-KB limit and pending-only effect: import does not grant consent, replace suppression or send confirmation. Loading, empty, failure, retained history and import-result messages stay adjacent to the affected section.

### Experiment preparation and observed measurement

Experiment preparation follows version-specific campaign review. It names the completed-audience prerequisite, declared app outcome, outcome window, control share, variant share and two template choices. Saved definitions list campaign version, status and assignments; content is pinned and assignments are stable. The interface states that Cloudflare cannot deliver these campaigns: assignments are not exposures, outcome windows have not started and there is no measured winner. Drafts are keyed to the selected campaign/version and failures preserve them.

Measurement begins with observation bounds and a refresh action, then plain sections for welcome-acceptance windows, server-captured product events and journey runs/steps. Step outcomes use a disclosure rather than a chart. Open windows are distinguished from completed windows. Copy describes first-party observations and provider acceptance without implying causal lift, purchases, automatic winners or inbox placement.

### Journey editor

Saved journeys precede a labelled form with trigger, re-entry, publication state, starting step and an ordered step list. Step connection controls replace an unlabelled visual graph. Addition, removal and save controls follow the list. The sample-profile preview is separate from actual recent runs and run traces; copy states that preview sends no mail. Publication copy explains enrollment, holding work and archival cancellation.

### Operations

A description list presents observed queue age, expired leases, latency, unmatched events and retention. Observation time and measurement window appear before metrics. Receipt inspection takes a message ID and reports recovery evidence; it does not resend uncertain messages. Collection jobs and operator events follow as plain lists, with explicit empty/loading/error states. Provider acceptance is not presented as inbox placement.

### Email preferences

Activity checkboxes, privacy/budget copy, quiet hours and their save action form one group. Newsletter topics and their subscription/save action form another. Saving newsletter choices preserves an unsaved activity draft. Conflict recovery is explicit, essential account mail remains available, and newsletter availability is explained next to the relevant choices.

### Public Email updates

The `/email-updates` route, linked as Email updates in the footer, uses a form-width column with a sans display heading. Availability and account/activity separation copy precede the subscribe/manage mode buttons. Subscribe mode has labelled mailbox, topic and explicit-consent controls; management mode explains the private single-use link and that it cannot reactivate an unsubscribed mailbox. Turnstile verification and busy state gate requests. Result/error copy appears after the form; confirmation is required before a subscription becomes active. The synthetic review capture substitutes a labelled verification placeholder and does not prove this production flow.

## Do's and Don'ts

### Do:

- **Do** reuse inherited semantic colors, radii, typography and shared controls.
- **Do** keep provider limits, version context and action effects visible in plain language.
- **Do** preserve drafts across tab changes and failed operations, with explicit conflict recovery.
- **Do** distinguish sample previews, captured eligibility, pending contact provenance, assignments and observed first-party evidence.
- **Do** keep mobile labels, wrapping controls and long identifiers readable.

### Don't:

- **Don't** imply approval, a planning date or a snapshot authorizes promotional dispatch.
- **Don't** promote synthetic screenshot data or review findings into production evidence.
- **Don't** treat published business contacts as ownership or consent, or assignments and observed outcomes as exposures or causal lift.
- **Don't** introduce an email-specific palette, decorative graph canvas or elevation ladder.
- **Don't** let newsletter saves overwrite activity edits or asynchronous responses replace newer editing state.
