# Redirect DNS provider onboarding candidate

`queer.guide.redirects.json` is a candidate for the public Domain Connect template
repository. It is not registered or active. Its CNAME target is fixed to
`links.queer.guide`; the only template variable is the ownership TXT value. Using
the protocol's host scope produces the CNAME at `host.domain` and ownership TXT
at `_qg-redirect.host.domain`. No apex setup is offered by this candidate signer.

The server signing module is `_shared/redirect-domain-connect.ts`. It emits RS256
query signatures, places `sig` last and excludes `key`/`sig` from signing. Callback
correlation is inside the signed, fixed-origin `redirect_uri` because Cloudflare
ignores `state`. It is a pure helper: it does not authorize a user, discover DNS,
create a setup operation, contact a provider, activate records or change readiness.
The authenticated API, bounded discovery, stored review/sign/issue operations and
fresh TXT callback verification are now implemented separately in
`_shared/redirect-domain-connect-api.ts`. Admin controls and live provider/key
onboarding still need completion before exposing a setup button.

Operator prerequisites:

1. Confirm the dedicated SaaS CNAME target is actually `links.queer.guide` and
   publicly serves the configured branded relay. A different target needs an
   amended/reviewed template and matching signer constant; it is not a free input.
2. Create and securely configure an RS256 private key. Publish the corresponding
   public key under a rotation label at `domainconnect.queer.guide`, following the
   protocol's ordered TXT chunk format. No private key belongs in this repository.
3. Submit the candidate to the official template repository and complete DNS
   provider onboarding. Cloudflare requires separate contact and onboarding after
   the upstream template PR merges. No upstream PR, DNS record or email has been
   submitted by this implementation.
4. Confirm the exact template is available at the discovered provider, including
   Cloudflare and Vercel, before enabling the provider's approval flow. Request
   Cloudflare DNS-only CNAME proxy status for this SaaS target during onboarding.
5. Complete the approval UI and exercise the implemented owner authorization,
   versioned bounded storage, fixed-provider discovery, callback/session checks
   and current TXT DNS verification against the approved provider. Callback success alone must never establish ownership/TLS
   or routing readiness. Rotation, disabling, role loss and stale versions must
   reject an obsolete operation; unknown outcomes must not retry external writes.
6. Verify apex-domain requirements separately. No platform A/AAAA address or
   provider-specific apex behavior is assumed by the subdomain template.

Validation on2026-10-16: official dc-template-linter131
(`v0.0.0-20260921163445-6e8ca43761a9`) exits0 in standard and `-cloudflare` modes.
Cloudflare emits informational notices for ignored `syncRedirectDomain` and
`hostRequired`, and CNAME flattening when the record is rooted at the scoped host.
No errors or warnings were suppressed. The signer itself enforces non-apex scope
and a fixed callback. Four tests verify template scope, actual WebCrypto signing
and tamper failure, IDNs/nested hosts, invalid fields and key type. Test keys are
ephemeral and never written or published. This is protocol evidence, not provider
approval or live DNS-change evidence. Read-only discovery now has isolated
provider fixtures; see the custom-domain guide for the authenticated API contract.

Sources:

- [Domain Connect specification](https://github.com/Domain-Connect/spec/blob/master/Domain%20Connect%20Spec%20Draft.adoc)
- [Cloudflare onboarding and supported fields](https://developers.cloudflare.com/dns/reference/domain-connect/)
- [Official template repository](https://github.com/Domain-Connect/Templates)
- [Official linter](https://github.com/Domain-Connect/dc-template-linter)
- [Vercel Domain Connect](https://vercel.com/changelog/vercel-now-supports-domain-connect-as-a-dns-provider)

A read-only DNS check on2026-10-16 found no TXT answer at the proposed
`_dcpubkeyv1.domainconnect.queer.guide` label (NOERROR/empty answer). This is not a
published-key proof. An empty CNAME answer at the target also is not a routing
readiness test: flattened/A records can exist. Controlled live target, key and
provider checks are still necessary.
