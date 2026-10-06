# UX and Accessibility Remediation Design

Date: 2026-10-06
Status: Approved

## Objective

Remove the systemic UX and accessibility gaps identified in the Queer Guide public interface while preserving the existing subway visual language and avoiding unrelated in-progress work.

## Scope

1. Raise shared button and icon-button targets to at least 44 by 44 CSS pixels.
2. Replace silent homepage error-boundary fallbacks with recoverable, space-reserving section states.
3. Give homepage data sections explicit loading, error, empty, and success behavior.
4. Disable non-essential loading animation when the visitor prefers reduced motion.
5. Increase header and footer hit areas without materially changing their visual density.
6. Scan public interactive elements for remaining target-size exceptions and remediate high-confidence cases.
7. Add focused tests and run proportional lint, type, and component verification.

## Architecture

### Shared control sizing

The shared `Button` primitive is the primary enforcement point. Every size variant will provide a minimum 44-pixel block dimension. Call-site overrides in public navigation will be updated where they currently force a smaller size. Visual icon and text sizing remain unchanged, so only the invisible/painted interaction box grows.

### Section recovery state

A reusable homepage section fallback will:

- preserve a stable minimum height;
- identify the affected section in plain language;
- offer an adjacent retry action;
- use an icon and text rather than color alone;
- expose an appropriate live-region status without repeatedly interrupting assistive technology.

Homepage boundaries will use this fallback instead of `null`. Retrying resets the boundary and invalidates relevant cached queries through the existing error-boundary behavior where possible.

### Data-state contracts

Homepage query components will distinguish:

- loading: dimensionally stable skeletons;
- error: recoverable inline status;
- empty: honest explanatory copy plus an onward action where useful;
- success: existing content presentation.

No failed request may silently appear as an empty successful result.

### Motion

Skeleton pulse and decorative transitions will be guarded by `motion-safe` utilities or the existing motion-preference hook. Reduced-motion mode will retain visible state changes without continuous animation.

### Navigation targets

Header, footer, and persistent mobile navigation controls will provide at least 44 by 44 pixel hit areas. Footer links may use negative inline margins paired with padding so layout rhythm remains visually unchanged.

## Verification

- Component tests for shared button sizing and homepage recovery states.
- Existing homepage, layout-shell, and navigation tests.
- Targeted ESLint and TypeScript checks for touched files.
- Static scan for explicit dimensions below 44 pixels on public interactive elements.
- Responsive review at 320, 390, 768, and 1280 pixel widths when the local runtime permits.

## Constraints

- Preserve current branding, information architecture, translations, and route behavior.
- Do not modify unrelated dirty files.
- Avoid broad automated rewrites where target size depends on surrounding layout.
- Prefer shared primitives over repeated call-site patches.
