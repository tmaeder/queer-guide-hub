# Owner DNS approval controls

This is an Operate extension of the existing Custom domains section. It inherits
its paper/ink typography, semantic status colors, hairline divisions, ordinary
buttons and inline setup. The approved DNS design already fixes provider-owned
approval and separate ownership/TLS/routing proof; no new visual identity or
approval decision is needed.

The first viewport names the current domain and explains who applies records.
Configured active domains can discover their provider, then review the exact full
CNAME and TXT names/values. An ordinary checkbox makes the record review explicit
before Continue to Cloudflare/Vercel. The signer response can navigate only to
the matching provider/template; a late result after unmount/account change cannot
navigate. Missing signing configuration has instructional text and no apparent
working setup action. Unavailable/unsupported providers retain the manual path.

A callback carries only its operation ID. An account-keyed panel loads the
current operation, ignores provider success assertions, and offers a fresh DNS
check. Missing proof instructs the user to allow propagation and use the existing
ownership checker; verified proof still points to separate certificate/routing
checks. Invalid/expired/changed operations have a clear error and dismiss action.
Dismiss removes only its own query field. Existing domain-version and account
keys reset stale row state; no new system tokens or permanent visual rules are
introduced.

Verification is bounded: focused interaction/API tests, one batched desktop/390px
browser inspection of record review and callback, at most one correction round,
one detector pass and fresh finish-review/documentation handoffs. Captures use
clearly labeled local fixtures with external requests blocked. Actual owner HTTP
and migrated SQL retain the authority for authorization, signing and DNS proof;
fixture UI captures do not imply a live provider approval.

The fresh finish reviewer returns `ship` for this UI extension: all four final
captures are valid, record review/provider return match the contract, mobile
reflow has no clipping and no material fixes remain within this scope. The
subsequent documenter finds no new durable design rules and leaves PRODUCT.md,
DESIGN.md, the system README and sidecar unchanged. Provider/live-release proof
remains outside that verdict. Saved fixture images are also available under
`outputs/redirect-dub-parity/dns-*.png` in the parent workspace.
