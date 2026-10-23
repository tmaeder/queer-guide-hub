---
name: queer.guide email activity
description: Private invitation review and ordinary email preferences within the incumbent subway world.
colors:
  paper: "hsl(60 33% 97%)"
  ink: "hsl(0 0% 6.7%)"
  muted-ink: "hsl(0 0% 33%)"
  wash: "hsl(60 22.2% 89.4%)"
  inset: "hsl(60 15.8% 88.8%)"
  control-plate: "hsl(60 15% 84.3%)"
  divider: "hsl(60 7.4% 81.4%)"
  input-stroke: "hsl(60 4.8% 44.9%)"
  focus: "hsl(330 100% 56%)"
typography:
  headline:
    fontFamily: "Anton, Space Grotesk, system-ui, sans-serif"
    fontSize: "32px"
    lineHeight: "36.8px"
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: "24px"
  supporting:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: "20px"
  compact:
    fontFamily: "Space Grotesk, system-ui, sans-serif"
    fontSize: "12px"
    lineHeight: "16px"
rounded:
  element: "12px"
spacing:
  tight: "8px"
  regular: "16px"
  section: "24px"
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
  button-outline-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.element}"
    height: "44px"
    padding: "0 16px"
  input:
    backgroundColor: "{colors.control-plate}"
    textColor: "{colors.ink}"
    rounded: "{rounded.element}"
    height: "40px"
    padding: "8px 16px"
  preference-chip:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.ink}"
    rounded: "{rounded.element}"
---

# Design System: queer.guide email activity

## Overview

**Creative North Star: "Paper, ink, and subway wayfinding"**

This scoped record extends the incumbent queer.guide world: restrained editorial type, warm paper, dark operational controls, and the existing subway ground. Invitation review, email choices, and saved searches remain ordinary parts of their existing homes. They introduce no competing identity.

The interface is quiet and direct. Text explains what an action does; tonal controls distinguish the next step. The invitation name stays readable before its review action, and delivery availability appears with the preference it qualifies.

**Key Characteristics:**
- Paper and ink with inherited tonal controls.
- Clear section hierarchy and explicit action labels.
- Wrapping content with recoverable inline states.

Scope: this file and its sibling sidecar record only `GroupInvitationReview`, `EmailPreferences`, and `NewsSavedSearchesPanel`, together with shared primitives they use. Root `PRODUCT.md`, root `DESIGN.md`, and the core design system remain authoritative. Evidence: the five-block contract in `docs/plans/2026-10-20-email-platform-design.md`, the three component sources, `src/index.css`, and review renders under `.impeccable/review/` for group invitations, invitation errors, invitation preferences, and saved-news policy at desktop, 1280px, and mobile sizes where provided. Review fixture captions and fixture page gutters are not product components.

## Colors

The primary role is ink; warm neutrals provide the working surfaces. Frontmatter records the light-theme source values in their incumbent HSL format. Components should retain semantic variables so dark-theme overrides continue to apply.

### Primary
- **Utility ink:** actions, group names, and principal labels.

### Neutral
- **Warm paper:** page ground and reversed primary-button labels.
- **Muted ink:** explanations, availability, and subordinate metadata.
- **Wash / inset / tonal control plate:** hover, compact form grouping, and secondary controls respectively.
- **Divider / input stroke:** existing semantic boundaries; actual visible strokes follow the shared global CSS overrides.

The focus color is inherited pink, reserved here for keyboard focus treatment. The faint colored subway ground belongs to the shared world, not to invitation state.

**The Meaning Before Color Rule.** Explain delivery availability and invitation state in text; color does not carry that meaning alone.

## Typography

The invitation `h2` inherits Anton through the global heading rule, including disabled synthetic weight. The email-settings `h3` and legends use Space Grotesk. Body names use the ordinary body role; explanations use supporting type. Compact labels and saved-search metadata use the compact role. This is a small operational hierarchy, not a new hero scale.

