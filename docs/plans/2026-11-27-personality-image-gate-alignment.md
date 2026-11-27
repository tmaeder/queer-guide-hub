# Align personality publication image rules

The September quality backfill explicitly defines `image_status: unavailable` as
a resolved image state, but the older transition trigger still demotes that state
to draft. Production currently has 563 public profiles without a portrait in this
resolved state. Warren Casey has no diagnostic publication failures, yet that
trigger prevents his independently verified biography from being published.

Use the existing diagnostic rule in the transition trigger. Do not substitute a
copyright-restricted portrait or infer image consent. Preserve rejection of wrong
portraits, unresolved missing images, unsupported claims, duplicate records,
inconsistent dates and missing adult publication consent. Existing initials and
image-free card displays cover the unavailable state.

Regression coverage compares the diagnostic and transition outcomes for resolved,
missing and rejected images and exercises the other hard failures. Release Casey
with sourced English/German replacement text in one strict editorial batch. Carry
the other 29 private decisions forward; they cannot be published without new
evidence or the recorded consent requirements. Run production preflight, required
CI, one Pages deployment, and live English/German profile and privacy E2E checks.
