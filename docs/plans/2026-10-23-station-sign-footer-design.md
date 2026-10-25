# Approved station-sign footer

Approved by the user on 2026-10-23 following review of the playful production footer.

Use the existing Subway system: ink surface, paper typography, Anton wordmark, bold Space Grotesk navigation, and the header's exact island width and rounded geometry. Increase the wordmark and make navigation labels 20 px. Arrange navigation in two columns on mobile with at least 44 px targets.

Remove decorative colored bars, the corner route illustration, and the policy sentence. Keep Report, crisis support, Privacy and cookie preferences directly accessible. Put secondary links in a keyboard-accessible Site information disclosure. Keep language, currency and theme preferences together in a quiet row. Preserve all existing destinations, localized navigation, branding, active states and the compact footer variant.

Validate desktop and narrow mobile layout, header alignment, disclosure keyboard behavior, consent event and route coverage. Provide local desktop/mobile previews before a separate production release request.

## Implementation and verification

Implemented the ink station-sign direction with a 32 px Anton wordmark, 20 px bold navigation, a native Site information disclosure, directly visible essentials and grouped display preferences. Removed the decorative stylesheet and illustration. Added both new labels in all 11 locales and synced the public bundles.

Verified header alignment and no horizontal overflow at 1440, 390 and 320 px. All visible controls meet the 44 px tap-height requirement; mobile navigation uses two columns. Checked keyboard disclosure opening/closing and expanded link targets, navigation focus, active Knowledge route and cookie-preference reopening. The narrow preference row fits on one line. Screenshots hide fixed page overlays only during capture.

Validation: 55 targeted tests pass; scoped ESLint, formatting, locale synchronization, duplicate-key and placeholder checks pass. Typecheck ratchet passes with 681 existing errors and no new errors (baseline 782). Production deployment is not part of this implementation approval.
