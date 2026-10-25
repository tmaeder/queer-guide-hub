# Subway pictogram footer refinement

User request: make the current compact footer more playful using the Subway design system. Preserve the small wordmark, header width, compact mobile layout and all existing controls.

Use the destination pictograms already provided by INTENT_NAV, each on a small paper tile so its ink outline remains legible in both themes. Use existing INTENT_TRACK mapping for the destination's underline on hover, keyboard focus and the current page. Add one small icon tilt/lift on pointer hover with reduced-motion support. Retain the ink panel, two-column mobile layout, 44 px targets and quiet utilities. Fit icons with the existing 15 px mobile text token; retain 20 px navigation on desktop. Do not add decorative route drawings or oversized branding.

## Verification

Rendered desktop 1440 px and mobile 390/320 px together and inspected the screenshots. Header alignment, no overflow, all seven destination icons, small wordmark, minimum 44 px targets and expanded disclosure link targets pass. Panel heights remain 280/416/460 px respectively, matching the restrained revision. Narrow mobile can wrap a long label within its tap target without increasing the grid row height. Tested keyboard disclosure and navigation focus, active Knowledge navigation, cookie preferences, hover icon motion and reduced-motion suppression.

All 55 targeted tests, scoped ESLint, formatting, design detector and diff checks pass. Screenshots are stored outside the worktree in outputs/footer-subway-pictograms-2026-10-23. Fixed page overlays were hidden only while capturing screenshots. Not deployed.
