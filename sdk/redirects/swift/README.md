# Swift native link client

Local Swift package for iOS15+/macOS12+. It resolves canonical short URLs through
the live password/targeting/expiry/quota policies. Add this directory as a local
Swift package and import `QueerGuideRedirects`. It has no runtime dependencies,
server API key, storage, cookies or device identifiers. It is not published yet.

```swift
import QueerGuideRedirects

let redirects = try RedirectClient(
    shortHosts: ["queer.guide", "www.queer.guide"], // add your verified branded hosts
    contentHosts: ["queer.guide"]                // destinations your app implements
)
let resolution = try await redirects.resolve(shortURL, attributionConsent: false)
switch resolution.navigation {
case .app(let destination):
    // Map an implemented path to your app's router, with its normal authorization.
    routeInApp(destination)
case .browser(let destination):
    // Present SFSafariViewController or your explicit browser fallback.
    presentBrowser(destination)
}
```

Only HTTPS app-owned destinations on the default TLS port can become `.app`.
External destinations, HTTP, nonstandard ports, expiry/default fallback and
cloaking return `.browser`. Never reopen the short URL automatically: that can
create a new visit or an app-link loop. Do not interpret an arbitrary returned
path as a privileged app command. Destination authentication remains your app's
responsibility. A browser fallback should open the destination directly.

On `.unavailable(status: 401, ...)`, ask for a password and make an explicit
`resolve(shortURL, password: enteredPassword, attributionConsent: consent)` call.
Passwords are 1–256 UTF16 code units and use form POSTs, including literal plus
and Unicode values. They are never placed in query parameters. Wrong and missing
passwords share the same challenge. For 429, honor `retryAfter` (when present,
1–900 seconds) before another user-initiated attempt.

Attribution is denied by default. Only pass true after your app obtains explicit
consent. `clickID` is populated only when both the link and consent permit it.
If an upstream unexpectedly includes attribution while consent is denied, the
client removes it from the destination and returns nil. The SDK retains nothing;
your app must obtain consent before persisting/forwarding attribution and clear
its own data on withdrawal. Send verified lead/sale events from your server using
the scoped server SDKs; never ship those credentials inside an app.

Each call represents a visit, even if delivery fails after the server commits.
There is no SDK retry or fallback to following a Location response. Network
failures/ambiguous delivery require an explicit user decision. Apple networking
may perform connection management internally; the SDK does not add retries or
promise exactly-once receipt. Cancellation invalidates the ephemeral session.
Response streams are capped at 64KiB, sessions have a ten-second resource timeout,
and HTTP redirects are refused. Invalid/old HTML responses fail closed.

The SDK declares an iOS device user agent so iOS targeting applies. No trusted
country or source-IP header is invented. Source and content host allowlists are
separate; source links must use public HTTPS hosts with no credentials or password
query fields. IPv6 literals, noncanonical numeric hosts, local/reserved hostnames
and private IPv4 ranges are rejected. It does not fetch the resolved destination.

Association files, the app's `applinks:` entitlements and signed device tests are
still required. See [association setup](../../../docs/guides/redirect-native-apps.md)
and [the protocol](../../../docs/guides/redirect-native-resolution.md). An installed
app should pass the incoming universal link to `resolve`; an uninstalled app uses
the ordinary web redirect. Automatic post-install/deferred attribution is not
implemented by this package. Do not substitute device fingerprint matching.

From the repository root run `node scripts/test-redirect-swift.mjs`. It builds the
actual package and compiles/runs twelve native contract groups using the actual
backend JSON producer, URLSession and
isolated URLProtocol fixtures, without XCTest or external packages. A macOS CI
workflow runs the same command, then a separate directly traced SDK build
for Swift CodeQL. These tests prove the Apple Foundation client;
they do not prove Universal Link installation, device behavior, production gateway
deployment or package-registry publication.

The core also exposes explicit receipt methods for the configured opt-in transport:

```swift
let created = try await redirects.createHandoff(
    shortURL, appBindingID: appBindingID, attributionConsent: true
)
// An App Clip can use created.resolution for its useful functionality and retain
// created.receipt only in its configured, consented App Group adapter.
let resumed = try await redirects.resumeHandoff(
    receipt, password: enteredPassword, attributionConsent: true
)
```

The binding ID is the owner's configured UUID, separate from the signed bundle
identifier. Both methods require current explicit consent; they use form POSTs,
header-only capabilities and validated creation/consumption metadata. The receipt
has a bounded expiry and a canonical source without campaign/password/token query
data. Resume reuses its original click and server-side query/cohort. Source/content
host allowlists and normal app authentication still apply.

The core stores nothing and never retries an unknown create/resume outcome.
`RedirectHandoffReceipt` descriptions redact its token. Do not log or put that
capability in ordinary URLs, clipboard or browser storage. A configured platform
adapter must mark an automatic attempt durably before calling resume, validate
expiry/current consent, and clear data on consent withdrawal. No automatic App
Group migration, App Clip functionality or signed installation is implemented by
these methods. The Clip must not consume its own receipt before the full app.
