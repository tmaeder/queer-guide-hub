# Security scan remediation — 27 October 2026

## Verified findings

| Source | Observation | Resolution / remaining work |
| --- | --- | --- |
| [MDN Observatory](https://developer.mozilla.org/en-US/observatory/analyze?host=queer.guide) | A+, 125/100, 12/12 scored tests pass. Detailed CSP analysis flags inline styles and `default-src 'self'`. | This branch changes the default to `none`, explicitly allows the PWA manifest, and requires nonces for inline stylesheet blocks, with one exact hash for Sonner’s fixed stylesheet. Inline **attributes** remain an explicit compatibility exception; this is partial style hardening, not elimination of all inline CSS. |
| [UpGuard](https://www.upguard.com/instant-security-score/report?c=queer.guide) | DMARC `p=none`; SPF `~all`; HTTP port open; missing preload registration; weak TLS 1.2 ciphers. | Zone/DNS changes below. Keep HTTP available for its verified HTTPS redirect. |
| [SSLTrust](https://www.ssltrust.com.au/ssl-tools/website-security-check?domain=queer.guide&ssl=true) | 1 positive match out of 90 checks: **Bfore.Ai PreCrime**, shown in the report modal. Other results include clean and unrated verdicts. | Requires vendor investigation/reclassification. One classification does not prove compromise, and this review does not prove the absence of compromise. No vendor message has been sent. |
| Direct HTTPS requests | Homepage, `/docs`, a real 404, and `/build-id.txt` all serve `max-age=15552000; includeSubDomains; preload`. | Cloudflare overrides the two-year policy already specified in both application headers and `public/_headers`. Redeploying that existing HSTS value alone does not fix the live override. |
| [Preload eligibility API](https://hstspreload.org/api/v2/preloadable?domain=queer.guide) | `header.preloadable.max_age.below_1_year`. | Raise the zone policy to 63072000 seconds and recheck eligibility. |
| [Preload status API](https://hstspreload.org/api/v2/status?domain=queer.guide) | `rejected`: domain added and removed without being preloaded. | A `preload` header token is not registration. Validate subdomain HTTPS readiness before submitting again. |
| TLS handshakes | TLS 1.2 accepts `AES128-SHA` (CBC/static RSA) and `AES128-GCM-SHA256` (static RSA), as well as `ECDHE-RSA-AES128-GCM-SHA256`. | Weak-cipher finding is independently reproduced. The `SSLv3` text in OpenSSL's cipher description is not the negotiated protocol; the session explicitly reports TLS 1.2. |

UpGuard's extracted rating displays F/0 while most categories pass, and some explanatory strings contradict their titles. Treat the individual verified findings as evidence; do not infer compromise from the aggregate display or contradictory descriptions.

## Implemented in this branch

- `default-src 'none'` and `manifest-src 'self'` in dynamic and static CSP.
- `style-src 'self' 'nonce-…'` plus an exact Sonner stylesheet hash for HTML, with an explicit `style-src-attr 'unsafe-inline'` exception. The static fallback allows external stylesheets and the same fixed stylesheet hash, plus that attribute exception.
- Nonces on server-rendered branding, documentation and 404 styles, standalone landing documents, and all four React stylesheet-block components. Radix's runtime stylesheet injector receives the same nonce via `get-nonce` before React renders.
- Existing script restrictions, podcast/image HTTPS sources, CMS framing, and CSP reporting remain intact.
- `npm run check:security-headers` checks actual edge responses, not just source constants. It fails on the measured six-month HSTS override and broad stylesheet blocks. It explicitly reports that style attributes remain allowed.

Removing the attribute exception requires a separate migration and browser checks for stored rich-text styles, rendered email bodies, maps, and third-party widgets. Modern CSP implementations can distinguish stylesheet blocks from attributes; older browsers without `style-src-attr` support may block legacy inline attributes with the stricter fallback.

## Cloudflare changes requiring zone access

The available local Wrangler OAuth credential can list the zone but received HTTP 403 for `settings/security_header`, `settings/ciphers`, TLS settings, and `dns_records`. The in-app dashboard initially required sign-in. No DNS or zone settings were changed during these failed read attempts.

### HSTS and preload

In **SSL/TLS → Edge Certificates → HTTP Strict Transport Security**, retain HSTS and `includeSubDomains`/`preload`, and set maximum age to **24 months / 63072000 seconds**. Keep `nosniff` enabled. If another response-header rule replaces HSTS, correct it there too. Verify public responses using:

```sh
npm run check:security-headers
curl -sS 'https://hstspreload.org/api/v2/preloadable?domain=queer.guide'
curl -sS 'https://hstspreload.org/api/v2/status?domain=queer.guide'
```

Check every public and internal subdomain's HTTPS readiness before submission to [hstspreload.org](https://hstspreload.org/). Submission and browser-list propagation are distinct steps and take time. Do not report “preloaded” until the status confirms it. [Official requirements](https://hstspreload.org/).

### Email authentication

Observed public records:

```text
@ TXT v=spf1 include:_spf.mx.cloudflare.net ~all
_dmarc TXT v=DMARC1;p=none;rua=mailto:4945c4b53fa44fd580dd9858fb58e5b5@dmarc-reports.cloudflare.net
```

The project's current mail architecture uses Cloudflare Sending, with Stalwart relaying through `smtp-relay`; inbound mail uses Cloudflare Routing. Preserve the existing Cloudflare MX/SPF includes and reporting address. Review aggregate reports and existing authentication receipts for all legitimate senders before enforcing DMARC. Move to quarantine and then reject after confirming alignment; the final target, preserving reporting, is:

```text
v=DMARC1;p=reject;rua=mailto:4945c4b53fa44fd580dd9858fb58e5b5@dmarc-reports.cloudflare.net
```

Cloudflare's [domain configuration documentation](https://developers.cloudflare.com/email-service/configuration/domains/) explicitly publishes the Routing SPF record with `~all`. Do not replace a managed Routing SPF record just to clear a scanner warning: first confirm whether Cloudflare permits `-all` without disrupting routing/forwarding. Enforced DMARC is the primary fix for aligned-domain spoofing; SPF and DKIM alignment, not a headline score, determine legitimate delivery. Do not send test messages without authorization.

### TLS cipher suites

Cloudflare's [custom cipher documentation](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/cipher-suites/customize-cipher-suites/) requires Advanced Certificate Manager to customize suites while retaining TLS 1.2. With that entitlement, retain only ECDHE + AEAD TLS 1.2 suites, covering RSA and ECDSA certificates, and retain TLS 1.3. Suggested TLS 1.2 set:

```text
ECDHE-ECDSA-AES128-GCM-SHA256
ECDHE-RSA-AES128-GCM-SHA256
ECDHE-ECDSA-AES256-GCM-SHA384
ECDHE-RSA-AES256-GCM-SHA384
ECDHE-ECDSA-CHACHA20-POLY1305
ECDHE-RSA-CHACHA20-POLY1305
```

An alternative is minimum TLS 1.3, which removes TLS 1.2 compatibility. Choose that explicitly based on visitor/client requirements; do not silently drop clients or purchase a subscription to clear a warning. Re-run forced weak and strong TLS handshakes afterward.

### Open port 80

Direct measurement: `http://queer.guide/` returns **301 → https://queer.guide/**. This is the normal secure upgrade path and a preload requirement when serving HTTP. The exposed listener belongs to Cloudflare's shared edge. Do not remove DNS proxying or break HTTP-to-HTTPS redirection to eliminate the generic “HTTP port open” finding.

### Bfore.Ai classification

Request an investigation from BforeAI through its [official help center](https://portal.bfore.ai/knowledge-base/precrime-platform). Provide the domain, timestamp and SSLTrust vendor verdict, and ask for the specific URL/indicator and evidence underlying the classification. Do not assert a false positive without investigation. A vendor review is external work and cannot be accomplished by changing CSP or TLS headers. [VirusTotal's explanation of vendor-owned verdicts](https://docs.virustotal.com/docs/false-positive) also describes why an aggregator cannot remove another vendor's classification.

## Validation

- Fresh `npm ci --ignore-scripts` using the committed lockfile, then production `npm run build`: passed.
- 90 targeted Vitest tests: passed (security headers, branding nonce escaping, CSP nonce lookup, documentation routes, native routes, calendar and command components).
- Four Node tests for the live header checker: passed.
- Pages Functions and Functions test TypeScript checks: passed.
- Local Wrangler Pages responses for `/`, `/docs`, a real 404 and `/build-id.txt`: all pass `check:security-headers`.
- Real workerd middleware execution: stylesheet nonces match the CSP on SPA, docs, standalone landing and synthetic error responses.
- In-app browser: production homepage renders its sections and data; Cookie Preferences opens with a runtime stylesheet carrying a nonce. Sonner’s fixed stylesheet hash is independently recomputed from the installed dependency. These checks do not establish that every third-party widget has been exercised.
- Production remains on the old CSP and the zone's six-month HSTS policy until code deployment and zone remediation.
