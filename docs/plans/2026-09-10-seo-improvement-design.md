# SEO improvement programme — 2026-09-10

Measured audit of queer.guide SEO, and the sequenced work that follows from it.
Every number here was measured on production or against the live database on
2026-09-10, never estimated. Re-measure before trusting any of it later.

## Standing conclusion

**The technical SEO foundation is good and is not the problem.** The middleware
pre-renders for bots, 14 sitemaps publish 61,718 URLs, hreflang covers 11
locales, JSON-LD is emitted per detail type, canonicals are correct and
self-referential on every route checked, and no unintended `noindex` exists
anywhere (`meta robots` and `x-robots-tag` are absent on all 24 responses
sampled — the previously documented leaked-`x-robots-tag` signature is gone).

What is wrong is three things the existing guardrails cannot see: the site
publishes 61,718 URLs that nothing internally links to, a large share of those
pages are near-empty, and there is no measurement of whether any of it ranks.

## Measured findings

### A. No performance measurement exists

- No `GOOGLE_SERVICE_ACCOUNT_KEY` / `SEARCH_CONSOLE_PROPERTY` repo secrets.
- No `reports/` directory. `search-console-report.yml` has **never run** — it
  exits 78 without those secrets.
- No `google-site-verification` meta tag in the repo or on prod (DNS-based
  verification is possible and was not disprovable from here).

Nothing measures impressions, clicks, CTR, or index coverage. Every SEO decision
on this site is currently unfalsifiable.

### B. The guardrails measure less than they appear to

| Guard | What it actually asserts |
|---|---|
| `seo-check.yml` | 15 **static** routes. Real assertions, exits 1 on failure — but zero coverage of the ~61,700 detail URLs |
| `sitemap-freshness.yml` | `minEntries: 0` on news, blog, hotels, villages, tags — **an empty sitemap passes** |
| `sitemap-freshness.yml` | landmarks, milestones, tag-categories are **not in the list at all** |
| `lighthouse.yml` | 6 routes, scores only |

The `sitemap-freshness.mjs` comment at lines 28–29 states `/news/*` is "de-indexed
(hard 410 Gone), expect 0 entries". That is **stale**: `public/_redirects` records
the 410 handler was removed, and news is live with 24,117 URLs returning HTTP 200
(verified on three sampled slugs). So `minEntries: 0` is a dead floor on 39% of
the URL corpus.

Live symptoms no guard caught:

| Sitemap | Entries | Newest lastmod | State |
|---|--:|---|---|
| `sitemap-blog.xml` | **0** | — | empty, returns 200 XML |
| `sitemap-landmarks.xml` | **1** | 2026-07-25 | unmonitored |
| `sitemap-hotels.xml` | 323 | 2026-06-18 | frozen 84 days |
| `sitemap-villages.xml` | 131 | 2026-06-08 | frozen 94 days |

Also: the index `<lastmod>` is generation time, not data time — all 14 entries
read today's date including the three frozen ones. It is not a freshness signal.

### C. The crawlable link graph is ~10 pages

Of ~65 `href`s Googlebot receives on `/venues`, **57 are `/assets/*` bundles**.
Five are real page links (`/events`, `/help`, `/places`, `/submit`, `/travel`).
**Zero point to a venue.**

| Hub | Detail links served to Googlebot | URLs it should reach |
|---|--:|--:|
| `/venues` | **0** | 23,664 |
| `/cities` | **0** | 2,713 |
| `/tags` | **0** | 2,604 |
| `/personalities` | **0** | 1,458 |
| `/events` | **0** | 3,023 |

The bot body injection itself works (`/venues/bar-1-5` → `<h1>Bar 1</h1>`). The
gap is that `STATIC_ROUTE_BODY` in `functions/_lib/routeBody.ts` carries only
hand-written navigation links — 4 per hub — and no data-driven content links.
The prerendered `<nav>` is verbatim identical across `/map` and `/guides`, so the
hubs are also near-duplicates of each other in the crawler-visible body.

**Stated precisely, without overclaiming:** Google renders JavaScript, so the SPA
render can still surface these links and the pages are not invisible. But the
pre-rendered bot contract this architecture deliberately built omits content
links entirely, so all 61,718 URLs are sitemap-only — no internal link equity, no
crawl path, and a render-budget dependency at 60k scale. That is the classic
"Discovered – currently not indexed" shape.

