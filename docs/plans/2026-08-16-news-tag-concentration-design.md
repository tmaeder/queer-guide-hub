# News tag concentration — corrected diagnosis and design

Date: 2026-08-16. All figures measured on prod (`xqeacpakadqfxjxjcewc`) via the Management API.

## Summary

The incoming brief attributed all four headline symptoms to one cause (the unordered
`unified_tags … limit 200` vocabulary hint). Measurement shows **three distinct causes**, only
one of which regrows, and the brief's prescribed remedy would have caused fresh damage.

| Symptom | Rows | `entity_type` | Actual cause | Regrows? |
|---|---|---|---|---|
| `crops` | 2,609 | `news` | `tag_aliases` row `culture` → Crops (`multilingual`/`auto`) | **Yes, nightly** |
| CABINS | 4,136 | `news_article` | retired writer, Feb–Mar 2026 | No |
| `dick-on-a-stick` | 2,024 | `news_article` | same | No |
| `e-stim-machine` | 1,612 | `news_article` | same | No |
| `accessibility` | 1,966 | `news` | the LLM hint window — **the live instance of the brief's mechanism** | **Yes** |

## Cause 1 — an ordinary-word multilingual alias (the only regrowing one)

`tag_aliases` contains `alias_name='culture'`, `alias_type='multilingual'`, `review_status='auto'`,
canonical = **Crops**. French *culture* means cultivation. `run_tag_assignment_reconcile()` builds
`_canon` from `lower(name) | lower(slug) | lower(alias_name)`, so every article carrying the
legitimate string `culture` (2,609 of them) is auto-tagged **Crops**.

This is the same class as the `Pep` → Amphetamine incident. Other live collisions:

| article string | → tag | n |
|---|---|---|
| `culture` | crops | 2,609 |
| `london` | big | 79 |
| `maga` | enchantress | 56 |
| `drama` | play | 44 |
| `infrastructure` | amenities | 25 |

Exposure: **14,931 `multilingual`/`auto` aliases, 5,978 of them bare single English-looking words**,
all wired directly into auto-tagging with no review.

### Why the brief's remedy would have caused damage

The brief says: *"Any cleanup must also strip the string from `news_articles.tags[]`."* For `crops`
that string is **`culture`** — a legitimate news tag on 2,609 articles. Stripping it would delete
real editorial data to fix an alias bug. **Delete the alias row; leave `news_articles.tags[]`
untouched.**

This also explains why `20260803035804` failed. Its guard was
`not exists (… t.slug = any(n.tags))` — it compared the slug `crops` against `tags[]`, found no
match, classified the rows as stale, and deleted them. The reconciler then recreated them from
`culture` the same night. The guard checked the wrong string.

## Cause 2 — a retired writer (inert, but public)

`entity_type='news_article'` holds **35,250 rows across only 169 tags** (~209 rows/tag — the
concentration signature). Write history: 7,746 in Feb 2026, 27,504 in Mar 2026, **nothing since**.

`run_tag_assignment_reconcile()` writes only the `news` spelling. `pipeline-quality-enhance` and
`news-quality-backfill` **do not write `unified_tag_assignments` at all**. So a vocabulary policy in
those two functions would have prevented **none** of CABINS / `dick-on-a-stick` / `e-stim-machine`.

Only **152 of 35,250** rows (0.4%) are reproducible from live `news_articles.tags[]`, and all 152
already exist under the canonical `news` spelling. `get_tag_linked_content` reads
`entity_type IN ('news_article','news')`, so these rows do render publicly today.

## Cause 3 — the vocabulary hint (the brief's mechanism, live, different victim)

`supabase/functions/pipeline-quality-enhance/index.ts:34` and
`supabase/functions/news-quality-backfill/index.ts:18`:

```ts
supabase.from('unified_tags').select('slug').limit(200),
```

No `order`, no `status` filter. Sliced to 80 (`index.ts:155`) then to 60
(`_shared/news-quality/prompts.ts:88`) and shown as "Preferred tag vocabulary" **identically for
every article in the run**. It draws from all **9,360** tags; only 2,749 are active.

Because physical order is roughly alphabetical, the 60 slugs currently shown are:

```
100-footer, 17-beta-hydroxysteroid-dehydrogenase-3-deficiency, 1950s-household, 1hetty, 2-mmc,
24-7, 2c-b, 3-mmc, 4-fa, 6-apb, 69, 69ing, 8-panel-sti-test, abasiophillia, abduction-play,
ableism, abrasion-play, absinthe, abstinence, acault, accents, acceptance, accepting,
access-to-inclusive-public-spaces, accessibility, accessibility-features, … ace
```

**The concentration is alphabetical, not usage-driven.** `20260619120000` denylisted `acceptance`,
`accepting`, `access-to-inclusive-public-spaces` and `access-to-public-services` — **all four sit in
this window**. It removed the symptoms without seeing the window that produces them. The next
untreated tag in the same window is live now:

