# Floating contribution button at the footer

The fixed contribution trigger currently paints over footer links and copyright at both desktop and mobile sizes. Keep the existing footer density, styling, dimensions and touch targets.

The trigger yields while the page footer intersects the viewport and returns after scrolling back above it. Use IntersectionObserver rather than a scroll handler or fixed footer-height assumption, so compact, translated and expanded footers work at every viewport. Reconnect on route changes; pages without a footer retain the trigger. Hide only the trigger, preserving any open contribution dialog.

Verify trigger visibility in both scroll directions, route changes, observer cleanup and dialog continuity. Inspect desktop and mobile together locally, then deploy through the protected main workflow. Verify the live build and desktop/mobile footer with no screenshot-only hiding, plus contribution access away from the footer and the full deployment smoke test.
