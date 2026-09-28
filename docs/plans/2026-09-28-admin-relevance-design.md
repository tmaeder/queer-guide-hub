# Admin relevance design

## Goal

Make the CMS lists and governance queues answer the administrator's first
question without extra navigation: **what deserves attention now, and why?**

The ordering contract is shared across admin surfaces:

1. safety and identity risk;
2. breached review SLA;
3. public-content impact;
4. queue-specific priority;
5. age and backlog size as stable tie-breakers.

This is a targeted upgrade to the existing React, Tailwind and Supabase admin
system. It does not replace the CMS list, unified inbox, quality hub or cockpit.

## Current-state findings

- CMS tables always show title, derived status and freshness, but custom
  operational properties can be removed from a saved view. The registry has no
  way to declare a property essential to an administrator's decision.
- CMS types can define an operational default sort, but persisted views may
  become empty or lose newly essential properties as their field definitions
  evolve.
- The cockpit ranks any overdue queue ahead of every on-time queue, then uses a
  static weight. It does not explicitly model safety risk or public impact, and
  it does not explain those signals in the row.
- The inbox filter chips are a second handwritten queue registry. They omit
  registered queues and can drift from cockpit links and counts.
- Inbox rows show age, confidence and item-level confirmation requirements, but
  they do not show queue SLA or public-impact context.

## CMS list contract

Add an `essentialInList` field flag. Essential fields are:

- included in every normalized table view, including older persisted views;
- always kept visible by the property manager;
- ordered before optional custom properties;
- labelled as required context in the customization UI.

Title, status and updated time remain fixed columns. Registry fields marked
essential add entity-specific operational context such as `needs_attention`,
review state, quality state, verification freshness or jurisdiction risk.

Normalization is the enforcement boundary. Applying the rule only in the UI
would allow a stale or edited saved view to hide the same data again.

## Governance contract

Extend the central `ADMIN_QUEUES` definitions with two explicit signals:

- risk tier: `safety`, `integrity` or `routine`;
- impact: `public` or `internal`.

`rankQueueRows` sorts by risk tier, overdue state, public impact, existing
weight, count and label. The ordering remains total and stable between polls.
Cockpit rows show concise Safety, Overdue and Public markers so the rank is
explainable rather than mysterious.

The inbox derives its queue chips from `ADMIN_QUEUES`, grouped only where the
existing interface intentionally groups quality campaigns. This retains one
source of truth for queue names, keys and counts. Item rows combine queue-level
risk/impact metadata with item-level `risk_flags`, creation time and current SLA
hours to show the decisive signals beside the item.

Quick scopes provide one-click views for safety queues, overdue queues and
public-impact queues. The overdue scope is queue-level: it includes queues with
at least one breached item, while each row independently shows whether that
particular item has crossed its SLA.

## Accessibility and interaction

- All signals use text and icons, never colour alone.
- Existing keyboard navigation, focus mode, bulk actions and mobile sheet
  behaviour remain unchanged.
- Essential properties cannot be disabled, and the control explains why.
- Chips retain their documented minimum target size and pressed state.

## Verification

- Unit tests prove essential CMS fields survive normalization and customization.
- Registry tests prove risk-first ordering, overdue/public tie-breaks, stable
  ordering and queue-key coverage.
- Inbox tests prove chips come from the registry, quick scopes select the right
  queues and rows show safety/SLA/public signals.
- Run focused Vitest suites, TypeScript checking and lint on changed files.

## Rollback

All changes are additive client metadata and presentation logic. Rollback is a
single code revert; no database migration or data rewrite is required.
