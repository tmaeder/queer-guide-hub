# Member conversion integration setup

Implement the approved member-installation scope using existing native Segment
and Google server-container adapters. Owners and current Members may configure
an integration; Billing and Viewer roles may inspect sanitized installation
metadata. Member writes manage their own installations, while Owners may revoke
any installation in the current workspace.

A private durable installation record binds provider, creator, immutable workspace,
request ID and one existing API-token row. Its credential has only
conversions:write, an explicit nonempty set of currently editable managed links,
an expiry within one year, and the installing member's immutable membership
binding. Owner installations retain current-owner checks. Generic credential
administration remains Owner-only. Every conversion rechecks the existing token,
member role and folder/link scope in SQL. Revoking an installation atomically
revokes its credential, preserving metadata for review.

Account-only endpoints validate exact fields and replay a stable request ID
without issuing another credential. Only the first successful creation returns
the plaintext key. A lost response can recover installation metadata, with clear
instructions to revoke/recreate if the one-time key was not saved. Never store
plaintext provider or Redirects secrets in installation metadata or query caches.

The UI offers a bounded editable-link picker, named provider setup, one-time key
handoff, existing adapter downloads, current credential state, and explicit revoke.
It distinguishes Redirects configuration from actual provider installation and
provider-debugger verification. No external provider account, webhook, permission,
email or payment is changed automatically.

Private tenant activation remains fenced. Tests must prove Member scope limits,
Viewer/Billing denial, current membership/folder revocation, Owner-only generic
key administration, idempotent creation, one-time secret disclosure, atomic revoke,
private metadata serialization and actual HTTP conversion handling.