- `accessibility` — 1,966 articles, through 2026-08-12, on *"Idaho Trans Girl Dies by Suicide"*,
  *"Belfast Festival Cancels Anti-Trans Event"*, *"HSE's Head of Gender Healthcare to Step Down"*.

**The window is not stable.** It shifts whenever physical order changes. PR #2773 (2026-08-15)
imported the saferparty substances, placing `2-mmc, 2c-b, 3-mmc, 4-fa, 6-apb` at the front. Not yet
leaked into `news_articles.tags[]`, but this is a live regression pending the next pipeline run:
recreational drug slugs offered as preferred vocabulary for LGBTQ+ news.

## The eligibility axis: category and `is_adult` are both unusable

The obvious filter — restrict the hint to "news-appropriate categories" — was measured and
**rejected**:

| slug | category | `is_adult` |
|---|---|---|
| `freedom-of-religion` | **BDSM & Power Exchange** | false |
| `freedom-of-association` | **BDSM & Power Exchange** | false |
| `freedom-of-movement` | **BDSM & Power Exchange** | false |
| `dick-on-a-stick` | **Sexual Health** | false |
| `e-stim-machine` | **Sexual Health** | false |
| `hepatitis-c` | Sexual Health | false |

A category allowlist would **exclude** freedom of religion / association / movement and **include**
`dick-on-a-stick` and `e-stim-machine` — inverting the filter on exactly the tags that caused this
incident. `is_adult` is false on all of them, so an `is_adult` filter excludes nothing either.

This restates the existing CLAUDE.md finding: *"'Health tag' is SELF-SELECTING — the category cannot
express it."* **Do not gate the news vocabulary on `category` or `is_adult`.**

## Design

### 1. Per-article retrieval replaces the fixed slice

Eligibility is only `status='active' AND merged_into_id IS NULL` — unambiguously correct on its own
merits (deprecated and merged tags should never be offered) and the only axis measurement supports.

Per-article selection does the real work: a tag enters the hint **only if its own name or slug terms
occur in that article's title/body**. Consequences:

- No two articles see the same list, so the concentration mechanism is gone by construction — not
  merely relocated to whichever 60 tags win a new ordering.
- The corrupt category taxonomy becomes irrelevant: `freedom-of-religion` matches a
  religious-freedom article *despite* its BDSM category; `dick-on-a-stick` never matches a Bridgerton
  article *despite* its Sexual Health category.
- Drug slugs cannot appear unless the article is actually about that drug.
- If nothing matches, send **no** vocabulary line for that article rather than a filler list.

The eligible set is fetched once per run with an explicit stable `order`, never an arbitrary
`limit`. Applies to both `loadCandidatePools` implementations.

### 2. Validate output, asymmetrically

`pipeline-enrich-news` gets `suggested_tags` validation mirroring the existing `category` drop
(`_shared/ai-enrichment.ts:387-394`).

**Deliberately a denylist, not an allowlist.** `20260619120000` establishes that news tags are mostly
legitimate long-tail topics (cities, people, shows) and that singletons are preserved by design; an
allowlist against the eligible vocabulary would discard them. So: reject a suggested tag only when it
resolves to a known never-for-news term, and let unrecognised free text through to
`normalize_news_tags`, which remains the perpetual write-gate.

### 3. Concentration metric — ratchet, not threshold

Every existing tag-health metric measures under-use; `tag_quality_scorecard`'s `c_used` dimension is
a boolean "used at all", so a tag on 60% of the corpus scores identically to a tag on one article.

A flat threshold does not work: `lgbtqia+` legitimately covers 16.0% of the corpus and `culture`
6.6%. A 5% rule would fail on the site's own remit.

So it is a **ratchet**, matching the `pipeline_hygiene_stats().stale_pending_by_entity` and
typecheck-baseline precedents: snapshot today's per-`(tag, entity_type)` corpus fraction as a
baseline, then hard-fail only on a tag that **newly** crosses the threshold or materially exceeds its
own baseline.

- New gate in `release_gate_checks()`, severity `critical`, so
  `scripts/check-data-quality-gates.mjs` fails CI (`data-quality-gates.yml`).
- Surfaced alongside the other tag-health metrics in `TagQualityPanel.tsx` /
  `useTagVocabularyHealth.ts`.

### 4. Cleanup (reversible, snapshot first)

1. Delete the `culture` → Crops alias; audit the other live `multilingual`/`auto` collisions
   (`london`, `maga`, `drama`, `infrastructure`).
2. Delete the 2,609 `crops` `news` assignments. **Leave `news_articles.tags[]` untouched.**
3. Sweep the 35,250 dead `news_article` rows. Loses zero live links (all 152 reproducible pairs
   already exist as `news`).
4. Do **not** strip strings from `news_articles.tags[]` in this pass. `accessibility` needs a
   per-article judgement (some articles genuinely are about accessibility) and is better handled once
   the hint is fixed and the metric is watching.

## Coordinate

Recent tag vocabulary work: #2773, #2776, #2782, #2806. Item 1 touches `tag_aliases`, item 3 touches
`release_gate_checks()`.
