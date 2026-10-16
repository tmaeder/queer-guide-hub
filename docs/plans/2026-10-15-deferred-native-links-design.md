# Deferred native links under the approved parity scope

## Outcome and approaches

A person explicitly chooses to install an app from a short link, then reaches the
same link context after installation, with consented attribution and current
password/availability/targeting rules. Association files and installed-app JSON
resolution alone do not complete deferred linking.

Use an opaque, short-lived, single-use receipt tied to the original reserved
visit. Android delivers it through Play Install Referrer. iOS uses the supported
App Clip -> full app App Group transition. A user-initiated resume link/paste is
an additional fallback, not a substitute for the automatic platform integrations.
Do not infer identity or consent from an address/device fingerprint. A cached raw
destination would bypass live policy; a second native resolver would drift.

Apple documents App Clip/full-app shared containers with the same App Groups
capability on both targets. Google documents a Play-account/device service and
its Install Referrer client. Those real capabilities, signing identities and
store configuration must be supplied and tested; local SDK fixtures are not
proof of either OS transition.

## Owner configuration and public boundaries

Extend the owner app registry with separately approved public display name,
store identity and handoff enablement (default false). iOS also needs its App
Clip identity and the app's declared shared group. Keep the existing private
label private. Construct store URLs from validated platform IDs on fixed Apple/
Google hosts. Association-only bindings remain usable without handoffs enabled.
Do not guess real store IDs or developer/team/group identities.

An explicit app choice must match an enabled path binding on the actual source
hostname, published by a current owner. Multiple overlapping apps require an
explicit choice. Domain ownership/provider/TLS freshness and publishing authority
are checked at creation and redemption. Reuse association eligibility rules.
App Clips require an explicit bounded AASA appclips projection, not unvalidated
extra permissions in upstream JSON. Existing app/fingerprint/path grants remain.

## Visit and receipt transaction

A native install-creation request goes through the same canonical URL, password
form/throttles, live targeting, loop, scheduling, expiry and quota logic. It
requires declared attribution consent and an eligible handoff-enabled app. It
reserves exactly one visit and mints exactly one receipt in the same database
transaction. No arbitrary public click ID can mint another receipt.

Generate a random256-bit token; retain only its SHA256 hash in the private table.
Bind it to original click/link, canonical source, selected app/platform/binding
revision, routing-policy fingerprint, original query/variant and bounded expiry.
Use the existing visit/event as the query/attribution source; do not copy customer
identity, passwords, raw addresses or device identifiers into the receipt.

The routing fingerprint includes semantic link/policy/password/namespace inputs,
not changing counters or generic updated_at. All writers already use redirect
row -> policy row order. Read a consistent service-only snapshot (including its
fingerprint); after password checks, lock in that same order and verify the
fingerprint/current source again before recording or redeeming. Computing a
fingerprint separately after loading an older policy would leave a TOCTOU gap.
No private snapshot/hash/password data goes into a public response.

Expiry is at most24h and no later than link or active experiment expiration.
Changing routing/protection/binding state invalidates the receipt. Deleting the
original event/link cascades it. Disabled/unready/revoked publishers cannot redeem.
Failed password submissions do not consume receipts. Rate limits and bounded
expiry cleanup use private, service-only SQL functions; no anon/auth table grants.

A successful redemption consumes once under lock and returns the original click
ID, without incrementing click_count or inserting a second click. Its quota was
already reserved by creation. New requests still obey the ordinary quota; changing
the limit invalidates the fingerprint. This is a continuation of that reserved
visit, not an extra quota grant. Concurrent/replayed redemptions fail closed.

Re-evaluate actual device/geo/current policy using the shared target selector.
For an unchanged active A/B test, restore the original variant's bucket. Verify
that the final selected destination/variant still matches the original visit;
changed geo/device/experiment outcomes must not silently reuse old attribution.
Expired/fallback/cloaked states cannot mint or redeem native navigation receipts.
Keep existing password and current-link checks before disclosure. Use existing
400/401/404/410/429/503 envelopes; no new policy engine or unbounded error metadata.

## Transport and browser handoff

