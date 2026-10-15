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
