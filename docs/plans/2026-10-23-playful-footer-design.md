# Playful footer refinement

Approved by the user on 2026-10-23.

Keep the compact monochrome footer, the header's exact capped width and responsive insets, and minimum 44 px mobile targets. Add small route-colored markers beneath the primary navigation labels using the existing INTENT_TRACK mapping. Markers stay visible on touch devices and extend on hover, keyboard focus, and the active route. Keep existing copy, routes, branding, preferences, safety links, and legal content.

Add a short curved route drawing along the lower edge, away from the copyright. This decorative detail is hidden from assistive technology, does not intercept pointer input, and contributes no layout height. The account variant stays focused and quiet.

Motion thesis: a route marker extends towards its destination when its navigation link is hovered or focused. Use one short CSS transition with natural deceleration, no loops or dependencies, and an immediate state change under reduced motion. Labels and focus outlines remain authoritative.

Validate footer and navigation behavior, desktop and phone width alignment, unchanged height, 44 px targets, keyboard focus, hover, and reduced motion. Capture desktop/mobile previews.