Shared action labels are bold, tightly tracked supporting text; small buttons use compact text. The saved-search name input uses body sizing on mobile and supporting sizing from the medium breakpoint. Preserve the global font loading and heading cascade rather than inferring a new face from a utility name.

## Layout

Invitation review and email settings use semantic sections with regular vertical spacing and section top padding. Invitation rows wrap, align the action after the name, and use regular vertical padding. Names have no fixed width or ellipsis: word breaking and anywhere wrapping protect long multilingual strings. Page navigation remains outside this scoped section; invitation pagination uses ordinary secondary buttons in a wrapping row.

Preferences remain a single vertical fieldset flow. Checkbox rows have a minimum height of 40px and a regular gap. Quiet-hour fields become three equal columns at the small breakpoint (640px); below it they stack. Save/unsubscribe and previous/next controls wrap with regular gaps.

Saved searches use the incumbent end-aligned popover (320px width), regular interior padding, and tight gaps. The saved list scrolls within its existing 256px maximum height. Alert and delete actions retain separate 44px square targets. Shared Button has a minimum 44px height, including the bookmark trigger whose inline height is smaller; inspect effective CSS before changing target geometry.

## Elevation & Depth

Depth is inherited: the page ground remains visible, tonal control plates establish hierarchy, and the shared soft shadow supports outline buttons and input wells. Invitation sections do not acquire new enclosing cards. Keep the existing popover elevation and global border/shadow overrides; no email-specific shadow vocabulary is introduced. Exact shadow and motion values live in the sidecar as source-bound extensions.

## Shapes

Controls and saved-search rows use gently curved element corners. Invitation rows themselves stay open within their semantic section. Native checkboxes retain their browser form, and the existing switch retains its rounded track/thumb geometry. These are control-specific forms, not permission to turn section containers into pills.

## Components

### Buttons and review links

Solid ink controls save choices; tonal outline controls review invitations, retry failures, and paginate. Ghost controls handle compact secondary actions. Shared controls provide hover response, explicit focus rings, pressed feedback, and disabled treatment. A review link keeps its named invitation accessible label and navigates to the existing invitation destination; opening the list does not accept membership.

### Invitation list and recovery

Use a visible section heading, supporting explanation, and readable names with explicit “Review invitation” actions. Loading is announced as status; errors are alerts with a visible Retry action. Empty state explains the absence of pending invitations. Previous/next controls disable when unavailable or fetching. This surface limits review pages to twenty records; that is local behavior, not a global list-size rule.

### Preference fields

An ordinary independently labeled checkbox controls group-invitation mail alongside the other activity topics. Keep native controls, fieldsets, legends, and associated labels. The quiet-hour time zone and selects retain the existing bordered paper field variant, distinct from the shared raised search-name input. Busy fieldsets disable as a unit. Conflicts present an inline alert and reload action. Save controls retain their current validity and busy conditions.

### Saved-search popover and chip

State availability before alert preferences. The switch saves a preference, and the tonal badge says that a daily or weekly preference is saved; neither promises delivery. Switch and alert buttons reference the availability explanation through `aria-describedby`. Name fields, save/cancel controls, scrollable rows, and reading-history access retain their incumbent structure. The chip is a state label, not a delivery receipt.

**The Explicit Next Step Rule.** Review, saving a preference, and receiving email must remain distinguishable in action labels and nearby copy.

## Do's and Don'ts

### Do:
- **Do** reuse semantic paper/ink variables, shared buttons, and existing type roles.
- **Do** let long invitation names and control groups wrap without hiding their meaning.
- **Do** keep availability, recovery, and focus treatment visible at the point of action.
- **Do** preserve independent opt-ins and ordinary labeled controls.

### Don't:
- **Don't** introduce a new palette, card system, or imagery for these operational sections.
- **Don't** label saved alert preferences as active email delivery.
- **Don't** make viewing the invitation list imply joining a group.
- **Don't** promote fixture captions or a fixture's outer layout into product design rules.
