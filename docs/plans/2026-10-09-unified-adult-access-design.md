# Unified adult-access design

## Problem

Adult-content access used separate browser states for Tags and Marketplace,
plus a repeated consent step in Intimate/Dating. The general Tag confirmation
expired after 30 days and was erased on sign-out. A person could therefore be
asked to confirm 18+ repeatedly while moving through the product.

## Decision

Use one canonical adult-access confirmation throughout the application.

- Signed-in accounts use their existing account confirmation
  (`profiles.age_confirmed_at`, with signup metadata as the immediate source).
- Signed-out visitors use one durable browser confirmation.
- Existing general and Marketplace confirmations migrate automatically.
- Confirmation has no arbitrary expiry and survives ordinary sign-out.
- Safe Mode remains a separate content-display preference.
- Intimate/Dating activation remains a separate explicit feature opt-in.

## Covered surfaces

- adult Tag pages;
- Tag cards, hover previews, related-tag and glossary links;
- Tag Hanky-code sections;
- Marketplace adult departments and listings; and
- Intimate/Dating onboarding.

Choosing “Include 18+ terms” in Tags records the canonical confirmation, so a
following adult Tag detail does not ask again. Intimate onboarding skips its age
step when canonical confirmation or existing `consent_18plus_at` is present.

## Safety

- Safe Mode continues to hide adult content until the reader explicitly asks
  to include it.
- Adult Tags retain their existing `noindex` behavior.
- Existing feature-specific opt-ins are not inferred from age confirmation.
