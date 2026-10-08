# Contribution Station Board

## Intent

Refine the merged contribution surface without changing its behavior, routes, permissions, or the product's incumbent visual identity. The result should balance premium operational clarity with a restrained amount of queer.guide's subway-wayfinding character.

## Direction

Use a “station board” composition for both the global dialog and `/submit` page wrappers.

- Present the four contribution branches as substantial destinations rather than plain cards.
- Give each destination a numbered station marker and a short outcome-oriented cue.
- Keep feedback and page correction visually primary; signed-in entity creation and flyer scanning remain available without competing for first attention.
- Use one restrained pink route-line gesture and monochrome tonal surfaces. Do not add a competing palette, elevation ladder, or decorative illustration system.

## Dialog

- Strengthen the title block with an eyebrow and short explanatory line.
- Use a roomier desktop composition with equal-height destination cards and clearer hover, focus, and active states.
- On mobile, make the chooser feel like a bottom sheet with comfortable touch targets and a compact vertical rhythm.
- Preserve Radix focus management, escape behavior, portal stacking, and the existing `z-[45]` FAB contract.

## Page Mode

- Center the contribution experience in a bounded panel aligned to the reading grid.
- Add a concise lede so the four choices have context.
- Keep destination surfaces visible against the page background; do not rely on transparent borders for hierarchy.
- Avoid duplicating the global page chrome or turning the utility into a marketing landing page.

## Forms and States

- Improve field grouping, category selection, context notices, action hierarchy, and mobile spacing.
- Keep anonymous screenshot behavior honest: screenshot controls remain hidden when uploads cannot succeed.
- Preserve existing success, loading, validation, and sign-in states while giving them a consistent visual finish.
- Keep every string localized and every control usable by keyboard, touch, and assistive technology.

## Motion

- Use small opacity/translate transitions for branch changes and card interaction.
- Respect reduced motion and avoid ornamental animation.

## Verification

- Inspect chooser, feedback, correction, add/sign-in, scan/sign-in, success, and disabled states.
- Capture desktop and 390px mobile renders in one visual pass, fix findings in one batch, then confirm once.
- Run the Impeccable detector once after UI changes, plus focused tests, lint, typecheck, i18n completeness, build, and production E2E after deployment.
