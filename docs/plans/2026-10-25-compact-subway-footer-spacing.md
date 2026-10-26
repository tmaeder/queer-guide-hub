# Compact subway footer spacing

User request: reduce vertical space between navigation, links and display controls, especially on mobile. Keep the approved subway pictograms, small wordmark, header width, all directly visible essentials including Terms, secondary disclosure and 44 px tap targets.

Reduce the full panel's vertical padding to 8 px on mobile and 16 px on desktop. Reduce the navigation-to-utilities gap to 8 px. Remove mobile gaps around display controls and branding, and place controls and branding on the same desktop row. Preserve the compact footer variant and existing behavior. Verify rendered heights, header alignment, overflow and tap targets on desktop and mobile before release under the existing deployment authorization.

Local verification: panel heights are 180 px desktop (previously 280), 376 px at 390 px mobile (previously 416), and 420 px at 320 px mobile (previously 460). All three match the header width, have no horizontal overflow and retain at least 44 px visible tap targets. Keyboard disclosure, active navigation, cookies, hover and reduced motion pass. The 11 existing Footer tests, scoped lint, formatting and design detector pass. Desktop/mobile screenshots were visually reviewed.

Narrow-phone confirmation: reducing the utility row's horizontal gap to 8 px lets the default links fit two rows at 320 px. Final heights are 180 px desktop and 376 px at both 390 and 320 px mobile (84 px shorter at 320 px). All visible targets remain at least 44 px, with no overflow and matching header width. Keyboard, disclosure, cookies, hover/reduced motion and active navigation checks pass after this refinement. The confirmation screenshots were visually reviewed.
