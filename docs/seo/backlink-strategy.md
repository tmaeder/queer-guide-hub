# Backlink strategy

How queer.guide earns links from other sites. `docs/SEO.md` covers the technical layer (edge-rendered HTML for crawlers, JSON-LD, sitemaps, oEmbed). That layer is in good shape; the gap is that nothing on the site is built to be **cited**. This doc ranks the pages worth linking to, lists real sites that already link to comparable resources, and names the code changes that would make each pitch credible.

Measured 2026-11-18. Every page in §1 was fetched from `https://queer.guide` with a Googlebot user agent (the HTML a crawler and a link-checker see). Every target in §2 came from a web search and was requested the same day. Re-measure before acting on any number here.

**No outreach has been done.** This is a plan. Nobody listed in §2 has been contacted.

---

## 1. Linkable assets, ranked

Ranked by (how much the page adds over what a linker already uses) × (how many sites would plausibly link). "Crawler HTML" is what `curl -A Googlebot` returns, which is also what a link-checker, an editor vetting a source, and an LLM crawler see.

| # | Page | Why it is citable | Who links | What it lacks |
|---|------|-------------------|-----------|---------------|
| 1 | [`/tags/rights-by-country`](https://queer.guide/tags/rights-by-country) + [`/sources`](https://queer.guide/tags/rights-by-country/sources) + [`/trans`](https://queer.guide/tags/rights-by-country/trans) | All 250 countries/territories, criminalisation + death-penalty + partnership status from the ILGA World Database, re-imported nightly. `/sources` states its limits plainly (national, statutes not enforcement, "not a safety rating"). `/trans` keeps legal gender recognition and TGEU violence data **separate, not scored** — no comparable free resource does that. | University study-abroad offices, travel-safety pages, NGO resource lists, journalists | No JSON-LD at all on any of the three (0 `ld+json` blocks). Crawler body is ~110–150 words: the per-country table is not in the HTML a link-checker sees. No download, no licence statement, no "cite this" block, no last-updated date in the HTML. |
| 2 | Equality score (`src/utils/equalityScore.ts`, shown on country pages) | A 0–100 composite over ILGA data with fixed tiers. Comparable to Equaldex's index, which Wikipedia cites on **168 articles** (counted via the `exturlusage` API). | Journalists, students, Wikipedia editors | **No methodology page.** The only description is two sentences on `/sources` ("opens at 50 and adds points per recorded right"). A score nobody can reproduce cannot be cited. `/methodology` and `/equality-score` both 404. |
| 3 | [`/tags/interactions`](https://queer.guide/tags/interactions) | 421 drug combinations across 31 substances, TripSit + eve&rave + FDA label data, each cell credited to its source. Queer-context harm reduction (chemsex substances, poppers × PDE5 inhibitors with nitrate intervals). | Chemsex services, harm-reduction charities, sexual-health clinics | Crawler HTML is 37 words — the grid is client-rendered, so a checker sees a title and nothing else. No JSON-LD. The obvious competitor is TripSit's own chart, so the pitch must lead with the queer-specific combos and per-cell attribution, not the chart itself. |
| 4 | [`/tags/sti-guide`](https://queer.guide/tags/sti-guide) | Transmission, window periods and which prevention method covers which infection, on one page. | Sexual-health charities, university health centres, testing services | Same as #3: 39 words of crawler HTML, no JSON-LD, no "last clinically reviewed" date — a health linker will look for one. |
| 5 | [`/help`](https://queer.guide/help) and `/help/:country` | Crisis lines organised by country, verified for operation and queer-affirming intake. | LGBTQ+ centres, university counselling pages, community crisis-resource lists | `/help` is fine (title, description, 70-word body). **`/help/:country` is not:** `/help/DE` serves the generic site title and description, and no `/help/*` URL is in any sitemap. A per-country link is the one a centre would actually use, and today it looks like the homepage. No last-verified date visible. |
| 6 | [`/history/:slug`](https://queer.guide/history) | Thousands of dated milestones, each with `Event` + `BreadcrumbList` JSON-LD and a sources list. | Library LGBTQ+ history guides, History Month resource pages | Individual milestones are thin (~40 words) and often cite Equaldex and Wikipedia themselves, so they are a weak citation for anyone who already uses those. The **timeline hub** (`/history`, organised by era) is the asset to pitch, not single entries. |
| 7 | [`/competitions/*`](https://queer.guide/competitions) | One dataset: 30+ competitions, 340+ editions, 1,800+ entries — Drag Race franchises plus IML, Mister International Rubber, Miss Gay America, Miss Continental and others back to 1973. Type pages (`/drag-series`, `/leather-titles`, …) are in the static sitemap. | Drag and leather fan wikis, leather history sites, entertainment journalists | No JSON-LD on hubs. The episode-by-episode placement grid is client-rendered. Fan wikis (Fandom) are nofollow; value here is referral traffic and entity association, not link equity. |
| 8 | [`/pride/:year`](https://queer.guide/pride/2025) | Pride events by year and region (2025: 72 cities), 418 words of crawler HTML, `BreadcrumbList`. | Pride organisers, travel blogs, tourism boards | Lists events but no `Event`/`ItemList` JSON-LD on the year page. Competes with IGLTA, Spartacus and Travel Gay calendars, so weakest standalone pitch; strongest as a seasonal link in May–June outreach. |
| 9 | [`/organizations`](https://queer.guide/organizations) | Directory of support orgs, advocacy groups, testing services (Checkpoints, AIDS-Hilfe, Stonewall clinic Warsaw, …). | The listed organisations themselves ("as listed on") | 37 words of crawler HTML — the directory is invisible to crawlers. No "you are listed" badge or snippet for an org to put on its site. |

Already exists but is a stub: [`/press`](https://queer.guide/press) renders (200) with a 29-word body promising "press releases, brand assets, and media inquiries" and none of them. Fill it rather than add a new route (see §3).

**Cross-cutting gap:** every landing page above emits zero JSON-LD in crawler HTML; only detail pages (`/history/:slug`) and the homepage (2 blocks) do. And the data on #1, #3, #4, #7, #9 is client-rendered, so the first thing an editor's link-checker or a Wikipedia reviewer sees is a title and a paragraph.

---

## 2. Target list

57 real sites found by web search on 2026-11-18. **Checked** = HTTP status from a plain request that day: `200` reachable; `403` = bot wall (Cloudflare etc.), the page exists per search results but must be checked in a browser before pitching. Dropped as unreachable: `uhcl.edu` LGBTQ abroad (404), `rainbowauckland.org.nz` and `wiki.outhistory.org/wiki/Links` (timed out).

Effort: **S** = one email to a page owner who maintains a resource list; **M** = needs a tailored pitch or a §3 item shipped first; **L** = editorial process, community norms, or a relationship.

### Orgs already in `/organizations` ("as listed on" outreach)

| Target URL | Type | Pitch page | Angle | Effort | Checked |
|---|---|---|---|---|---|
| https://gaycenter.org/ | LGBTQ+ centre (NYC) | `/help`, `/organizations` | You are listed; your resources page could carry our world crisis-line index | S | 200 |
| https://utahpridecenter.org/ | LGBTQ+ centre / Pride | `/pride/:year`, `/help` | Listed org + Pride calendar link | S | 403 |
| https://www.aids.ch/en/addresses | HIV testing finder (CH) | `/tags/sti-guide` | Listed; STI window-period guide as companion to their test finder | S | 200 |
| https://www.checkpointgoteborg.org/en | MSM testing (SE) | `/tags/sti-guide`, `/tags/interactions` | Listed; chemsex combos + STI guide | S | 200 |
| https://www.apoyopositivo.org | HIV/LGBTQ+ NGO (ES) | `/tags/interactions` | Chemsex harm reduction in context | S | 200 |
| https://www.przychodnia-stonewall.pl | LGBTQ+ clinic (PL) | `/tags/sti-guide` | Listed clinic; STI reference | S | 200 |
| https://www.irqo.org | Iranian queer org | `/tags/rights-by-country/trans` | Trans recognition + legal status, death-penalty data | M | 200 |

### University LGBTQ+ / study-abroad resource pages

These pages tell students to check Equaldex and ILGA before going abroad. Pitch: ILGA-sourced, nightly, all 250 territories, plus the trans page. Needs §3 items 1 and 2 first (they will look for methodology and a date).

| Target URL | Type | Pitch page | Angle | Effort | Checked |
|---|---|---|---|---|---|
| https://studyabroad.yale.edu/resources/lgbtq-students | Study abroad | `/tags/rights-by-country` | Country laws before you pick a program | M | 200 |
| https://study-abroad.uchicago.edu/lgbtq-students-abroad | Study abroad | `/tags/rights-by-country`, `/help` | Laws + crisis lines abroad | M | 200 |
| https://www.wcupa.edu/international/educationAbroad/lgbtqStudentsAbroad.aspx | Study abroad | `/tags/rights-by-country` | Replace/augment Equaldex link | M | 200 |
| https://www.marquette.edu/study-abroad/lgbtqia.php | Study abroad | `/tags/rights-by-country/trans` | Trans students: document change rules per country | M | 200 |
| https://www.njcu.edu/academics/study-abroad/lgbtqia-students-abroad | Study abroad | `/tags/rights-by-country` | Country laws | M | 200 |
| https://www.elon.edu/u/academics/global-education-center/belong/identity-based-resources/resources-for-lgbtqia-students/ | Study abroad | `/tags/rights-by-country`, `/help` | Identity-based resource list | M | 200 |
| https://www.nyu.edu/life/safety-health-wellness/campus-safety/safety-and-security/travel-safety/lgbtq--travel-guidance-and-resources.html | University travel safety | `/tags/rights-by-country`, `/help` | Staff + student travel | M | 202 |
| https://www.globalsupport.harvard.edu/travel-tools/lgbtq-travel-guidance-resources | University travel safety | `/tags/rights-by-country/trans` | Trans travel + legal status | M | 200 |
| https://guides.nyu.edu/genderandsex/internet-resources | Library guide | `/history`, `/tags/rights-by-country` | Data source for gender/sexuality research | S | 200 |
| https://libguides.bodleian.ox.ac.uk/lgbtq-history-resources/by-period | Library guide | `/history` | Era-organised timeline matches their by-period layout | M | 200 |
| https://libguides.pima.edu/lgbtq/history | Library guide | `/history` | Timeline resource | S | 200 |
| https://history.washington.edu/news/2025/10/15/resources-lgbtq-history-month | History dept | `/history` | Next History Month (Oct) resource list | S | 200 |

### Sexual-health and harm-reduction charities

| Target URL | Type | Pitch page | Angle | Effort | Checked |
|---|---|---|---|---|---|
| https://anypositivechange.org/chemsex-toolkit/ | Chemsex toolkit | `/tags/interactions` | Combination risks incl. GHB/GBL, poppers × PDE5 | S | 200 |
| https://www.lgbthero.org.uk/chemsex-directory | Chemsex directory (UK) | `/tags/interactions`, `/tags/sti-guide` | Add as an information resource | S | 200 |
| https://www.changegrowlive.org/chemsex-support-professionals | Drug charity (UK) | `/tags/interactions` | Professionals' resource list | M | 403 |
| https://www.wearewithyou.org.uk/ | Drug charity (UK) | `/tags/interactions` | Their chemsex booklet; we add an interactive combo grid | M | 200 |
| https://www.burnettfoundation.org.nz/articles/sex/chemsex/ | HIV/sexual health (NZ) | `/tags/interactions` | Chemsex article resource link | S | 200 |
| https://adf.org.au/insights/mixing-drugs-sex/ | Alcohol & Drug Foundation (AU) | `/tags/interactions` | Mixing drugs and sex article | M | 200 |
| https://www.hri.global/contents/2149 | Harm Reduction International | `/tags/interactions` | Community-led chemsex resources | L | 200 |
| https://psychedelictimes.com/use-tripsits-guide-drug-combinations-chart/ | Harm-reduction media | `/tags/interactions` | Built on TripSit data + queer-specific combos | M | 403 |
| https://sh24.org.uk/help-centre/when-should-I-test-for-STIs | Online testing (UK) | `/tags/sti-guide` | Window periods + prevention matrix | M | 200 |
| https://brightonsexualhealth.mixd.co.uk/home-sti-tests/when-should-i-test/ | NHS sexual health | `/tags/sti-guide` | Window periods | M | 200 |

### Crisis-line and community resource lists

| Target URL | Type | Pitch page | Angle | Effort | Checked |
|---|---|---|---|---|---|
| https://safeinourworld.org/news/global-lgbtq-support/ | Mental-health charity | `/help` | Global LGBTQ+ support list | S | 200 |
| https://transhelplines.github.io | Community helpline index | `/help`, `/tags/rights-by-country/trans` | Complementary directory (needs `/help/:country` fixed) | S | 200 |
| https://community.lalgbtcenter.org/tgi-enby-resource-index/crisis-support | LGBTQ+ centre resource index | `/help` | International crisis lines | S | 403 |
| https://smcgov.org/lgbtq/lgbtq-travel-resources | County LGBTQ commission | `/tags/rights-by-country`, `/help` | They ask for updated resources on the page | S | 200 |

### Travel and Pride

| Target URL | Type | Pitch page | Angle | Effort | Checked |
|---|---|---|---|---|---|
| https://iglta.org/LGBTQ-Travel-Safety | Travel trade association | `/tags/rights-by-country` | Their safety guide tells travellers to check laws; link the data | L | 200 |
| https://www.iglta.org/events/pride-calendar/ | Pride calendar | `/pride/:year` | Regional Pride pages | L | 200 |
| https://www.epoa.eu/about-europride/ | EuroPride organisers | `/pride/:year` (Europe region) | Year/region Pride listings | L | 200 |
| https://www.worldnomads.com/travel-safety/worldwide/lgbtq-travel-safety-tips | Travel insurer content | `/tags/rights-by-country`, `/help` | Country-by-country laws | M | 200 |
| https://www.afar.com/magazine/the-most-important-resources-for-lgbtq-travelers | Travel magazine | `/tags/rights-by-country/trans` | Resource roundup update | M | 200 |
| https://suitcasemag.com/articles/essential-resources-lgbtq-travellers/ | Travel magazine | `/tags/rights-by-country` | Resource roundup update | M | 200 |
| https://travelsofadam.com/gay-travel-resources/ | Gay travel blog | `/tags/rights-by-country`, `/pride/:year` | Resources page | S | 200 |
| https://thepointsguy.com/travel/lgbtqia-friendly-travel-resources | Travel media | `/tags/rights-by-country` | Resource roundup | M | 200 |
| https://fcmtravel.com/en/resources/insights/useful-resources-lgbtq-travel | Corporate travel | `/tags/rights-by-country`, `/help` | Duty-of-care resources | M | 403 |
| https://www.misterbandb.com/pages/lgbtq-gov-resource-guide | LGBTQ+ booking platform | `/tags/rights-by-country` | Resource guide | M | 403 |

### Wikipedia

Wikipedia links are `nofollow`. Its [conflict-of-interest guideline](https://en.wikipedia.org/wiki/Wikipedia:Conflict_of_interest) strongly discourages directly editing articles connected to your work and requires relevant affiliations to be disclosed. Treat these as **pages to make citable**, not pages to add promotional links to. If proposing a relevant correction, disclose the affiliation on the article's talk page and leave the decision to independent editors; do not switch accounts to conceal the relationship. Equaldex is cited on 168 article pages; our potential contribution is information beyond the underlying primary source, such as the separated trans recognition and TGEU view or the competitions dataset. Citation suitability remains an editorial decision.

| Target URL | Type | Pitch page | Angle | Effort | Checked |
|---|---|---|---|---|---|
| https://en.wikipedia.org/wiki/LGBT_rights_by_country_or_territory | Wikipedia (cites Equaldex) | `/tags/rights-by-country` | Not pitchable: editors will cite ILGA directly. Only relevant once the methodology page exists | L | 200 |
| https://en.wikipedia.org/wiki/List_of_LGBT_rights_articles_by_region | Wikipedia | `/tags/rights-by-country/trans` | Same | L | 200 |
| https://en.wikipedia.org/wiki/International_Mr._Leather | Wikipedia | `/competitions/leather-titles` | Titleholder table by year | L | 200 |
| https://en.wikipedia.org/wiki/Miss_Gay_America | Wikipedia | `/competitions/drag-pageants` | Winners by year; mirrors disagree on recent titleholders | L | 200 |
| https://en.wikipedia.org/wiki/List_of_RuPaul%27s_Drag_Race_contestants | Wikipedia | `/competitions/drag-series` | Placement data | L | 200 |

### Fan wikis and competition history

| Target URL | Type | Pitch page | Angle | Effort | Checked |
|---|---|---|---|---|---|
| https://rupaulsdragrace.fandom.com/wiki/RuPaul%27s_Drag_Race_Wiki | Fan wiki | `/competitions/drag-series` | Cross-franchise placement grids | L | 403 |
| https://fanlore.org/wiki/RuPaul%27s_Drag_Race | Fan-culture wiki | `/competitions/drag-series` | External links section | L | 403 |
| https://leatherhalloffame.com/inductees-list/38-international-mr-leather.html | Leather history | `/competitions/leather-titles` | IML titleholders by year | M | 200 |
| https://mkelgbthist.org/people/drag/title-holders-miss.htm | Local LGBTQ+ history | `/competitions/drag-pageants` | Pageant title history | S | 200 |
| https://www.out.com/drag/miss-continental-winners | Entertainment media | `/competitions/drag-pageants` | Every-winner list, link to full dataset | M | 200 |
| https://www.gaytimes.com/an-oral-history-of-four-decades-of-miss-continental-chicagos-legendary-drag-pageant/ | Entertainment media | `/competitions/drag-pageants` | Data companion to the oral history | M | 200 |

### Journalists and outlets covering rights

| Target URL | Type | Pitch page | Angle | Effort | Checked |
|---|---|---|---|---|---|
| https://76crimes.com/ | Rights journalism (anti-LGBTQ laws) | `/tags/rights-by-country` | Data source for criminalisation stories; methodology must exist first | M | 200 |
| https://xtramagazine.com/ | LGBTQ+ media (CA) | `/tags/rights-by-country/trans`, `/competitions` | Data for features | M | 200 |
| https://www.starobserver.com.au/ | LGBTQ+ media (AU) | `/competitions/leather-titles`, `/tags/rights-by-country` | Covers IML; rights data | M | 403 |

Count: 7 + 12 + 10 + 4 + 10 + 5 + 6 + 3 = **57**.

**Outreach order:** the S rows with a 200 first, and only after §3 items 1, 2 and 5 ship — a resource-list maintainer clicks once, and today the link-checker sees a title and a paragraph.

---

## 3. Quick-win code backlog

Listed only — none of this is built. Ordered by how many §2 pitches it unblocks. Note for scheduling: a separate session is building an in-site "Linked from" panel; none of these overlap it.

1. **Equality-score methodology page with cite-this.** One page (e.g. `/tags/rights-by-country/methodology`) stating the inputs, weights, the open-at-50 rule and its consequence, tier cutoffs from `EQUALITY_TIER_CUTOFFS` in `src/utils/equalityScore.ts`, refresh cadence, and known limits (already written on `/sources`). Add a "Cite this" block with APA/BibTeX/plain text and the data date. Unblocks every university, journalist and Wikipedia row. Effort: ~half a day.
2. **`Dataset` JSON-LD on rights and interactions.** `name`, `description`, `creator` (Queer Guide), `isBasedOn` (ILGA World Database; TripSit/eve&rave/FDA for interactions), `license`, `dateModified`, `distribution` (the item 5 download), `spatialCoverage`. Emitted from the crawler path so it appears in the HTML Google Dataset Search reads. Today those pages carry 0 JSON-LD blocks. Effort: ~2–3 hours.
3. **Fill `/press` with link-to-us + badge.** The route already exists as a 29-word CMS stub. Add: copy-paste HTML snippets for the rights page and `/help`, a small "Data: Queer Guide" badge (SVG, links back), logo files, boilerplate description, contact. Also a "Listed on Queer Guide" badge for orgs in `/organizations`. Effort: ~half a day (mostly content).
4. **Organization `sameAs` in `functions/_lib/jsonLd.ts`.** The fallback list is Instagram and LinkedIn only. Add every verified official profile (Wikidata item if one exists, Mastodon/Bluesky, GitHub) — and set `site_branding` `org_sameas` too, since the override wins. Strengthens entity association for unlinked brand mentions. Effort: ~30 minutes once the profile list is confirmed.
5. **CSV/JSON rights download with an attribution licence.** Export of the per-country table (country, ISO2, criminalisation, death-penalty risk, partnership, equality score, data date) under CC BY 4.0, with a required attribution line linking `/tags/rights-by-country`. ILGA's own terms must be checked first — we may only be able to licence our derived fields (the score) and link to ILGA for the rest. Effort: ~half a day plus the licence check.

Found while verifying, not asked for, worth one line each:
- `/help/:country` serves the generic site title/description and no `/help/*` URL is in a sitemap — the per-country page a centre would link to looks like the homepage.
- The rights, interactions, STI and organisations hubs render their data client-side; the crawler body is 37–150 words. A server-rendered summary table would make them link-checker-visible.

---

## 4. Measurement

### What already runs

`.github/workflows/search-console-report.yml` runs `scripts/search-console-report.mjs` every Monday 08:00 UTC and commits a Markdown report under `reports/`. It pulls Search Analytics for the lookback window: **top 25 queries, top 25 pages, and site totals** (clicks, impressions, CTR, position).

Track from it, per week:
- Clicks and impressions on the §1 pages (`/tags/rights-by-country*`, `/tags/interactions`, `/tags/sti-guide`, `/help`, `/history`, `/competitions*`, `/pride/*`). Links show up as rising impressions on those URLs before they show up anywhere else.
- Non-brand queries reaching those pages ("lgbt rights by country", "drug interaction chart", "sti window period").
- Average position for the rights page.

Limits:
- The report has no links data. **The Search Console API does not expose the Links report** — "Top linking sites" is UI-only. Check it by hand monthly in Search Console → Links and log the count of linking domains here.
- Top-25 cut-offs mean a newly cited page can be invisible in the report until it ranks. If outreach starts, add a fixed page filter for the §1 URLs to the script rather than relying on the top-25 list.
- Referral traffic from links (the real signal for nofollow sources like Wikipedia and Fandom) is in site analytics, not Search Console.

### Connectors

No authenticated Ahrefs or Similarweb data was available to this research. Connect an approved backlink data provider before measuring a backlink profile or referring domains; do not quote either until measured. Connection availability and permissions depend on the research environment.

### Log

| Date | Linking domains (GSC UI) | New links from §2 | Notes |
|---|---|---|---|
| 2026-11-18 | not measured | 0 | Baseline; no outreach |
