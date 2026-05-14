# Privacy Risk Register

**Audit date:** 2026-03-04

Scoring: 5 dimensions (Sensitivity, Identifiability, Vendor Control, Jurisdiction, Blast Radius), 0-5 each, max 25.

**PLATFORM CONTEXT:** Queer Guide reveals sexual orientation/gender identity by its nature. Every external data flow carries elevated GDPR Art. 9 risk because the referrer `queer.guide` alone signals special category data membership.

---

## Risk #1: ipapi.co — Direct IP Geolocation from Browser

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Sensitivity | 4 | Full IP address + queer.guide referrer = links identity to LGBTQ+ platform |
| Identifiability | 4 | Raw IP directly identifies household/individual |
| Vendor Control | 5 | No DPA, no deletion API, unknown data practices |
| Jurisdiction | 5 | Unknown hosting, no EU data residency |
| Blast Radius | 1 | Feature degradation only (local events display) |
| **Total** | **19** | **CRITICAL** |

**Risk statement:** Visitor IP addresses are sent directly from the browser to ipapi.co, a third party with no DPA. The HTTP referrer `queer.guide` links each IP to an LGBTQ+ platform, creating a list of LGBTQ+ visitors' IP addresses on a vendor with opaque data practices.

**Affected data:** IP addresses, browser UA, HTTP referrer

**Attack/abuse scenario:** ipapi.co data breach exposes a log of IP addresses associated with queer.guide visits. In jurisdictions hostile to LGBTQ+ people, this could identify and endanger users.

**Mitigations:**
- *Immediate:* Replace with Cloudflare geo headers (`CF-IPCountry`, `CF-IPCity`, `cf-ipcity`) — zero-cost, zero external calls, data stays in trust boundary
- *Long-term:* Already solved by the immediate fix

**Decision:** **REPLACE IMMEDIATELY** — Cloudflare already provides this data for free on every request. No reason for this external call to exist.

---

## Risk #2: Gravatar — Email Hash Leakage from Browser

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Sensitivity | 4 | MD5 email hash + queer.guide referrer |
| Identifiability | 4 | MD5 hashes of common emails are trivially reversible |
| Vendor Control | 3 | Automattic (WordPress) — broad privacy policy, US company |
| Jurisdiction | 3 | US-based, DPF certified |
| Blast Radius | 2 | Avatar display breaks, no data loss |
| **Total** | **16** | **CRITICAL** |

**Risk statement:** MD5 hashes of user email addresses are sent directly from the browser to Gravatar (Automattic). Combined with the queer.guide referrer, this allows Automattic and any network observer to link email identities to LGBTQ+ platform usage.

**Affected data:** MD5(user_email), visitor IP, referrer

**Attack/abuse scenario:** An adversary with access to Gravatar logs (or MITM) can reverse MD5 hashes of common emails and build a list of queer.guide users by email address. MD5 rainbow tables are widely available.

**Mitigations:**
- *Immediate:* Generate initials-based SVG avatars locally (DiceBear is already used for groups — extend to users)
- *Alternative:* Let users upload avatars to Supabase Storage, display from own domain
- *Long-term:* Remove all Gravatar code

**Decision:** **REPLACE** — Generate avatars locally. No external call needed for this functionality.

---

## Risk #3: GetYourGuide Widget — Third-Party JS

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Sensitivity | 3 | IP, UA, cookies, browsing behavior on queer.guide pages |
| Identifiability | 3 | Stable device fingerprint via widget JS |
| Vendor Control | 3 | EU company but widget tracks broadly for ad targeting |
| Jurisdiction | 2 | EU-based (Germany) |
| Blast Radius | 1 | Affiliate feature only |
| **Total** | **12** | **HIGH** |

**Risk statement:** Loading GetYourGuide's JS widget on queer.guide pages gives GYG visibility into which users browse LGBTQ+ activity pages, enabling cross-site tracking profiles.

**Affected data:** IP, UA, cookies, page URLs, interaction events

