# Approved station-poster footer

The user approved the station-poster direction: an oversized queer.guide wordmark along the bottom, compact navigation above, and quiet utilities. Keep the same width as the header and remain compact on mobile.

Preserve the existing ink/paper Subway palette, Anton wordmark, bold Space Grotesk navigation, island geometry, visible safety/privacy controls, secondary-link disclosure, localized routing and display preferences. Do not add decorative colors or illustrations. The oversized brand lettering intentionally exceeds the ordinary display scale on desktop to make the approved poster composition convincing. Scale it down fluidly on mobile without clipping or squeezing tap targets.

Move the brand to the bottom. Consolidate essential links and Site information into a wrapping utility group so mobile loses an unnecessary row. Keep display preferences together. Verify desktop, 390 px and 320 px widths, header alignment, no overflow, disclosure keyboard behavior, consent preferences and route coverage.

## Verified implementation

Moved the home-link wordmark below navigation and utilities and scaled its lettering fluidly from the existing display token to a desktop poster size. Consolidated Site information into the essential-link wrap, preserving its native keyboard disclosure and all destinations. The compact footer variant remains unchanged.

Browser checks pass at 1440, 390 and 320 px: exact header alignment, no horizontal overflow, 20 px bold primary navigation, two columns on mobile, visible targets at least 44 px, expanded secondary-link targets, keyboard focus, disclosure Enter/Space behavior, active Knowledge navigation and cookie-preference reopening. Confirmed the wordmark sits below rather than overlapping controls. Panel heights are approximately 495 px desktop, 464 px at 390 px and 496 px at 320 px; the previous mobile panels were 490 px at both widths.

All 55 targeted tests passed; the 11 Footer tests also passed after final stylesheet extraction. Scoped ESLint, formatting, design detector and git diff checks pass. Desktop and mobile screenshots are saved in outputs/station-poster-footer-2026-10-23 outside the worktree. Fixed page overlays were hidden only for screenshot capture. Not deployed.
