# Unified adult-access design

## Problem

Adult-content access currently uses several independent client states: a general
30-day age affirmation, a permanent marketplace acknowledgement, a map-only
session flag, a signed API cookie, Safe Mode, and intimate-profile consent.
Because these states do not recognize one another, a person can confirm that
they are 18+ repeatedly while moving between Tags, Marketplace, Map, Visual
Culture, profiles, and Intimate/Dating.

## Decision

Use one canonical adult-access confirmation throughout the application.

- Signed-in accounts use their existing account confirmation
  (`profiles.age_confirmed_at`, with signup metadata as the immediate source).
- Signed-out visitors use one durable browser confirmation.
- Existing general and marketplace browser confirmations are migrated into the
  canonical confirmation automatically.
- Confirmation has no arbitrary 30-day expiry. It remains valid until the user
  explicitly revokes it or clears browser data.
- Signing out does not erase the browser confirmation. On shared devices, the
  next signed-in account's own account state remains authoritative.
- Safe Mode remains a separate content-display preference. Age eligibility does
  not silently enable adult content.
- The server cookie mirrors canonical confirmation for protected API requests;
  it is not a second user-facing gate.

## User experience

The user sees one consistent confirmation dialog only when no durable account
or browser confirmation exists. Confirming on any supported surface unlocks all
other supported surfaces without another prompt.

Covered surfaces are:

- adult Tag pages;
- Tag cards, hover previews, related-tag and glossary links;
- Tag Hanky-code sections;
- Marketplace adult departments and listings;
- Map adult cultural filters;
- Visual Culture and cultural-node pages;
- profile Hanky signals; and
- Intimate/Dating onboarding.

Intimate/Dating feature activation remains an explicit, separate opt-in. Its
wizard does not ask for age confirmation again when canonical confirmation or
existing `consent_18plus_at` is present.

## Implementation

1. Make `useAgeAffirmation` the canonical hook and add migration from
   `qg.marketplace.ageAck` and the old timestamp payload.
2. Remove the 30-day expiry and sign-out revocation.
3. Make `useAdultAcknowledgement` a compatibility alias over the canonical hook
   while migrating call sites incrementally.
4. Replace map-only state with the canonical hook.
5. Make the single confirmation action refresh the protected API cookie.
6. Reuse one dialog component and copy across all adult-content surfaces.
7. Seed canonical client state from signed-in account age confirmation.
8. Skip the intimate consent step when prior consent exists; preserve explicit
   profile activation.

## Safety and verification

- Adult content remains hidden while Safe Mode is enabled.
- Adult Tags retain their `noindex` behavior.
- Protected API responses remain private and require a valid signed cookie.
- Tests cover legacy-state migration, same-tab and cross-tab synchronization,
  reload persistence, account restoration, navigation between adult surfaces,
  and the absence of a duplicate intimate age prompt.
