# Android native link client

Local Java client usable from Kotlin/Java Android21+ apps. It resolves canonical
short URLs through the same live password, targeting, expiry and quota policies
as browser links. The source and Maven JVM build are local; nothing is published.
The client does not need server credentials or an Activity/Context.

Add `src/main/java/guide/queer/redirects/RedirectClient.java` to your Android module,
with `implementation("com.squareup.okhttp3:okhttp:5.5.0")`,
`implementation("com.squareup.moshi:moshi:1.15.2")` and INTERNET permission.
Use the Android variant selected by Gradle. Moshi decodes the protocol with strict
JSON syntax; the POM’s test-only org.json dependency only serializes fixtures. OkHttp uses AndroidX
Startup; if your app disables that initializer, follow its documented explicit
`OkHttp.initialize(applicationContext)` setup. See [OkHttp](https://github.com/square/okhttp).
Normal Android Java8 language/desugaring configuration still applies.

```kotlin
val redirects = RedirectClient(
    setOf("queer.guide", "www.queer.guide"), // add verified branded source hosts
    setOf("queer.guide")                    // app-owned content hosts
)
// Import kotlin.coroutines.resume / resumeWithException.
val result = suspendCancellableCoroutine<RedirectClient.Resolution> { continuation ->
    val call = redirects.newCall(java.net.URI(incomingLink), null, false)
    continuation.invokeOnCancellation { call.cancel() }
    try {
        call.enqueue(object : RedirectClient.ResolutionCallback {
            override fun onResponse(value: RedirectClient.Resolution) {
                if (continuation.isActive) continuation.resume(value)
            }
            override fun onFailure(error: java.io.IOException) {
                if (continuation.isActive) continuation.resumeWithException(error)
            }
        })
    } catch (error: RedirectClient.RedirectException) {
        if (continuation.isActive) continuation.resumeWithException(error)
    }
}
when (result.navigation) {
    RedirectClient.Navigation.APP -> routeImplementedPath(result.destination)
    RedirectClient.Navigation.BROWSER -> openCustomTab(result.destination)
}
```

`enqueue()` uses the client's I/O executor. The coroutine bridge above resumes
in its caller's coroutine context and connects cancellation to the socket.
`execute()` is also available, but blocks: run it on your I/O executor, never the
Android main thread. A call executes/enqueues once. Cancel it when abandoned and
close the client when its owning service ends. Java callbacks run on OkHttp's
worker; dispatch UI updates to the main thread. `withContext(IO)` alone does not
interrupt a blocking socket. Avoid retrying on coroutine restart, lifecycle resume,
recomposition or an uncertain network result: the server may have already recorded
the visit. The SDK sets retryOnConnectionFailure=false and adds no retries. Transport
connection management does not give an exactly-once delivery guarantee.

Only allowlisted public HTTPS short hosts can be requested. Fragments are omitted,
password query parameters rejected, and Android user-agent targeting is explicit.
Source and content host allowlists are separate. Only default-port HTTPS content
hosts in `navigate` mode become `APP`; HTTP, other ports, external hosts and `web`
fallbacks become `BROWSER`. Map only implemented app paths, with your normal
session/authorization checks. Open a browser fallback directly in a Custom Tab;
reopening the short URL can record another visit or re-enter the app.

The default consent is false. Pass true only after explicit consent:
`newCall(shortUri, null, true)`. A click UUID is returned only when the link and
consent allow it. Unexpected consent-denied attribution is removed from both the
URL and result. There is no persistent storage, cookie jar, credential store,
cache or device identifier. Your app must obtain consent before retaining or
forwarding attribution, and clear its own data on withdrawal. Send verified
lead/sale events from your server with scoped server SDKs; do not ship API keys
inside an Android app.

`RedirectException` carries a stable `reason`, HTTP `status` (0 for client errors)
and optional integer `retryAfter`. A 401 prompts for a password; then make a new
explicit `newCall(shortUri, enteredPassword, consent)` submission. Passwords are
1–256 UTF16 code units and use one encoded form value, including Unicode/literal
plus. A 429 retryAfter is limited to1–900 seconds. Wait before another user action.
Errors never expose upstream HTML or policy fields. Transport failures use status0 with `transport_failure`, `cancelled` or
`client_closed`, omitting raw network messages and causes. Show an error without
an automatic fallback request.

The dedicated OkHttp client disables cookies, cache, authenticators, interceptors,
HTTP redirects and SDK retries. Streams are bounded to64KiB and whole calls to ten
seconds, including a slow response body. Destination/source/protocol/shape/UUID
checks run before returning a typed result. IPv6 literals, private IPv4, unusual
numeric host forms, credentials and local/reserved hostnames are rejected. The
client never fetches a resolved destination.

From the repository root, run `node scripts/test-redirect-android.mjs` with JDK21
and Maven installed. `REDIRECT_JAVA_HOME` and `REDIRECT_MAVEN_BIN` may point to
local build tools. The runner loads its baseline JSON from the actual backend native-response
producer, compiles against Java8, treats source warnings as
errors (except the intentional obsolete target warning), then executes actual
OkHttp/TLS contracts using ephemeral certificates, fixed host allowlists, DNS
restricted to loopback and an internal socket adapter. It proves request forms,
consent, root identity, navigation decisions, strict payload/URL errors, cookie
isolation, no redirects/retries, size limits, cancellation and the ten-second
deadline. `mvn test` alone does not run this executable contract runner.
A GitHub Actions job runs the same command, followed by a separate directly
traced SDK build for native-language CodeQL. Test-only MockWebServer/TLS/fixture JSON
artifacts are not included in the client source.

This is JVM/transport evidence, not an Android build/install or App Link device
proof. Configure your actual package/signing fingerprints, narrow manifest intent
filters, verified association files and real signed-device tests. See
[app association setup](../../../docs/guides/redirect-native-apps.md) and
[the native protocol](../../../docs/guides/redirect-native-resolution.md).
Signed install/deferred-attribution proof, publication and production rollout remain
required; do not substitute device fingerprint matching.

The same cancellable, single-execution call type supports explicit handoffs:

```java
RedirectClient.Resolution created = redirects
    .newHandoffCall(shortUrl, appBindingId, null, true).execute();
RedirectClient.HandoffReceipt receipt = created.receipt;
RedirectClient.Resolution resumed = redirects
    .newResumeCall(receipt, enteredPassword, true).execute();
```

The UUID is the configured binding ID, separate from the Android package name.
Both methods require current explicit consent. They use form POSTs and bounded
header-only receipt metadata, preserving the existing callback/cancellation,
body-size, host, credential and no-retry safeguards. Creation returns a non-null
`receipt`; successful resumption returns `handoffConsumed == true`, the original
click and no new receipt. Invalid/missing metadata fails closed. The receipt's
`toString()` redacts its capability; never log or place its token in ordinary URLs.

The core stays stateless. The optional `platform/` adapter implements Play Install
Referrer delivery and durable attempts for Android API21+, separately from the
core JAR. It is source/local-artifact only, with no published Maven coordinate.
Build it with the contract command above (JDK21/Maven, network to Google Maven
and Maven Central). `platform/target/redirects-play-install.jar` contains only our
adapter classes; add it alongside the core and its dependencies. Your Android app
must also declare Google's official AAR so its manifest permission merges:

```kotlin
implementation("com.android.installreferrer:installreferrer:2.2")
```

Use the actual application package and registered binding UUID:

```java
PlayInstallHandoff installs = new PlayInstallHandoff(
    applicationContext, "your.actual.package", appBindingId, redirects);
installs.resumeAutomatically(currentAttributionConsent, enteredPassword, callback);
// Only after a new explicit user action following an uncertain result:
installs.retryAfterUserAction(currentAttributionConsent, enteredPassword, callback);
// Clear receipt data and cancel pending delivery on consent withdrawal:
installs.withdrawConsent();
// Close at the owning lifecycle boundary; the caller still owns redirects.
installs.close();
```

Callbacks run off the UI thread; dispatch any UI/navigation work to your app's
main executor. A successful callback can return null when an expiring consumed
marker already exists: no navigation is owed. Keep one app-wide adapter instance;
an optional constructor accepts up to20 configured binding UUIDs for one package.
The current Context package must match. Construction does not query Play or send
HTTP. False consent clears SDK data without a provider request.

The adapter reads only Play's referrer string, validates the exact first-party
version/source/binding/token/expiry carrier and trusted source host, and resumes
using header-only capability transport. It never reads device identifiers or
referrer timestamps. The browser creates Android receipts before entering Play;
current consent in the installed app is independently required. Passwords remain
in memory and are never stored. Source, capability and expiry live only below
`Context.getNoBackupFilesDir()`, in private bounded files. An OS lock and atomic
fsync'd marker precede the provider attempt, and an attempted receipt precedes
HTTP. Unknown outcomes survive process restart without another automatic attempt;
a separate explicit retry reuses the saved receipt when available. Success drops
source/capability, retaining only an expiring consumed marker. Withdrawal clears
SDK receipt/temporary files and suppresses pending navigation.

The Play connection and core HTTP each have a ten-second deadline; connection
cleanup is attempted once on a separate daemon so a slow Binder close does not
hold up callback delivery. There is no automatic reconnect or transport retry.
An app can receive `already_attempted`, `referrer_unavailable`, `referrer_timeout`,
`invalid_referrer`, `invalid_store`, `store_busy`, `store_unavailable`,
`consent_required`, `consent_withdrawn`, `cancelled`, `operation_in_progress` or
`adapter_closed`; show an explicit recovery action without logging receipts.
SDK transport errors retain the core's bounded error type. Closing the adapter
cancels work but preserves an uncertain attempt; consent withdrawal clears it.

The runner compiles against SHA256-pinned Android API21 framework classes and the
actual Google2.2 AAR, without packaging either. JVM contracts execute the actual
adapter with module-private filesystem/provider seams, the actual browser carrier
producer, core loopback TLS, competing child processes, persisted unknown results,
restart suppression, explicit retry, consent revocation during HTTP, cleanup and
provider deadlines. This does not prove a signed app, real Play delivery, Android
filesystem behavior or device lifecycle. Complete those tests with the actual
package/signing/store identity before publishing or enabling production handoffs.
