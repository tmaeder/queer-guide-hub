# Data Flow Map

**Audit date:** 2026-03-04

**CRITICAL CONTEXT:** Queer Guide is an LGBTQ+ platform. ANY data sent to third parties inherently reveals information about sexual orientation/gender identity — a "special category" under GDPR Art. 9. This elevates the risk of every external data flow.

---

## 1. ipapi.co — IP Geolocation

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Visitor IP address (full), browser UA, HTTP referrer (queer.guide) |
| **Direction** | Outbound (browser → ipapi.co) |
| **Frequency** | Per page load on 3 homepage components |
| **Retention** | Unknown — no DPA found |
| **Purpose** | Detect visitor city/country for localized event display |
| **Minimization** | Replace with CF geo headers (`CF-IPCountry`, `CF-IPCity`) already available. **Zero external call needed.** |

## 2. Gravatar — Avatar Service

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | MD5 hash of user email, visitor IP, UA, referrer (queer.guide) |
| **Direction** | Outbound (browser → gravatar.com) |
| **Frequency** | Per page load wherever user avatars display |
| **Retention** | Automattic privacy policy (US, broad data use) |
| **Purpose** | Display user avatars |
| **Minimization** | Generate initials SVG locally or use Supabase storage avatars. MD5 hashes are reversible via rainbow tables. |

## 3. GetYourGuide — Activity Widget

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Visitor IP, UA, referrer (queer.guide), cookies, browsing behavior |
| **Direction** | Bidirectional (script loaded → tracking data sent) |
| **Frequency** | Per page load on activity pages |
| **Retention** | GYG privacy policy (EU company, but broad marketing use) |
| **Purpose** | Activity booking affiliate revenue |
| **Minimization** | Replace widget with server-side API call + static affiliate links. No need to load third-party JS. |

## 4. Google Maps / Places

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Search queries (location names), coordinates, visitor IP (via JS SDK) |
| **Direction** | Bidirectional |
| **Frequency** | Per user search interaction |
| **Retention** | Google privacy policy (US, broad data use, profiling) |
| **Purpose** | Location autocomplete, place details |
| **Minimization** | Already partially proxied via edge function. The JS SDK still loads client-side and phones home. Consider Nominatim/Photon for geocoding. |

## 5. Mapbox — Geocoding

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Search queries, visitor IP (via client-side calls to edge function proxy) |
| **Direction** | Outbound via edge function (server-side — good) |
| **Frequency** | Per user geocoding request |
| **Retention** | Mapbox privacy policy (US) |
| **Purpose** | Location autocomplete in forms |
| **Minimization** | Already proxied through edge function. Consider caching frequent geocoding results. Could replace with Nominatim. |

## 6. OpenAI

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Content text (tag names, venue descriptions, personality bios), prompt context |
| **Direction** | Outbound (content → OpenAI) → Inbound (completions) |
| **Frequency** | On-demand (admin operations: tagging, categorization) |
| **Retention** | OpenAI API data policy: 30 days for abuse monitoring (opt-out available) |
| **Purpose** | Auto-tagging, categorization, content enhancement |
| **Minimization** | Content is LGBTQ+-specific — sending it to OpenAI reveals platform context. Consider CF Workers AI or local models for simpler classification tasks. |

## 7. Anthropic (Claude)

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | RAG queries (user questions + DB context), content for ingestion validation |
| **Direction** | Outbound (queries + context) → Inbound (responses) |
| **Frequency** | Per RAG query (user-facing), per ingestion batch |
| **Retention** | Anthropic: no training on API data, 30-day logs |
| **Purpose** | Intelligent search (RAG), content quality validation |
| **Minimization** | RAG queries may contain user questions about LGBTQ+ topics — sensitive by nature. Strip user identifiers from prompts. Consider EU endpoint if available. |

## 8. Resend — Email Service

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Recipient email addresses, email bodies (notifications, group messages) |
| **Direction** | Outbound (user data → Resend) |
| **Frequency** | Per email sent (notifications, group activity) |
| **Retention** | Resend: 30 days email logs |
| **Purpose** | Transactional email delivery |
| **Minimization** | Email content may reveal LGBTQ+ group memberships, event RSVPs, etc. Use minimal templates. Resend is US-based. Consider EU alternative (Postmark EU, Mailgun EU). |

