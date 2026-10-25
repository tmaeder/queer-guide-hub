# Unified Email workspace

The user requested that Email and Email templates no longer be separate, with prior authorization to finish and verify in production autonomously.

Use one Email sidebar destination and embed the existing designer as the Templates tab. Compared with retaining a separate editor link, this keeps composition alongside the email tools. Moving the designer into a modal would constrain its canvas and complicate draft recovery, so retain the existing full-width workspace.

Tabs use the `tab` search parameter, preserving other parameters and browser history. The old `/admin/email-templates` route redirects to `/admin/email?tab=templates`. Navigation search finds Email through templates and designer aliases. Both canonical and legacy routes retain the admin role floor.

The designer loads on its first visit and stays mounted across tab switches, preserving edits and recovery guards. It uses the Email page heading rather than duplicating a page title. Templates remain accessible if the separate email overview request fails. Saving a template refreshes overview template choices. Content and branding links point to the integrated tab.

Validation covers URL restoration, browser back, retained drafts, overview failure isolation, navigation access, existing save/send safeguards, and production desktop/mobile flows. No backend or database changes are required.

Keep a stable tab-panel shell for each workspace section while the overview loads or fails, gating expensive child tools inside that shell. This preserves valid `aria-controls` relationships and exposes the pending state with `aria-busy`; regression tests cover every active section before load and after failure.