No hub page emits any JSON-LD at all (no `CollectionPage`, no `ItemList`), and no
detail page emits `BreadcrumbList`.

### D. Detail pages are thin

Venue crawler bodies measured 64–305 characters across four random samples:

- `/venues/dick-s-r-u-crazy` — **64 chars**: name, city, and nav. Nothing else.
- `/venues/prescott-market-west-oakland` — 204 chars
- `/venues/eagle-brook-church` — 305 chars

This matches the database: **11,506 of 24,236 live venues (47%) have a
completely empty `description`**. Where descriptions do exist they are often
refuge-restrooms scrape noise ("There are 3 in area and 2 face each others").

### E. Rows are deindexed with no recorded reason

| Cohort | Count | Note |
|---|--:|---|
| News `quality_status='passed'` but `seo_indexable=false` | 6,144 | in site search, blocked from crawlers |
| …of those, with an **empty** blocked-reason array | **2,522** | deindexed, nothing recorded |
| Active tags deindexed with `seo_deindex_reason = null` | **505** | carry real descriptions |
| Personality drafts carrying real prose, not public | ~6,398 | 1,691 of 16,132 rows are public |

Deliberate and not a defect: 19,951 marketplace listings excluded as
`content_rating IN ('explicit','adult')`; 42,951 deindexed events are all
past-dated `status='completed'` (the ~36.5k Wayback import); 3,036 deindexed
cities are overwhelmingly `ghost`/`placeholder` shells.

### F. Thin programmatic landing pages

`sitemap-landings.xml` publishes 647 URLs. **642 are `/pride/:year/:city`**, and
the year distribution is inverted:

| Year | Pages |
|---|--:|
| 2024–2027 (real) | 6 each |
| 2028 | **206** |
| 2029 | **206** |
| 2030 | **206** |

**618 of 647 (96%) are speculative future Pride years** for cities including
Moscow, Mombasa and Ulaanbaatar — ~1,600 chars of template each, zero content
links. `PRIDE_YEAR_MAX = 2030` in `functions/_lib/landing.ts`. This is
thin/doorway content at scale and a crawl-budget drain.

### G. Incorrect structured data

`NewsArticle.publisher` on news detail pages emits the **original outlet's name
with Queer Guide's own logo**:

```json
"publisher": { "@type": "Organization", "name": "Variety",
               "logo": { "url": "https://queer.guide/icons/icon-192.png" } }
```

False attribution across up to 24,117 URLs, and `publisher` is an E-E-A-T signal
for `NewsArticle`.

Smaller on-page defects:

- `/tags` states three different topics: `<title>` "LGBTQ+ Glossary & Tag Index",
  `<h1>` "Queer Knowledge Hub — guides, references, and reading lists", and a
  meta description about browsing terms.
- `/tags/eunuch` title is 20 chars (`Eunuch | Queer Guide`) — applies to the
  short-name share of the 2,604-URL tag corpus.
- The `<noscript>` fallback for `/map`, `/guides` and **every detail page** is the
  generic "Crisis support" hotline card, which says nothing about the page.

## Outcome — landed 2026-09-10 via #3599

W1, W2, W3, W5 and a fifth fix found along the way (venue/event/hotel city links)
shipped as one batch, merge commit `97f6d9d46`. Serial merging could not
converge: branch protection is `strict=true` with 12 required contexts, GitHub
auto-merge **never updates a BEHIND branch**, and `main` moved throughout — so
the five PRs were merged into one integration branch and landed together, the
pattern already recorded in `batch_integration_branch_is_the_merge_queue`. It
must be merged with a **merge commit**, not squashed, or the constituent PRs are
not auto-marked (two were not, because a concurrent session pushed to their
branches after the batch was built; both were verified content-complete on `main`
and closed by hand).

Verified on **production** after the deploy went live (`/build-id.txt` =
`97f6d9d46…`, matching `main`):

| Check | Result |
|---|---|
| `scripts/seo-check.mjs` | PASS — 15 static + 8 detail = 23 routes |
| `scripts/seo-hub-links.mjs` | PASS — all 7 hubs carry crawl links |
| `scripts/sitemap-freshness.mjs` | PASS — all 14 sitemaps |

Hub detail links, every one of which was **0** before:

| Hub | Before | After (prod) |
|---|--:|--:|
| `/venues` | 0 | 60 |
| `/cities` | 0 | 80 |
| `/tags` | 0 | 87 |
| `/personalities` | 0 | 60 |
| `/events` | 0 | 60 |
| `/hotels` | 0 | 60 |

