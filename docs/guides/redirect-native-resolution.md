# Policy-aware native link resolution

This candidate adds a JSON transport on the existing canonical short URLs. It
uses the same live resolver, password checks, targeting, atomic visit/quota
transaction and hostname proof as ordinary web navigation. The local [Swift package](../../sdk/redirects/swift/README.md) consumes this
protocol. A local [Android client](../../sdk/redirects/android/README.md) provides
the same transport and navigation contract. App installation/deferred attribution and signed-device
verification are still required; this transport alone does not prove an installed
app opens correctly.

Request the actual HTTPS built-in `/go/<slug>` or branded-host link with:

```http
Accept: application/vnd.queer-guide.redirect+json
```

Do not put API credentials or passwords in the URL. Restrict the source hostname
to configured short-link hosts before making a request. Native requests reject
`pw`/`password` query parameters. Protected links return HTTP401; submit the
password only with a form-encoded POST to the same canonical short URL:

```http
Content-Type: application/x-www-form-urlencoded
```

Keep the Accept header on that POST. Maximum password/form limits and existing
server-side throttles still apply. Native resolution requests represent visits;
never retry automatically after an uncertain result. HEAD is observational,
returns no body and records no visit. It still checks availability and quota.

A successful GET/POST returns HTTP200 with this closed shape:

```json
{
  "protocol": 1,
  "canonicalUrl": "https://queer.guide/go/example-link",
  "destination": "https://example.org/content#section",
  "statusCode": 302,
  "mode": "navigate",
  "clickId": null
}
```

`statusCode` describes the effective redirect, while the native transport status
is 200. A successful password-form POST uses effective status303 to prevent its
body being forwarded to the destination. Ordinary link requests retain their
configured status. See [HTTP303 semantics](https://www.rfc-editor.org/rfc/rfc9110.html#name-303-see-other).
Browser clients also receive 303 after successful password submissions; the
resolver never intends the password form body to be sent to another site.

`mode=navigate` allows the app to map a known destination into native navigation.
It does not authorize arbitrary in-app routes or bypass the destination app's own
authentication. Open destinations outside the app's configured content hosts in
a browser. `mode=web` is the direct web fallback for expired/default-domain routes
and cloaked links; it must not become app content navigation. Native JSON does
not render an iframe or social preview. Crawler user agents cannot use preview
rendering to avoid the native visit transaction.

Attribution defaults to denied. Only send the following after explicit consent:

```http
X-QG-Attribution-Consent: granted
```

A click ID is returned only when consent is granted and the link enables conversion
tracking. It matches the single `qg_click_id` parameter in the resolved URL. Without
both conditions the result has a null clickId and no tracking ID in its URL.
Do not infer consent, fingerprint a device, or persist attribution before consent.
Tracking lead/sale events remains a server-side scoped API operation; never embed
server credentials in an app. Aggregate visit behavior follows existing routing.

Errors retain their HTTP status and return `{protocol:1,error:"..."}`:

| Status | Error                   | Action                                                          |
| ------ | ----------------------- | --------------------------------------------------------------- |
| 400    | invalid_request         | Correct the request; keep passwords out of query strings        |
| 401    | password_required       | Ask for a password; wrong/missing values share this response    |
| 404    | not_found               | Stop; the link/domain is unavailable                            |
| 405    | method_not_allowed      | Use GET, HEAD or form-encoded POST                              |
| 410    | unavailable             | Stop; expiry or the visit limit prevents opening                |
| 429    | rate_limited            | Respect the bounded Retry-After before a user-initiated attempt |
| 502    | upstream_unavailable    | The native protocol could not be validated                      |
| 503    | temporarily_unavailable | Show an availability error                                      |
| 508    | loop                    | The destination points at another managed short-link host       |

Destinations, private policies, password hashes and branding HTML are absent from
errors. Gateways bound response bodies to 64KiB, revalidate protocol/source/URL/
attribution fields, and strip unexpected fields/headers. They do not follow a
redirect or silently interpret old HTML/Location responses as native support.
Responses are no-store and vary by native Accept/consent. Deploy the updated
resolver before switching gateways/clients; an older upstream fails clearly.

Local evidence includes the real built-in Pages and signed branded Worker,
actual resolver and migrated PostgreSQL. Fixtures exercise password POSTs,
consent, targeting, roots/fallbacks, quota, HEAD, expiry and disabled links. These
are isolated fixtures, not production or signed-device proof. The app association
setup is documented in `redirect-native-apps.md`.
