# Privacy Risk Register

_Scored 0–5 across 5 dimensions (sensitivity · volume · egress exposure · retention/control · jurisdiction),
max 25. Baseline GDPR; FADP/nDSG applies (Swiss context: `.guide` brand, CH hosting, EU users)._

_Threat model: vendors can be breached, subpoenaed, or change terms unilaterally. Audit date 2026-06-01._

## Ranked risks

| # | Vendor / flow | Sens | Vol | Egr | Ret | Juris | **Total** | Decision |
|---|---|--:|--:|--:|--:|--:|--:|---|
| 1 | **Workers AI — user trip prompts / submissions on CF global GPUs** | 4 | 3 | 4 | 3 | 4 | **18** | **Replace path** (route sensitive flows to EU vLLM; hybrid-by-sensitivity) |
| 2 | **OpenAI gpt-4o-mini — content to US, no gateway** | 2 | 4 | 4 | 4 | 4 | **18** | **Harden** (AI Gateway, short retention) → later **Replace** for sensitive bits |
| 3 | **AI Gateway logs prompts/responses outside CH** | 3 | 4 | 3 | 4 | 4 | **18** | **Harden** (zero/short retention; PII redaction before prompts) |
| 4 | **Sentry — error context + session to US** | 3 | 3 | 4 | 4 | 4 | **18** | **Harden** (scrub PII, disable replay, sample) or EU-region |
| 5 | **Resend — user emails to US** | 4 | 3 | 4 | 3 | 4 | **18** | **Replace region** (Resend EU); inbound → CF Email Routing |
| 6 | **Stripe — payment PII to US** | 5 | 2 | 4 | 3 | 4 | **18** | **Accept** (necessary, PCI-scoped; hosted checkout; DPA) |
| 7 | **Mapbox — user location text to US** | 3 | 3 | 4 | 3 | 4 | **17** | **Replace** (self-hosted Nominatim, no egress) |
| 8 | **Infomaniak services bypass CF proxy (origin IP exposed)** | 2 | 2 | 3 | 2 | 1 | **10** | **Harden** (CF-proxy or Tunnel until decommission) |
| 9 | **GitHub — feedback content to US** | 2 | 2 | 3 | 3 | 4 | **14** | **Harden** (strip submitter identifiers) |
| 10 | Ingestion sources (read-only fetch) | 1 | 4 | 1 | 1 | 3 | **10** | **Accept** (no user PII egress) |
| 11 | Vectorize (planned) — embeddings of public content, CF global | 2 | 4 | 3 | 3 | 4 | **16** | **Accept w/ note** (public catalog content; document region) |
| 12 | **First-party behavioural analytics kept in our own DB** (`user_events`, `umami.*`) | 3 | 5 | 0 | 3 | 1 | **12** | **Harden** (consent-gate every writer, 90-day retention, erase on account deletion) |
| 13 | Other first-party event tables (`signup_funnel_events`, `search_queries`, `trip_suggestion_impressions`, `trip_booking_clicks`, `affiliate_clicks`) | 2 | 3 | 0 | 3 | 1 | **9** | **Harden** (disclose, retention, erasure) |

## Detail on top risks

### 12 & 13 — Our own analytics were the undisclosed part (added 2026-09-12)

The register was written as a VENDOR register, so it scored every flow that
leaves the building and none that stays in it. That left the largest
behavioural dataset we hold entirely unlisted, and it is not small: measured
2026-09-12, `umami.website_event` held 3.07M rows and `public.user_events`
335,810 — the latter carrying `user_id`, `entity_type` and `entity_id`, i.e. a
per-person trail through venues, events and the intimate features. On this
platform that trail is itself sensitive regardless of where it is stored.

Egress scores 0 and jurisdiction 1 (Supabase, EU) — which is exactly why it was
easy to overlook and exactly why it still belongs here. The risk is not
transfer; it is **volume, retention and the absence of a lawful basis we had
told users we were relying on**:

- `user_events` had NO consent gate, was not named in the Privacy or Cookie
  policy, and was not erased on account deletion.
- The Umami page-view pipeline had a careful consent gate that a second,
  ungated React tracker walked straight past — it carried 98.9% of sessions.
- Neither table had any retention. Nothing in the whole analytics layer did.

**Decision: Harden, not Replace.** Keeping this data first-party is the right
architecture; the gap was that first-party was treated as self-evidently safe.
Fixed by consent-gating every writer, 90-day retention on both tables
(`umami_retention`, `user_events_retention`), explicit erasure in
`_delete_user_data_core`, and disclosure in the Privacy and Cookie policies.

**Honest residue:** rows keyed only by an anonymous `session_id` — most of
`signup_funnel_events`, and every `user_events` row from a signed-out visitor —
cannot be attributed to a person on an erasure request. Retention is the only
mechanism for those, and saying so is better than implying a deletion we cannot
perform.


### 1 & 2 — Sensitive inference leaving EU
- **Risk:** user-identifiable trip prompts / free-text submissions and content processed on US (OpenAI) or
  CF-global (Workers AI) infrastructure; subpoena/breach exposure of LGBTQ+-linked user intent — elevated harm
  for this audience in hostile jurisdictions.
- **Scenario:** a trip query naming a user + a high-risk destination is logged by a US provider and later compelled.
- **Mitigation (short):** AI Gateway with zero retention + PII redaction. **(long):** route user-identifiable
  flows to the relocated EU vLLM (hybrid-by-sensitivity decision); keep CF-global only for public-catalog tasks.
- **Decision:** Replace path for sensitive flows; harden the rest.

### 3 — AI Gateway log residency
- **Risk:** centralizing all model traffic through AI Gateway (the goal) also centralizes prompt/response logs;
  region + retention must be controlled or it becomes the single biggest PII sink.
- **Mitigation:** configure short/zero log retention; redact PII pre-prompt; document processing region.
- **Decision:** Harden — non-negotiable precondition of the gateway rollout.

### 4 & 5 — Sentry & Resend (US, user PII)
- **Mitigation:** Sentry — `beforeSend` PII scrub, disable session replay, sample rates; evaluate EU region.
  Resend — enable EU data region (supported); move inbound to CF Email Routing (free, already own the zone).
- **Decision:** Harden / region-swap. Low effort, high residency win.

### 6 — Stripe
- **Decision:** Accept. Payment processing is necessary and PCI-bound; hosted checkout minimizes card-data
  handling. Ensure DPA on file. Not a migration target.

### 7 — Mapbox geocoding
- **Decision:** Replace with self-hosted Nominatim (already running; relocate off Infomaniak). Eliminates
  per-query user-location egress to the US.