Also on production: `sitemap-landings.xml` 647 → 382 entries; sitemap index
14 → 13 (blog removed); `/pride/2030/moscow` and `/pride/2028/mombasa` return 404
while `/pride`, `/pride/2026` and `/pride/2026/region/europe` stay 200;
`NewsArticle.publisher` reads `Queer Guide` with `sourceOrganization: Variety`;
and the sampled venue city links resolve — `fulford-harbour → /city/victoria-bc`,
`checkpoint-zuerich → /city/zuerich`, `carpe-diem-1 → /city/grad-hvar-1`,
`1350-club → /city/los-angeles`.

**Safety gate, checked on production rather than locally.** The five
highest-quality `safety_gated` venues (Nassawiyat/Morocco, Damj and
Shams/Tunisia, two saunas) are all absent from `/venues`, against a positive
control of 60 real venues served. Separately, **all 60 served venues are readable
by the anon key**, so whatever key the Pages project uses, nothing the hub
publishes is content an anonymous visitor could not already see.

**What is NOT established, and must not be recorded as proven:** whether the
Pages project supplies `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY`. Two
discriminators were tried and both are inconclusive — a gated venue's detail page
returns 200 under either key (`isGatedEntity` has an anon-safe fallback), and the
served set is anon-visible under either. The explicit `safety_gated=eq.false`
filter and RLS are both in place and the observable behaviour is correct, but the
filter has not been *isolated* as the thing doing the work.

## Workstreams

Sequenced by leverage against risk. W1–W3 are mechanical and high-confidence;
W4 needs data decisions and is deliberately last. W1/W2/W3/W5 are **done** — see
the outcome section above; W4 and W6 remain.

### W1 — Make the guardrails honest
Real `minEntries` floors derived from current live counts; add landmarks,
milestones and tag-categories to the audit; correct the stale news comment; add
`maxAgeDays` where a continuous writer genuinely exists. Extend
`scripts/seo-check.mjs` to cover one detail route per type, and to assert that
hub bodies contain content links (the W2 regression guard).

**Why first:** every later claim of improvement is checked by these. Fixing them
last means shipping W2–W5 with no way to prove they worked.

### W2 — Restore the crawl graph
Inject data-driven content links into hub bodies for `/venues`, `/events`,
`/cities`, `/tags`, `/personalities`, `/marketplace`, `/guides`. Add
`CollectionPage` + `ItemList` JSON-LD to hubs and `BreadcrumbList` to detail
pages. Follows the existing `resolveDetailRoute` Supabase-fetch pattern.

**Constraint:** must not regress the cloaking contract in `docs/SEO.md` — every
injected link must be something the SPA also renders for a real user.

### W3 — Correct the structured data and on-page defects
Fix `NewsArticle.publisher`; reconcile the `/tags` title/h1/description; give
short tag titles a descriptive suffix; route-specific `<noscript>` fallbacks.

### W4 — Thin content and unrecorded deindexing
Compose venue descriptions **deterministically from structured fields already
held** (category, city, amenities, accessibility, hours) — explicitly *not* LLM
prose generation, per the retired tag-prose judge precedent in `CLAUDE.md`.
Record a reason for the 2,522 news and 505 tag rows deindexed with none.

### W5 — Prune speculative landings
Lower `PRIDE_YEAR_MAX` to the last year with real data, or gate
`/pride/:year/:city` on the city having at least one event that year. Removes
~618 thin URLs.

### W6 — Wire measurement
Service-account setup steps for Search Console, repo secrets, and confirm
`search-console-report.yml` produces `reports/seo-weekly-YYYY-WW.md`. Blocked on
confirming GSC property access — user has not verified it yet.

## Traps recorded for this work

- **`zsh` does not word-split unquoted `$var`.** A `for u in $URLS` loop over
  curl'd URLs runs once with all URLs concatenated and returns `status=000`. Use
  `while read -r`.
- **`$pat[^"]*` inside a zsh double-quoted string parses as an array subscript**
  and raises `bad math expression`, printing `0` for every count. Those zeros are
  command errors, not measurements. Use `${pat}` and verify a positive control.
- **Counting `href="/..."` counts `/assets/*` bundles.** On these pages that is
  ~88% of all hrefs. Filter them out or the link count is meaningless.
- **The sitemap index `<lastmod>` is generation time**, not content freshness.
