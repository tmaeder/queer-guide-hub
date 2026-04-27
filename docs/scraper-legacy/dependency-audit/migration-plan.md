# Migration Plan

**Audit date:** 2026-03-04

---

## Phase 1 — Quick Wins (1-2 weeks)

These changes are low-effort, high-impact, and immediately reduce the most critical privacy exposures. No vendor migrations required — just removing unnecessary external calls and hardening existing ones.

### 1.1 Replace ipapi.co with Cloudflare Geo Headers

**Privacy risk eliminated:** 19/25 (CRITICAL)
**Effort:** ~2 hours

**Current state:** Three homepage components (`RegionalEventsCalendar`, `WeeklyEventsSlider`, `FrontPageVenueMap`) call `https://ipapi.co/json/` directly from the browser, exposing visitor IPs to a third party.

**Target state:** Use Cloudflare geo headers already available on every request. CF Pages sets `cf-ipcountry` and `cf-ipcity` headers. The `useVisitorOrigin` hook already uses `window.CF` for travel features — extend this pattern.

**Implementation:**
1. Create a shared `useVisitorLocation` hook that reads CF geo data from request headers or `window.CF`
2. Replace all `ipapi.co` fetch calls in the three components with the new hook
3. Remove any ipapi.co references from the codebase

**Test plan:**
- Verify geo detection works on CF Pages (production)
- Verify fallback behavior when headers are absent (local dev)
- Check that RegionalEventsCalendar, WeeklyEventsSlider, FrontPageVenueMap still show location-appropriate content