**Attack/abuse scenario:** GYG uses widget data for ad retargeting. Users browsing LGBTQ+ activities on queer.guide could be retargeted with LGBTQ+-related ads on other sites, potentially outing them.

**Mitigations:**
- *Immediate:* Replace widget with static affiliate links (no JS loaded). Server-side API if activity data needed.
- *Alternative:* Consent-gate the widget (only load after explicit opt-in)

**Decision:** **REPLACE** widget with static links. Affiliate revenue is preserved without loading third-party JS.

---

## Risk #4: Google Maps JavaScript SDK

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Sensitivity | 3 | User search queries, coordinates, browsing behavior |
| Identifiability | 3 | Google can link to Google account if user is logged in |
| Vendor Control | 3 | Google's broad data usage, many sub-processors |
| Jurisdiction | 3 | US, DPF certified |
| Blast Radius | 2 | Place autocomplete feature breaks |
| **Total** | **14** | **HIGH** |

**Risk statement:** Google Maps JS SDK loaded client-side sends user location searches and browsing signals to Google. Users searching for LGBTQ+ venues have their searches linked to their Google profile.

**Affected data:** Search queries, coordinates, Google account ID (if logged in), IP, UA

**Attack/abuse scenario:** Google could profile users as LGBTQ+ based on their queer.guide search patterns. This data is accessible to law enforcement via legal process.

**Mitigations:**
- *Immediate:* The API key is already proxied via edge function (good). But the JS SDK itself still phones home.
- *Medium-term:* Replace Google Places autocomplete with Nominatim/Photon geocoding via edge function proxy. Already have Mapbox geocoding as alternative.
- *Long-term:* Remove Google Maps dependency entirely (MapLibre + Protomaps already handle map rendering)

**Decision:** **PLAN REPLACEMENT** — Already partially proxied. Complete the migration to Nominatim/Photon for geocoding.

---

## Risk #5: OpenAI API — Content Sent to US Vendor

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Sensitivity | 3 | LGBTQ+ content (tag descriptions, personality bios) |
| Identifiability | 2 | Pseudonymized (no user IDs in prompts, but content is platform-specific) |
| Vendor Control | 2 | OpenAI has clear API data policy, 30-day retention, opt-out available |
| Jurisdiction | 3 | US-based |
| Blast Radius | 1 | Admin/import feature only |
| **Total** | **11** | **HIGH** |

**Risk statement:** LGBTQ+-specific content (tag names like kink terms, personality bios) is sent to OpenAI for classification. While no user identifiers are included, the content itself reveals the platform's sensitive focus.

**Affected data:** Tag names, venue descriptions, personality bios

**Mitigations:**
- *Immediate:* Enable OpenAI zero-data-retention (ZDR) for the API key
- *Medium-term:* Migrate simpler tasks (tag categorization) to CF Workers AI (already in use for embeddings)
- *Long-term:* Use local/EU-hosted models for all classification

**Decision:** **HARDEN** (enable ZDR) + **MIGRATE** simpler tasks to CF Workers AI.

---

## Risk #6: Anthropic Claude API — User Queries

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Sensitivity | 3 | User RAG queries about LGBTQ+ topics + DB context |
| Identifiability | 2 | No user IDs in prompts (but queries may be unique) |
| Vendor Control | 2 | Anthropic: no training on API data, clear retention |
| Jurisdiction | 3 | US-based |
| Blast Radius | 2 | RAG search feature breaks |
| **Total** | **12** | **HIGH** |

**Risk statement:** User questions to the intelligent-rag feature are sent to Anthropic along with context from the database. Queries reveal users' interests in specific LGBTQ+ topics.

**Affected data:** User queries, database context snippets

**Mitigations:**
- *Immediate:* Strip any user identifiers from prompts before sending
- *Medium-term:* Evaluate if Anthropic offers EU data residency
- *Long-term:* Consider self-hosted models or CF Workers AI for simpler RAG

**Decision:** **HARDEN** — Ensure no user IDs in prompts. Evaluate EU endpoint availability.

---