Preserve the existing closed six-field native JSON shape. Creation/resumption
uses explicit validated action/app/token headers on that native transport; gateways
forward only bounded supported fields and reconstruct supported receipt headers.
Raw tokens never go into a query, log, referrer, cached response or browser storage.
Successful creation returns its receipt metadata only to the consented requester.
An older gateway that omits it must fail clearly; never retry creation automatically.

Use reserved install/resume query markers only to select a first-party no-store
landing page, not to redeem a token or redirect elsewhere. Resume tokens live in
a fragment that the page captures in memory and removes from history. The server
must recognize the resume marker and avoid forwarding that fragment to an external
Location fallback. Native clients transmit the token only in its validated header.
A marked native resume without a supported token must not silently become a new
counted visit. An explicit clean-link user action may start an ordinary new visit.

The landing page offers app choice, password when required, clear optional consent,
install/continue and web fallback. No hidden visit is recorded by rendering it.
Create the receipt only on the user's install action, then construct the Google
Play referrer and/or user resume link. Bound provider payload lengths. Original
campaign query data comes from the server event, not a store URL. Do not embed a
password, cached destination, private app label or customer data in the provider
payload. Use a strict CSP, escaped public labels, no external token-bearing images,
and no automatic clipboard access. iOS store install alone cannot carry this data;
its automatic flow must invoke a configured App Clip/group, with a visible fallback.
For Android, the consented browser install action creates the receipt before the
Play handoff. For the App Clip path, the Clip itself makes the consented native
creation request, uses that normal resolution for its own useful app functionality,
and retains its unconsumed receipt for the full app. Do not pre-create a second
browser visit for that path or consume the receipt inside the Clip. The adopter
must supply actual Clip functionality and Store configuration; an installer-only
mock is not an equivalent signed App Clip implementation.

## SDK adapters and lifecycle

Core clients remain stateless; optional platform adapters are explicit opt-ins.
Resume requires actual app identity, a trusted canonical host and current declared
consent. Android reads Play's referrer only after that consent, closes the service
connection, parses bounded exact keys and starts one native resume call. Service
errors/disconnects cause no automatic retry. The referrer is a capability carrier,
not app authentication and not permission to access private account data.

iOS stores only the bounded receipt/source/expiry/consent-purpose state in its
entitled App Group container, with backup exclusion and platform file protection.
Do not store passwords, personal identity or a persistent device ID. The full app
checks the same group, expiry, app identity and current consent before resuming.
An unavailable entitlement fails closed. Consent withdrawal clears adapter data.
The corresponding Clip/full-app signing and App Store setup need real device proof.

Mark an automatic attempt before making its network call so a restart/unknown
result cannot retry or double-deliver automatically. Clear/mark successful receipts.
A user can explicitly retry an uncertain request or open a clean current link;
never promise exactly-once network receipt. Server consumption remains atomic.
All navigation continues through current app-owned-host/browser rules and normal
app authentication. The SDK never runs arbitrary returned app commands.

## Verification and release

Verify actual SQL create/resume atomicity, quota reservation, role/domain/binding
revocation, policy/password/source/query changes, original A/B cohort, TTL boundaries,
cleanup, replay and concurrency. Exercise real gateways/resolver/migrated DB,
including protected POST and denied consent, without external provider calls.
Both native SDKs must consume actual backend-produced wire/receipt output and prove
no retries, persistence without consent, body/header limits or secret URLs.
Verify owner UI versions and install/resume browser states on desktop/mobile.

Then verify signed Play installation/referrer delivery and signed App Clip -> full
app group migration using the owner's real configuration. Provider/OS fixtures,
SDK publication, rollout order (schema -> resolver -> gateways -> clients/UI) and
runtime secrets/cron checks remain release requirements. Keep the full parity
ledger active until its other account/domain/report/provider/rollout requirements
are also proved.

Sources:

- https://developer.apple.com/documentation/appclip/sharing-data-between-your-app-clip-and-your-full-app
- https://developer.apple.com/documentation/xcode/configuring-app-groups
- https://developer.android.com/google/play/installreferrer
- https://developer.android.com/google/play/installreferrer/library
