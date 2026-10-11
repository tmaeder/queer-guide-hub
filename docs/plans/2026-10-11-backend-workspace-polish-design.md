# Backend workspace polish

Status: approved by the user on 2026-10-11; implementation in progress.

## Objective

Apply a polished, UX-optimized and decluttered admin interface across navigation, daily operations, content management, review and editing. Success means administrators can identify the next useful action, locate a record, make a decision and save changes with less visual competition.

## Current evidence

- `AdminShell` retains a breadcrumb band and area hint on routes that have not adopted an archetype frame. `AdminPageHeader` also renders route context, title and subtitle, creating repeated orientation information.
- `AdminSidebar` expands Cockpit, Content and Data by default. Its compact mode flattens all authorized destinations into a long icon rail. Navigation search and the global command palette already exist and should be reused.
- `ContentListPanel` already has saved views and a consolidated workspace surface. Its header still exposes refresh, type-specific tools, export and creation together. Search competes with filter, sort, archived state, merged state and presentation controls.
- `TriageFilterBar` displays quick scopes and every queue chip in the same horizontal strip. As queue coverage grows, administrators must scroll to discover routine filters.
- `CMSEditorLayout` and `EditorSidebar` already separate fields from workflow and supporting tools. The refinement should strengthen that separation rather than introduce a new editor.
- `AdminDashboard` already prioritizes Needs you and Broken. Retain this operational hierarchy.
- Existing work in the checkout touches shared CMS and review components. Implementation must extend the current state and preserve those changes.

## Approaches

1. Cosmetic polish: standardize spacing and typography. Lowest behavior risk, but leaves control overload and navigation density unresolved.
2. Calm editorial workspace — recommended: preserve capabilities, consolidate controls, reveal supporting tools on demand and sharpen task hierarchy.
3. Dense power-user console: emphasize shortcuts, tighter rows and more controls visible simultaneously. Useful for specialists, but inconsistent with the requested decluttering.

## Recommended interaction design

### Navigation and orientation

- Preserve canonical routes, role visibility, route authorization, pins and command actions.
- Keep daily work prominent; use collapsible sections for less frequent destinations, with the current destination discoverable even when its section is otherwise closed.
- Preserve explicit labels in expanded navigation. Use compact mode deliberately rather than presenting a long wall of indistinguishable controls.
- Remove repeated context bands only where the page supplies equivalent orientation. Keep a clear route back and one page heading.
- Use count badges for actionable context; prioritize review and overdue signals over routine inventory decoration.

### Content workspace

- Header: title, record count and New record as the strongest action. Move eligible secondary actions into a labelled menu; assess type-specific controls individually because they may contain complex interactive content.
- Toolbar: search first, filters next, and a single presentation/settings entry point. Keep selected filters visible and removable.
- Keep saved views readable as presets for this workspace, including save/reset behavior when a preset changes.
- Make record identity the strongest table element. Status and operational context remain readable; secondary metadata has less emphasis.
- Preserve selection, inline editing, bulk actions, pagination, lifecycle state, merge operations and all existing display modes.

### Review workspace

- Keep safety, overdue and public-impact scopes easy to reach.
- Put the complete queue selector behind one clearly labelled control with selected state and counts. Support multiple queues without a long mandatory horizontal strip.
- Keep item identity, decision-relevant evidence and the primary review action prominent.
- Retain confirmation requirements, provenance, structured comparisons, bulk restrictions and queue navigation.

### Editor

- Keep title, save state and the primary Save action visible during long edits.
- Keep field navigation clear and responsive. Supporting SEO, revisions, metadata and assistance tools expand when requested.
- Preserve workflow state, validation messages, unsaved-change protection, enrichment, media, organisation locations and queue advancement.
- On narrow screens, stack supporting tools below the main fields or disclose them through existing accessible overlay primitives.

## Visual contract

Extend the existing Subway Map design system: Space Grotesk operational typography, paper/ink surfaces, semantic radii, restrained shadows and hairline row dividers. Do not introduce a competing palette or elevation system. Use text and icons together for important states. Maintain visible keyboard focus and practical touch targets. Support light and dark themes and reduced motion.

## Verification and completion evidence

- Focused tests must cover navigation disclosure and current-route access, secondary action availability, filtering and saved-view behavior, multi-queue selection, editor save/validation and role restrictions where changed.
- Run the repository type-check gate and lint changed implementation files.
- Render representative dashboard, content list, review and editor screens at desktop and narrow widths; inspect overflow, heading hierarchy, control discoverability, empty/loading/error states and keyboard access.
- Run the Impeccable mechanical detector once on the finished changed UI and resolve applicable findings.
- A design document or green unit test alone does not prove the redesign complete. Final review must confirm the rendered shared surfaces implement the approved design.

## Implementation boundary

This is an interface redesign. Data permissions, canonical routes and record lifecycle semantics remain authoritative. No database changes or production release are needed solely to apply this design. Document any runtime verification blocked by unavailable authentication rather than claiming it passed.
