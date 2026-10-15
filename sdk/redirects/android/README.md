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
Automatic install/deferred attribution, publication and production rollout remain
required; do not substitute device fingerprint matching.
