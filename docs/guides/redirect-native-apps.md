# Native app associations for Redirects

This candidate adds app registration and host-specific association documents.
**It does not yet complete native routing or deferred attribution.** A native app
must resolve a received short URL through the policy-aware flow before opening
content. Do not treat the existence of an association file as proof that password,
expiry, visit limits or attribution work in an app. Actual app IDs, entitlements,
release certificates and device verification remain release prerequisites.

Owners can open Workspace settings → Manage native apps. Register the app with a
label, platform, hostname and allowed path patterns. New registrations start
disabled. Publishing requires an explicit selection; saving does not upload or
install an app. Use the actual signed application's identity, never fixture IDs.

For iOS, provide the full application identifier prefix and bundle ID, for example
`ABCDE12345.org.yourcompany.app`. Configure the corresponding associated-domain
entitlements in the app for every hostname it uses. Queer Guide serves
`/.well-known/apple-app-site-association` and the legacy root file without a
redirect. The document grants only `applinks`; it does not grant password sharing.
See [Apple's associated domains guide](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
and [universal-link debugging guidance](https://developer.apple.com/documentation/technotes/tn3155-debugging-universal-links).

For Android, provide the release package name and one to ten SHA-256 signing
fingerprints. Input accepts hex with or without colons and normalizes it. Use
Google Play's app-signing certificate when Play App Signing is enabled. The
`/.well-known/assetlinks.json` file grants only URL handling and includes dynamic
path rules. Those dynamic rules require Android 15+ with Google services; older
versions depend on the app's static manifest filters. Keep those filters as narrow
as the configured host/path scope. See [Android's website association guide](https://developer.android.com/training/app-links/configure-assetlinks?hl=en).

Each host supports up to ten bindings, each with one to twenty path patterns.
Patterns begin with `/`, use letters, digits, hyphens and `/`, and optionally end
with `*`. Built-in hosts accept `/go/` patterns only; a built-in binding applies to
both queer.guide and www.queer.guide. Custom-domain bindings apply only to that
hostname. Changing the host in the editor resets the paths. Disabling or removing
a binding changes the next response; Apple and Android may retain previous cached
associations. Inspect the exact host's file and verify on real signed devices.

The public response includes only platform identifiers, signing fingerprints and
path rules. It excludes labels, owners, revisions, DNS challenges and domain
settings. It checks the publishing owner's current admin role. Custom hosts also
require current ownership proof and provider/TLS readiness. Unknown/unready custom
hosts return JSON 404; configured hosts without published bindings return empty
valid documents. Upstream failures return JSON 503 rather than SPA or error HTML.
Responses are no-store, bounded to 64 KiB, and never follow HTTP redirects.

The Pages middleware handles these paths before SEO/localization/asset fallback.
The branded-domain Worker handles them before normal slug/password routing. Both
use a fixed Supabase endpoint, public gateway credentials and the actual request
hostname. They omit visitor cookies, authorization and relay secrets. Provider
and filesystem deployment have not been performed by adding this candidate.

Owner-session REST routes under `/api/redirects`:

- `GET /apps?offset=0`: `{data,count}`, 100 records per page.
- `POST /apps`: label, platform (`ios`/`android`), appId, nullable domainId,
  fingerprints, paths and optional enabled (default false).
- `PATCH /apps/:id`: current UUID `version` plus supplied changes; omitted fields
  remain. Include valid fingerprints when switching to Android and an empty array
  when switching to iOS.
- `DELETE /apps/:id`: JSON body `{version}`. Stale updates/removals return 409.

Only current owner sessions can administer bindings. Member and machine API keys
cannot publish or remove associations. Recheck authority in SQL under the workspace
ACL lock; no direct anonymous/authenticated Data API table/function grants exist.
The public gateway endpoint is `/public-app-association?hostname=...&platform=...`.
Registry drafts retain their reviewed version on conflict. Reload explicitly to
replace them with current settings; mutations do not retry automatically.

The policy-aware JSON transport is described in
[Native resolution](redirect-native-resolution.md). Association files authorize a
host; clients must still resolve each link against live policies. A local
[Swift client](../../sdk/redirects/swift/README.md) consumes that transport; the local [Android client](../../sdk/redirects/android/README.md)
also resolves live policies.
Deferred attribution and real signed-device verification remain required.

## App Clip identities

An iOS binding may also set an optional `appClipId`, such as
`ABCDE12345.org.yourcompany.app.Clip`. It must extend the signed parent app ID;
another team/parent, the parent ID itself, an Android binding, duplicate clip
identities on the same host and stale saves are rejected. Clear it with null to
remove that grant. It is published only with an enabled binding and current
publisher/domain readiness. Private labels and revisions remain absent from public
association data.

Apple's AASA file then contains an exact `appclips: { apps: [...] }` section in
addition to the existing full-app path rules. Android's document stays unchanged.
The gateway validates/reconstructs this explicit bounded grant and continues to
reject unknown permissions or unrelated App Clip identities. App Clip authorization
covers the host; narrow invocation experiences and both targets' capabilities
must be configured with Apple. See [registering a Clip identity](https://developer.apple.com/help/account/identifiers/register-an-app-id-for-app-clips/)
and [website associations](https://developer.apple.com/documentation/appclip/associating-your-app-clip-with-your-website).

This registers host authorization. Receipt creation, deferred install attribution,
App Group migration and real signed-device verification remain unfinished; do
not treat this setting as an installed App Clip or a working store experience.

## Deferred transaction foundation (not activated)

Apply `redirect_resolution_snapshots` before deploying the updated resolver. It
loads routing/protection together and rejects a visit if an edit invalidates that
snapshot before recording. RPC failures fail closed; they do not use the old
unguarded writer.

`redirect_native_handoff_receipts` adds private service-only create/context/consume
functions and a default-false app handoff flag. The table stores only token hashes
and references to the original event/app/source/policy version, with bounded TTL.
Creation and visit reservation share one transaction. Redemption validates the
current policy and selected outcome, consumes once and reuses the original click.
The caller must verify the current password and use the shared live selector before
calling the consumer; these SQL functions are not public authentication endpoints.

The resolver and gateways now support explicit receipt transport, while existing
apps remain opted out. Owner store configuration, browser handoff, SDK receipt
methods/platform adapters and scheduled expiry cleanup are subsequent work. Do not set the private flag to claim a working deferred link
or distribute a raw receipt in URLs, logs or browser storage. Actual signed OS
installation and App Group/referrer delivery still require device proof.

The opt-in native wire keeps the six-field JSON result. Creation uses the ordinary
short URL with `qg_handoff=install`, native Accept and granted attribution consent,
`X-QG-Handoff-Action: create` and `X-QG-Handoff-App` set to the configured binding
UUID. A successful creation additionally returns `X-QG-Handoff-State: created`, a
256-bit capability in `X-QG-Handoff-Token` and `X-QG-Handoff-Expires` as ISO UTC.

Resumption uses the canonical source with only `qg_handoff=resume`, the same app/
consent headers, action `resume` and the capability in its token header. It restores
query/cohort from the original event and returns state `consumed` with the original
click. It never increments the visit count again. A current password, if required,
uses the existing bounded form POST. Missing tokens/headers, denied consent and
mismatched markers fail without becoming a new visit. Password failures do not
consume the receipt. Gateways validate and reconstruct receipt metadata; success
without the expected metadata is an unknown outcome, with no automatic retry.

Markers currently select this explicit native protocol. A browser install/resume
landing page is still pending; a browser marker request fails without a Location
or a visit. No token is accepted through a query parameter. These APIs do not prove
Play delivery, App Clip functionality, persistence or the signed OS transition.