## 9. Upstash Redis

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Cached API responses (contents vary by key) |
| **Direction** | Bidirectional |
| **Frequency** | Per cache read/write |
| **Retention** | Configurable TTLs, but Upstash retains metadata |
| **Purpose** | API response caching |
| **Minimization** | Audit cache keys to ensure no PII is cached. Consider if Supabase pg-based caching is sufficient. |

## 10. Travelpayouts

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Airport codes, dates, currency preference |
| **Direction** | Outbound via edge function (server-side) |
| **Frequency** | Per travel search (cached 30 min) |
| **Retention** | Travelpayouts privacy policy (Russia-origin, now operating as Aviasales) |
| **Purpose** | Flight deal data for affiliate revenue |
| **Minimization** | Already server-side proxied (good). No user identity sent. Airport pairs could theoretically link to user location but risk is low. |

## 11. Pexels / Unsplash

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Search terms (city names, tag names) |
| **Direction** | Outbound via edge function |
| **Frequency** | On-demand (image search) |
| **Retention** | Standard API terms |
| **Purpose** | Stock imagery for content |
| **Minimization** | Already server-side (good). Low risk — search terms are public location/tag names. |

## 12. News APIs (4 providers)

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Search queries (LGBTQ+ related terms) |
| **Direction** | Outbound via edge function |
| **Frequency** | Hourly cron |
| **Retention** | Per vendor |
| **Purpose** | LGBTQ+ news aggregation |
| **Minimization** | Server-side, automated queries. Search terms reveal platform's LGBTQ+ focus but no user data. Low risk. |

## 13. Stripe (partial)

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Payment session IDs; if fully implemented: financial data |
| **Direction** | Bidirectional |
| **Frequency** | Per donation |
| **Retention** | Stripe: compliant (PCI DSS, EU entity) |
| **Purpose** | Donations |
| **Minimization** | Currently minimal integration. If expanded, use Stripe's EU entity and minimal data sharing. |

## 14. Cloudflare Turnstile

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | Challenge tokens, visitor interaction signals |
| **Direction** | Bidirectional |
| **Frequency** | Per protected action |
| **Retention** | CF privacy policy |
| **Purpose** | Bot protection |
| **Minimization** | Essential security service. CF already processes all traffic. Negligible incremental privacy cost. |

## 15. URLScan.io

| Dimension | Assessment |
|-----------|-----------|
| **Data categories** | URLs from user-submitted content |
| **Direction** | Outbound (URLs → URLScan) |
| **Frequency** | Weekly cron + on-demand |
| **Retention** | URLScan: public scan results (!) |
| **Purpose** | Link safety validation |
| **Minimization** | Scanned URLs become PUBLIC on URLScan.io. If user-submitted links contain identifying info, this is a data leak. Consider private scan mode or alternative. |

---

## Data Flow Priority Matrix

| Vendor | Sensitivity | Direction | User-facing | Proxy? | Action Priority |
|--------|-------------|-----------|-------------|--------|----------------|
| ipapi.co | HIGH | Client→Vendor | Yes | No | **REPLACE NOW** (use CF headers) |
| Gravatar | HIGH | Client→Vendor | Yes | No | **REPLACE** (local avatars) |
| GetYourGuide widget | MEDIUM | Client↔Vendor | Yes | No | **HARDEN** (remove widget JS) |
| Google Maps JS SDK | MEDIUM | Client↔Vendor | Yes | Partial | **HARDEN** (full proxy or replace) |
| OpenAI | MEDIUM | Server→Vendor | No | N/A | **HARDEN** (audit prompts, opt out of logging) |
| Anthropic | MEDIUM | Server→Vendor | No | N/A | **HARDEN** (strip PII from prompts) |
| Resend | HIGH | Server→Vendor | No | N/A | **EVALUATE** (EU alternative) |
| URLScan.io | MEDIUM | Server→Vendor | No | N/A | **HARDEN** (use private scans) |
| Mapbox | LOW | Server→Vendor | No | Yes | Monitor |
| Travelpayouts | LOW | Server→Vendor | No | Yes | Monitor |
| Pexels/Unsplash | LOW | Server→Vendor | No | Yes | Accept |
| News APIs | LOW | Server→Vendor | No | N/A | Accept |
| CF Turnstile | LOW | Both | Yes | N/A | Accept |
