# Data Flow Map

_Per-vendor: data categories, direction, frequency, necessity, minimization. Audit date 2026-06-01._

## AI inference (the hard-requirement surface)

| Vendor | Data sent | Direction | Frequency | Necessary? | Minimization |
|---|---|---|---|---|---|
| **NVIDIA NIM (free tier)** | **everything the two edge-function LLM clients send** — catalog text AND **user trip prompts, chat turns, moderation text** | outbound US | per call, first choice | cost | see the box below — this is the widest AI egress on the platform |
| OpenAI gpt-4o-mini | venue/event/news text, scraped page content (public catalog); no user PII | outbound US | per-ingest item | yes (enrichment) | route via AI Gateway; cache; later EU model. Content is public → low PII, but **leaves EU**. |
| Workers AI | query text, content text, **user trip prompts**, submission text | outbound CF-global | per-request | yes | **trip prompts/submissions are user-identifiable** → route sensitive ones to EU vLLM (hybrid decision). Public-content tasks acceptable on CF global. |
| Anthropic (if `USE_ANTHROPIC=1`) | trip prompts | outbound US | per-request | optional | default routes to Workers AI; keep off unless needed. |
| Gemma vLLM (CH) | cms-ai content, sensitive flows | outbound→CH | per-request | yes | already EU; **relocation target after Infomaniak teardown**. |

### NVIDIA free tier — a deliberate exception to the rule in the Workers AI row

The Workers AI row above states this file's own rule: **trip prompts and submissions are
user-identifiable and should be routed to a trusted endpoint.** Routing *all* edge-function LLM
calls to NVIDIA breaks that rule, knowingly, as a cost decision taken 2026-08-29. It is written
down here rather than left implicit, because a residency doc that describes the previous topology
is worse than no doc at all.

What now leaves the EU that did not before: `trip-concierge`, `trip-inbox-chat`, `trip-inbox-slot`,
`ai-plan-trip`, `trip-recap`, `trip-safety-narrative`, `trip-cost-estimate`,
`packing-suggestions-llm`, `generate-usernames`, `feedback-autotriage`, `cms-ai` and
**`intimate-moderation`** — the last being user-authored intimate content on an LGBTQ+ platform,
sent to a **free tier whose terms permit training use and carry no SLA or DPA**.

**Reversal is a secret change, not a deploy.** Any of:

```
NVIDIA_EXCLUDE_CALLERS=intimate-moderation,trip-concierge,trip-inbox-chat,ai-plan-trip
NVIDIA_DISABLED=1          # whole provider off, key left in place
                           # or unset NVIDIA_API_KEY — the router goes inert
```

**Live setting, verified 2026-09-03: `NVIDIA_EXCLUDE_CALLERS=translate-i18n-batch`** — one batch
job, and **every caller named above is still in scope**, so nothing in this section's residency
claim changes. That one entry is a reliability exclusion, not a privacy retreat.

It briefly held all 13 callers above, which silently narrowed the decision recorded here down to
batch pipelines only; cleared 2026-09-02 after review. `translate-i18n-batch` was added back on
its own the next day on measured evidence: over four hours it failed **3 of 7 calls (43%)** on
45s timeouts while every other caller ran at **1.6% across 61 calls/hour**. Its 4,000-token
translation batches are simply too big for the free tier's latency, and because it fires as a
burst on the hour it spent all three breaker failures inside two minutes — taking NVIDIA fully
offline (measured: **zero** calls) for the 900s reset, **15 minutes in every hour**, for the eight
callers that were working. Excluding it costs ~8 calls/hour and recovers ~61.

**A secret's value cannot be read back, and that is how the drift hid.** `supabase secrets list`
prints only a name and a **plain `sha256(value)`** digest, so a variable that contradicts this
document looks identical to one that agrees with it. Two ways to check, cheapest first: hash a
candidate and compare (validate the method against a variable whose value you just set — but
brute force is hopeless past a few names; 7.5M candidates failed to find these 13), or deploy a
throwaway token-gated function that returns the one variable and delete it immediately.
**Do not infer the setting from traffic** — the excluded callers are the interactive ones, which
can go days without firing, so "no NVIDIA calls from `trip-concierge`" is equally consistent with
"excluded" and with "nobody planned a trip this week".

Out of scope and still Cloudflare-only: embeddings (`bge-m3`, a fixed 1024-dim space the entire
search index is built on), vision, and everything on the Workers `env.AI.run` binding.

## User-PII egress

| Vendor | Data | Direction | Frequency | Necessary? | Minimization |
|---|---|---|---|---|---|
| Resend | recipient name + email + body | outbound US | per email | yes (transactional) | **enable Resend EU region**; move inbound to CF Email Routing. |
| Stripe | name, email, amount | outbound US | per checkout | yes (PCI) | keep; rely on Stripe-hosted checkout to minimize card data touch; document DPA. |
| Sentry | stack traces, breadcrumbs, user/session ctx | outbound US | per error | partial | **scrub PII, disable session replay, sample**; or EU-region/GlitchTip. |
| GitHub | feedback text (may contain user words) | bidirectional US | per feedback | partial | strip submitter identifiers before forwarding. |
| Mapbox | user-typed location strings | outbound US | per geocode | replaceable | **prefer self-hosted Nominatim** (no egress). |

## Ingestion (inbound fetch — no user data leaves)

All `source-*` / `import-*` / `enrich-*` functions pull third-party catalog data (venues, events, products,
images, geo). Outbound contains only API keys + query params (place names, categories), never user PII.
Necessity: high (content is the product). Minimization: ensure all called server-side (they are — edge functions);
no client-side keys leak (`.env.example` confirms no AI/source keys in `VITE_*`).

## Inside-boundary flows (no external egress)

- Embeddings (bge-m3) generated by Workers AI, stored in Supabase pgvector (Meili removed in #1405).
- Umami analytics → Supabase Postgres only.
- Auth, sessions, all entity data → Supabase (Zürich).
- Images → R2 + Supabase Storage.

## Residency summary

- **Stays EU/CH:** all data of record (Supabase Zürich), search/geocode/AI-fallback (Infomaniak CH), analytics.
- **Leaves EU:** AI content (**NVIDIA US — now first choice for every edge-function LLM call,
  including user trip prompts and moderation text**, see the box above; OpenAI US, Workers AI global),
  emails (Resend US), payments (Stripe US),
  errors (Sentry US), geocode text (Mapbox US), feedback (GitHub US).
- **Post-plan target:** sensitive inference → EU endpoint; embeddings/vectors → Vectorize (CF global, public
  content); all model traffic behind AI Gateway with short retention + PII redaction.