**Rollback:** Revert to ipapi.co calls (but there's no reason to — CF headers are strictly better)

### 1.2 Replace Gravatar with Local Avatars

**Privacy risk eliminated:** 16/25 (CRITICAL)
**Effort:** ~3 hours

**Current state:** `web/src/lib/gravatar.ts` sends MD5(user_email) to `gravatar.com` from the browser. The referrer `queer.guide` links email hashes to LGBTQ+ platform usage.

**Target state:** Generate avatar images locally. Two options:
- **Option A:** Initials-based SVG (already done for groups via DiceBear — but DiceBear is also external)
- **Option B (recommended):** Generate initials SVG inline (no external call). Use Supabase Storage for uploaded avatars.

**Implementation:**
1. Create a `generateAvatarSVG(name: string)` utility that returns a data URI SVG with initials and a deterministic background color
2. Replace all `getGravatarUrl` / `hasGravatar` calls with local avatar generation
3. Prioritize Supabase Storage avatar if user has uploaded one, fall back to generated SVG
4. Delete `web/src/lib/gravatar.ts`

**Test plan:**
- Verify avatars display correctly across all components using them
- Verify uploaded avatars in Supabase Storage still take priority
- Check performance (inline SVG data URIs are fast)

**Rollback:** Re-add gravatar.ts if needed, but local generation has zero dependencies.

### 1.3 Replace GetYourGuide Widget with Static Links

**Privacy risk eliminated:** 12/25 (HIGH)
**Effort:** ~1 hour

**Current state:** `ActivitiesWidget.tsx` loads `widget.getyourguide.com/dist/pa.umd.production.min.js`, a third-party script that tracks user behavior.

**Target state:** Replace with static affiliate links. The affiliate URL pattern is already known: `https://www.getyourguide.com/s/?q={DESTINATION}+LGBTQ&partner_id=2PBDXWH`

**Implementation:**
1. Replace the widget embed with a simple link/card component pointing to GYG with the affiliate partner_id
2. Remove the script tag loading
3. Style the link to match the current widget appearance

**Test plan:**
- Verify affiliate links include correct partner_id
- Verify no third-party JS is loaded from getyourguide.com
- Confirm affiliate tracking still works by clicking through

**Rollback:** Re-add widget script tag.

### 1.4 Harden URLScan.io — Private Scans

**Privacy risk reduced:** 12/25 → ~6/25
**Effort:** ~30 minutes

**Current state:** URLs are submitted to URLScan.io with default (public) visibility. Scan results are publicly browsable.

**Target state:** Use `visibility: "unlisted"` or `"private"` parameter in API calls.

**Implementation:**
1. In the `scan-links` and `validate-links` edge functions, add `visibility: "unlisted"` to the URLScan API request body
2. For simple link validation (HTTP status checks), consider replacing with built-in `fetch(url, {method: 'HEAD'})` — no vendor needed

**Test plan:**
- Verify scans still complete successfully
- Verify scan results are NOT publicly listed on urlscan.io

**Rollback:** Remove the visibility parameter.

### 1.5 Harden OpenAI — Enable Zero Data Retention

**Privacy risk reduced:** 11/25 → ~8/25
**Effort:** ~15 minutes

**Current state:** OpenAI retains API data for 30 days by default.

**Target state:** Enable zero-data-retention for the API organization.

**Implementation:**
1. In the OpenAI dashboard, enable zero-data-retention for the API key/organization
2. Alternatively, add `"store": false` to all API requests (supported since 2024)

**Test plan:**
- Verify API calls still succeed
- Verify OpenAI dashboard shows ZDR enabled

**Rollback:** Disable ZDR in dashboard.

---

## Phase 2 — Service Hardening & Easy Swaps (2-6 weeks)

### 2.1 Remove Google Maps JS SDK — Replace with Nominatim Geocoding

**Privacy risk eliminated:** 14/25 (HIGH)
**Effort:** ~1-2 weeks

**Current state:** Google Maps JS SDK loaded client-side for Places autocomplete. API key proxied via edge function (partially hardened).

**Target state:** Use Nominatim (OSM) or Photon for geocoding, served through an edge function proxy. MapLibre + Protomaps already handle map rendering.

**Implementation:**
1. Create a `geocoding` edge function that wraps Nominatim or Photon API calls
2. Update `location-autocomplete.tsx` to call the new edge function instead of Google Places
3. Update `useSecureGoogleMaps.tsx` consumers to use the new geocoding service
4. Remove Google Maps JS SDK loading
5. Remove `secure-google-maps-key` edge function (or repurpose)
6. Delete `GOOGLE_MAPS_API_KEY` from Supabase secrets

**Test plan:**
- Verify location autocomplete returns accurate results for major cities
- Verify geocoding works for venue addresses
- Test with international place names (accented characters)
- Confirm no Google Maps JS is loaded in browser network tab

**Rollback:** Re-enable Google Maps JS SDK via feature flag.

**Cutover strategy:** Run both geocoding providers in parallel for 1 week. Compare result quality. Switch when satisfied.

### 2.2 Migrate Simple AI Tasks to CF Workers AI

**Privacy risk reduced:** 11/25 → ~5/25 for migrated tasks
**Effort:** ~1 week

**Current state:** OpenAI used for tag categorization, auto-tagging, and content classification. These are relatively simple classification tasks.

**Target state:** Use CF Workers AI (already in use for embeddings) for simpler classification. Keep OpenAI/Anthropic for complex tasks (RAG, personality enrichment).

**Implementation:**
1. Evaluate CF Workers AI text classification models for tag categorization accuracy
2. Migrate `categorize-tags` and `auto-tag-content` to use CF Workers AI
3. Keep `intelligent-rag` and `fetch-personality-data` on OpenAI/Anthropic (quality requirements higher)

**Test plan:**
- Compare classification accuracy: CF Workers AI vs OpenAI on a test set of 100 tags
- Verify auto-tagging quality doesn't regress significantly
- Measure latency difference

**Rollback:** Switch back to OpenAI API calls.

### 2.3 Evaluate EU Email Provider (Resend → EU Alternative)

**Privacy risk reduced:** 16/25 → ~8/25
**Effort:** ~1-2 weeks (evaluation + migration)

**Current state:** Resend (US-based) handles all transactional email with user email addresses and notification content.

**Target state:** EU-based email provider with clear data residency.

**Candidates:**
- **Postmark EU** — Excellent deliverability, EU data processing, clear DPA
- **Mailgun EU** — EU data residency option, SMTP standard
- **Brevo (formerly Sendinblue)** — EU-based (France), GDPR native

**Implementation:**
1. Evaluate each candidate on: deliverability, pricing, EU data residency confirmation, DPA terms
2. Set up test account with chosen provider
3. Update edge functions (`send-templated-email`, `send-bulk-email`, `send-mailbox-email`, `send-group-notifications`) to use new provider
4. All use standard SMTP or REST API — swap is mechanical

**Test plan:**
- Send test emails via new provider
- Verify delivery to major providers (Gmail, Outlook, ProtonMail)
- Monitor bounce rates for 1 week in parallel
- Verify email formatting is preserved

**Rollback:** Switch env var back to Resend API key.

**Cutover strategy:** Dual-send for 1 week (both providers), monitor deliverability, then cut over.

### 2.4 Strip PII from AI Prompts

**Effort:** ~3 hours

**Implementation:**
1. Audit all edge functions that call OpenAI/Anthropic for user identifiers in prompts
2. Create a shared `redactPII(text)` utility in `_shared/` that strips emails, user IDs, IP addresses
3. Apply redaction before any external AI API call

**Test plan:**
- Verify AI response quality is unaffected after redaction
- Log (locally) a sample of redacted prompts to confirm PII is stripped

---

## Phase 3 — Strategic Migrations (3-6 months)

### 3.1 Replace Mapbox Geocoding with Self-Hosted Nominatim

**Effort:** ~2-3 days
**Prerequisite:** Phase 2.1 (Nominatim edge function already built)

After Phase 2.1, Mapbox geocoding becomes the last Google/Mapbox dependency. Replace with the same Nominatim edge function, decommission `MAPBOX_TOKEN`.

### 3.2 Audit and Reduce Upstash Redis Usage

**Effort:** ~1 day

Audit what's cached in Redis. If only API response caching, consider Supabase-native alternatives (unlogged tables, pg_cron + materialized views). If Redis provides genuinely useful functionality (rate limiting, session management), keep it but ensure no PII in cache values.

### 3.3 Replace DiceBear with Local SVG Generation

**Effort:** ~1 hour

If Gravatar replacement (Phase 1.2) uses local SVG generation, extend the same approach to groups. Remove the DiceBear external call entirely.

### 3.4 Stripe EU Entity (When Expanding Payments)

**Effort:** Configuration change when payment features expand.

When implementing full donation/payment flow, ensure Stripe EU entity is selected for data processing. Minimize stored payment metadata in the database.

### 3.5 Consider Self-Hosted Umami

**Effort:** ~1-2 days

Umami is already privacy-focused and proxied through edge functions (good). If you want to eliminate even this dependency, Umami is open-source and can be self-hosted on a small VPS or CF Worker. Low priority given existing proxy setup.

---

## Summary Timeline

```
Week 1-2 (Phase 1):
  ├─ [P0] Replace ipapi.co with CF geo headers
  ├─ [P0] Replace Gravatar with local avatars
  ├─ [P0] Replace GYG widget with static links
  ├─ [P1] Harden URLScan.io (private scans)
  └─ [P1] Enable OpenAI ZDR

Week 3-8 (Phase 2):
  ├─ [P1] Remove Google Maps JS SDK → Nominatim
  ├─ [P1] Migrate simple AI to CF Workers AI
  ├─ [P1] Evaluate + migrate to EU email provider
  └─ [P2] PII redaction in AI prompts

Month 3-6 (Phase 3):
  ├─ [P2] Replace Mapbox geocoding
  ├─ [P3] Audit Upstash Redis
  ├─ [P3] Local SVG for DiceBear
  ├─ [P3] Stripe EU entity setup
  └─ [P3] Optional: self-host Umami
```

## Risk Reduction Summary

| Phase | Dependencies Fixed | Total Privacy Risk Eliminated |
|-------|-------------------|------------------------------|
| Phase 1 | ipapi.co, Gravatar, GYG widget, URLScan, OpenAI ZDR | ~70 points reduced |
| Phase 2 | Google Maps, OpenAI (partial), Resend, PII in AI | ~45 points reduced |
| Phase 3 | Mapbox, Redis, DiceBear, Stripe posture | ~20 points reduced |

After all phases, the only external data flows with PII will be:
1. **Supabase** (trust boundary — acceptable)
2. **Cloudflare** (infrastructure — acceptable)
3. **EU email provider** (necessary, EU-hosted)
4. **AI APIs** (hardened, PII-stripped, complex tasks only)