## Risk #7: Resend — Email Delivery (US-based)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Sensitivity | 4 | User email addresses, notification content (group names, event details) |
| Identifiability | 4 | Direct email = directly identifying |
| Vendor Control | 2 | Resend has reasonable terms, 30-day logs |
| Jurisdiction | 3 | US-based |
| Blast Radius | 3 | Email delivery critical for auth, notifications |
| **Total** | **16** | **CRITICAL** |

**Risk statement:** User email addresses and notification content (which reveals LGBTQ+ group memberships, event RSVPs) are sent to Resend, a US-based email service. A breach would link email addresses to LGBTQ+ platform activity.

**Affected data:** Email addresses, notification bodies, group names, event names

**Attack/abuse scenario:** Resend data breach exposes email addresses of queer.guide users along with their group memberships and event participation. In hostile jurisdictions, this endangers users.

**Mitigations:**
- *Immediate:* Minimize email content — use links back to platform rather than inline details
- *Medium-term:* Evaluate EU-based alternatives (Postmark EU, Mailgun EU, Brevo EU)
- *Long-term:* Consider self-hosted email relay (Postal) if volume justifies ops burden

**Decision:** **EVALUATE EU ALTERNATIVE** — Email is critical. Migration should be carefully tested.

---

## Risk #8: URLScan.io — Public Scan Results

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Sensitivity | 2 | URLs from user-submitted content |
| Identifiability | 2 | URLs may contain identifying slugs or user-generated content |
| Vendor Control | 4 | Scan results are PUBLIC by default |
| Jurisdiction | 3 | US/EU mixed |
| Blast Radius | 1 | Link validation feature only |
| **Total** | **12** | **HIGH** |

**Risk statement:** URLs submitted by users for link validation are sent to URLScan.io where scan results become publicly visible. If users share personal URLs (e.g., social profiles), these become publicly linked to queer.guide.

**Affected data:** URLs from user-submitted content

**Mitigations:**
- *Immediate:* Use URLScan.io's private/unlisted scan mode (API parameter: `visibility: "unlisted"`)
- *Alternative:* Replace with built-in HTTP HEAD checks for link validation (simpler, no external dependency)

**Decision:** **HARDEN** — Switch to private scans or replace with HEAD-request-based validation.

---

## Risk Summary (Ranked by Score)

| Rank | Vendor | Score | Risk Level | Decision |
|------|--------|-------|------------|----------|
| 1 | ipapi.co | 19 | CRITICAL | Replace immediately (CF headers) |
| 2 | Gravatar | 16 | CRITICAL | Replace (local avatars) |
| 3 | Resend | 16 | CRITICAL | Evaluate EU alternative |
| 4 | Google Maps JS SDK | 14 | HIGH | Plan replacement (Nominatim) |
| 5 | GetYourGuide widget | 12 | HIGH | Replace widget with static links |
| 6 | URLScan.io | 12 | HIGH | Harden (private scans) |
| 7 | Anthropic Claude | 12 | HIGH | Harden (strip PII) |
| 8 | OpenAI | 11 | HIGH | Harden (ZDR) + migrate to CF AI |

### Dependencies Not Scored (Low Risk)

These dependencies are either fully server-side proxied, read-only data imports, or already within the trust boundary:

- **Supabase** (risk: 0 — this IS the trust boundary, EU-hosted)
- **Cloudflare** (risk: 0 — infrastructure provider, already sees all traffic)
- **Protomaps** (risk: ~3 — self-hosted tiles via own CF Worker)
- **Mapbox geocoding** (risk: ~6 — already proxied via edge function)
- **Pexels/Unsplash** (risk: ~4 — server-side, public content queries)
- **Travelpayouts** (risk: ~5 — server-side, no user data)
- **News APIs** (risk: ~4 — server-side, automated queries)
- **Turnstile** (risk: ~3 — essential security, same provider as CDN)
- **DiceBear** (risk: ~4 — group names only, low sensitivity)
- **Data import sources** (Foursquare, TripAdvisor, ILGA, etc.) — server-side only, inbound data
