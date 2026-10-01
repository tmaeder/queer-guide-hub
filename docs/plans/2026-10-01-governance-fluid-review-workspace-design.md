# Governance fluid review workspace

## Problem

The Governance inbox does not use the available viewport efficiently. Page-level header and status blocks consume vertical space before review begins, the desktop split is fixed, and smaller windows create excessive scrolling. The selected-item preview also exposes nested payloads as JSON/code instead of presenting information in reviewer-friendly language and controls.

## Approved direction

Build a viewport-filling review workspace with a compact command bar, independently scrolling queue and detail panes, and an adjustable desktop split. Treat the detail pane as a review form rather than a payload inspector.

## Layout

- Keep Governance within the existing admin shell, but collapse the page title, automation status, queue count, filters, search, sorting, and focus-mode entry into a compact control region.
- Prevent document-level scrolling inside the workspace. The queue and detail body each own their vertical scroll.
- On wide screens, show a resizable queue/detail split. Start near 35/65 and constrain both panes to useful minimum widths.
- On medium screens, reduce the queue width automatically while preserving the detail pane.
- On small screens, show the queue as the primary view and open the selected item as a full-width detail sheet.
- Keep review actions in a sticky footer so they remain reachable while the content scrolls.

## Review form

- Present common values with semantic formatting: paragraphs for prose, links for URLs, localized dates, chips for short lists, grouped address fields, and readable yes/no states.
- Use inline controls for fields that can be safely corrected during review. Preserve the original value, track dirty fields, and clearly distinguish unsaved corrections.
- Show existing and proposed values together only when a meaningful difference exists.
- Format nested objects recursively as labeled sections instead of serializing them into code blocks.
- Place the original normalized and enriched payloads inside a collapsed “Technical data” disclosure. Raw JSON is a diagnostic fallback, not the default experience.

## Interaction and safety

- Resizing affects presentation only and must not mutate review data.
- Opening, closing, filtering, and resizing remain reversible client-side actions.
- Existing approval, rejection, safety confirmation, namesake protection, and bulk-review guards remain intact.
- Inline corrections are submitted through the existing queue action payload when supported. Unsupported fields remain readable rather than presenting a control that cannot be saved.
- Preserve keyboard navigation and visible focus states.

## Verification

- Component tests for layout states, structured field rendering, edit tracking, and action payload forwarding.
- Focused lint and test suite for the Governance components.
- Visual checks at wide desktop, constrained desktop, tablet, and mobile widths.
- Confirm there is no page-level horizontal overflow and that both panes independently use the available height.
