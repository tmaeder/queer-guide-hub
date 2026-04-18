# Dependency Audit — Backlog

**Audit date:** 2026-03-04
**Priority:** P0 = do this week, P1 = do within 1 month, P2 = do within 3 months, P3 = do within 6 months

---

## P0 — Critical (This Week)

- [ ] **Replace ipapi.co with CF geo headers** — Create `useVisitorLocation` hook using CF headers (`CF-IPCountry`, `cf-ipcity`). Update `RegionalEventsCalendar.tsx`, `WeeklyEventsSlider.tsx`, `FrontPageVenueMap.tsx`. Delete ipapi.co fetch calls. *Privacy risk: 19/25 → 0*

- [ ] **Replace Gravatar with local avatars** — Create `generateAvatarSVG(name)` utility returning data URI. Replace all `getGravatarUrl`/`hasGravatar` calls. Prioritize Supabase Storage uploads. Delete `web/src/lib/gravatar.ts`. *Privacy risk: 16/25 → 0*

- [ ] **Remove GetYourGuide widget JS** — Replace `ActivitiesWidget.tsx` widget embed with static affiliate link (`partner_id=2PBDXWH`). Remove `widget.getyourguide.com` script loading. *Privacy risk: 12/25 → 0*

- [ ] **Harden URLScan.io** — Add `visibility: "unlisted"` to API calls in `scan-links` and `validate-links` edge functions. *Privacy risk: 12/25 → ~6*

- [ ] **Enable OpenAI zero-data-retention** — Set ZDR in OpenAI dashboard or add `"store": false` to API requests. *Privacy risk: 11/25 → ~8*

---

## P1 — High (Within 1 Month)

- [ ] **Remove Google Maps JS SDK** — Create `geocoding` edge function wrapping Nominatim/Photon. Update `location-autocomplete.tsx`. Remove Google Maps script loading. Delete `GOOGLE_MAPS_API_KEY` from Supabase secrets. *Privacy risk: 14/25 → ~3*

- [ ] **Evaluate EU email provider** — Compare Postmark EU, Mailgun EU, Brevo on deliverability, pricing, data residency, DPA. Set up test account. *Prerequisite for Resend migration*

- [ ] **Migrate Resend to EU provider** — Update `send-templated-email`, `send-bulk-email`, `send-mailbox-email`, `send-group-notifications` edge functions. Dual-send for 1 week. *Privacy risk: 16/25 → ~8*

- [ ] **Strip PII from AI prompts** — Create `_shared/redactPII.ts` utility. Apply to all OpenAI/Anthropic API calls in edge functions. *Reduces risk across 6+ functions*

- [ ] **Migrate tag categorization to CF Workers AI** — Benchmark CF Workers AI text classification against OpenAI for tag categorization accuracy. Migrate `categorize-tags` and `auto-tag-content` if quality acceptable. *Reduces OpenAI data exposure*

---

## P2 — Medium (Within 3 Months)

- [ ] **Replace Mapbox geocoding with Nominatim** — After Google Maps removal, repoint remaining Mapbox geocoding calls to the Nominatim edge function. Decommission `MAPBOX_TOKEN`. *Eliminates last major geo vendor*

- [ ] **Audit Upstash Redis cache contents** — Review all cache keys for PII. Document what's cached and TTLs. Evaluate if Supabase-native caching (unlogged tables, materialized views) is sufficient.

- [ ] **Delete deprecated Algolia secrets** — Remove `ALGOLIA_APP_ID` and `ALGOLIA_API_KEY` from Supabase dashboard. Already returning 410 Gone.

- [ ] **Delete broken API keys** — Remove or refresh: `FOURSQUARE_API_KEY` (401), `TRIPADVISOR_API_KEY` (403). Either fix or remove the cron jobs.

- [ ] **Delete test-tripadvisor-api edge function** — Debug function that logs API key prefixes. Should not be in production.

---

## P3 — Low (Within 6 Months)

- [ ] **Replace DiceBear with local SVG generation** — Extend the local avatar utility from P0 Gravatar fix to groups. Remove external call to `api.dicebear.com`.

- [ ] **Stripe EU entity setup** — When expanding payment features, configure Stripe EU entity for data processing. Minimize stored payment metadata.

- [ ] **Consider self-hosting Umami** — Already proxied via edge functions (low risk). Self-hosting eliminates the last analytics dependency. Evaluate ops burden.

- [ ] **Review Unsplash fallback images** — `DirectoryCard.tsx` loads a fallback from `images.unsplash.com` client-side. Consider hosting the fallback image locally.

- [ ] **Consent management for remaining client-side calls** — After P0/P1, review remaining client-side external calls. Implement consent gating for any non-essential ones per GDPR.

- [ ] **Review scraper data sources compliance** — Ensure TravelGay (403), MisterBnB, Patroc scraping is legally and ethically compliant. Consider partnership agreements.

---

## Ongoing / Process

- [ ] **Add outbound HTTP allowlist** — Create a shared utility or edge function middleware that logs/restricts external domains called from edge functions. Catches unintended data egress.

- [ ] **Centralize vendor client configuration** — Create a `_shared/vendors/` module in edge functions with a single config point per vendor. Makes future swaps easier.

- [ ] **Add PII redaction to error logging** — If any error reporting is added in the future, ensure PII scrubbing is applied by default.

- [ ] **Quarterly dependency review** — Re-run this audit quarterly to catch new dependencies and re-evaluate risk scores.
