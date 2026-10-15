# Native client implementation under the approved Redirects scope

Implement native clients against the reviewed vendor JSON protocol, beginning
with an independently compilable Swift package (iOS15+/macOS12+) using the Apple
runtime available here. A thin URL opener would bypass live password/targeting/
quota rules; a second native policy engine would drift. The client resolves the
canonical HTTPS URL through the existing server protocol and returns a validated
navigation decision to the host app.

Source hosts and app-owned content hosts are explicit separate allowlists. No
server credentials, HTTP redirects, cookies, persistent device identity, storage,
automatic SDK retries or implicit attribution consent. Passwords use bounded
form POSTs only; query secrets are rejected. Default denied consent also removes
attribution from an unexpectedly attributed response. Stream responses under a
64KiB budget and ten-second timeout; validate exact protocol shapes, source,
public destination, mode, statuses and matching UUID/query attribution. Errors
carry bounded status/retry metadata, never upstream HTML/body or passwords.

Use URLSession's streaming API and redirect delegate, ephemeral configuration and
cancellation. Keep platform navigation in the host: only navigate app-owned hosts
when mode permits, otherwise return an explicit browser decision. Password and
rate-limit UX remain the app's responsibility. Do not automatically reopen the
short URL after an uncertain visit result.

Regression tests must compile the package and exercise the actual URLSession
client with isolated URLProtocol responses, request headers/forms, strict malformed
payloads, consent on/off, password challenge, expiry web fallback, bounded bodies,
timeouts/cancellation and no persistent storage. These are not signed iPhone or
Android runtime evidence. Android clients, deterministic install/deferred handoff,
real app identifiers/certificates/entitlements and provider/device release remain
open; do not mark those fulfilled by a Swift fixture.
