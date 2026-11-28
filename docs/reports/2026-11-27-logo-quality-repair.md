# Logo repair and prevention — 27 November 2026

The repair and enrichment mechanism are deployed to production. After the second official-source review, production has **6,418 repaired logo jobs**. The sections below retain the earlier checkpoints; the latest review results appear at the end. All known denied marks were absent in the original audit’s final database check.

## Results

| Entity | Audited | Verified replacements | Already verified | Needs review | Merged aliases |
| --- | ---: | ---: | ---: | ---: | ---: |
| Venues | 11,303 | 850 | 0 | 10,413 | 40 |
| Organizations | 5,630 | 376 | 0 | 5,254 | 0 |
| Events | 220 | 4 | 0 | 216 | 0 |
| Marketplace brands | 516 | 39 | 10 | 467 | 0 |
| **Total** | **17,669** | **1,269** | **10** | **16,350** | **40** |

412 confirmed incorrect logo assignments were removed, including 38 on aliases subsequently identified as merged. This removal count overlaps the audit outcomes above. Examples include Google, HelloAsso, Wikipedia, WordPress, Jimdo, FC2, DISH, stock house/cube/pencil/layout icons, blank images, and shared decorative rainbow flags. Legitimate customer assets hosted on Wix, WordPress, Shopify, and other CDNs remain eligible.

At this initial checkpoint, 16,350 open cases were visible in the [general Review queue](https://queer.guide/admin/governance?mode=triage&queue=general-review). They include low-resolution originals, uncertain identities or replacements, and unavailable qualified sources. Their current image, available candidate, website, source evidence, dimensions, and reason are retained. Existing uncertain images have not been replaced automatically. Known wrong marks were removed. Obsolete cases on merged aliases were closed.

## Enrichment and prevention

- Prefer an entity's own declared JSON-LD logo or corroborated header logo. A listing-page title alone cannot establish the identity of its publisher's masthead.
- Unwrap Google Translate website links; distinguish platform identities from customer assets on shared hosting.
- Inspect actual raster dimensions, reject tiny/blank/invalid images, check contrast, validate static SVGs, and prefer larger responsive originals from `srcset`. Request provider candidates at 512 pixels, but keep provider-only and icon-only identities in review. Enlarging a thumbnail is not treated as restored detail.
- Hold unchecked automated logo imports before publication. Known denied marks are blocked even on manual writes. Explicit administrator edits remain possible.
- Use one shared checking path for venues, events, organizations, and brands, with content-addressed mirrors and provenance.
- Recheck changes to names, websites, and logo URLs. Verified assets become eligible for another check after 90 days. Application cron drains bounded batches every five minutes; expired and exhausted leases cannot strand records indefinitely.
- Apply repairs with lease and current-value checks. Intervening edits, deleted records, and merged aliases supersede stale work.

## Verification and rollback

55 unit checks passed: 14 logo-quality scenarios plus 41 existing platform, site-icon, and PNG tests. Both edge entrypoints passed Deno type checking. Live SQL integration checks passed inside rolled-back transactions, covering access restrictions, import staging, denied marks, stale leases, exhausted leases, intervening edits, and merged aliases. An unauthenticated repair request returned HTTP 401. Production enrichment returned HTTP 200 after the final deployment.

Previous URLs and repair evidence are retained in `public.logo_quality_history`; worklist snapshots and candidate provenance are in `public.logo_quality_jobs`. Existing content revisions provide another record of entity changes. Any rollback should first compare the current URL with that history row's replacement URL so a later editor change is preserved.

Source is isolated on `fix/logo-quality-repair-20261127`. Parser-only `broken-image` hook findings were false positives; the narrow file-scoped ignore is recorded in `.impeccable/config.json`. No actual UI image defect was suppressed or left standing.

## Official-source review of the 16,350 remaining flags

The follow-up checked every case in the fixed 16,350-record manifest. This was an automated first-party source pass followed by native OCR, visual inspection of 1,467 unique candidate images, identity/context checks, and targeted source research. It was not 16,350 individual manual visual inspections.

The pass produced **3,728 additional active repairs** from verified official assets. Production now has **4,998 repaired logo jobs**, including the earlier repair pass and routine worker progress. **12,566 cases from the original flagged cohort remain open**; 56 other cohort cases are no longer open after intervening edits, alias/supersession handling or other resolution. The latter are not counted as verified repairs.

Each unresolved case retains source attempts, page identity, candidate URLs and a reason in the existing logo-quality review queue. The accompanying public-business evidence export is [remaining-manual-review.json](/Users/tobiasmaeder/queer-guide-hub/logo-review-official-20261127/remaining-manual-review.json). A failed request or missing declaration is an unresolved verification outcome, not proof that no logo exists. Current sources often supply only a publisher/parent mark, an unreadable mark, or an insufficient native image. Other domains are inaccessible, redirect to unrelated sites, or have been repurposed. Unverified replacements were held; 36 early replacements were reopened and restored after identity auditing. The earlier rejected San Diego Center flyer was subsequently replaced with its verified official media-kit logo.

The review found profile problems beyond logos: some street addresses, company names and descriptions identify a real business while the stored city or category describes another place. These conflicts are retained as evidence. A wrong locality alone does not establish a different corporate brand; uncertain ownership remains flagged.

### Enrichment and prevention

- Official Organization metadata and masthead evidence establish identity before an asset is eligible. Listing titles, sponsors, CMS/social marks and body images do not establish logo ownership.
- Native Wix, Shopify, WordPress and Squarespace originals are preferred. Requested CDN enlargement cannot satisfy the native-resolution requirement. Shared-cache reuse includes the verified locality; explicit namesake locality conflicts require review.
- Review normalization preserves official artwork, rejects tiny/blank/unsafe sources, and chooses a readable fixed background for light or mixed foregrounds. A narrowly validated full-frame raster SVG wrapper can expose its native pixels without enlarging them.
- The resumable review CLI uses local macOS Vision OCR and optional bounded TypeSafe text judgments. Experimental image judgments never independently authorize publication. Typed automatic approvals require ownership and logo probabilities of at least 0.97, with conflicting event editions held.
- Publication re-fetches the official source, checks byte hashes or exact decoded-pixel equivalence, mirrors content-addressed PNGs, and compares name, website and previous URL snapshots. A closed human case wins over stale batch evidence. Native OCR stalls are bounded and recoverable.
- Imports continue through the existing database write guard and bounded scheduled worker. Verified assets refresh after 90 days; researched official websites survive refresh when a profile lacks a website.

Primary-source examples: [San Diego Center media kit](https://thecentersd.org/about/media/), [anyway Basel](https://www.anyway-basel.ch/), [Back to Black's Amsterdam location](https://backtoblackcoffee.nl/en/locations/coffee-bar-amsterdam-center/), and [Balans founder history](https://www.balans.co.uk/blog/celebrating-30-years-of-balans-with-founder-david-taylor/). Firecrawl had no credits available, so review continued using direct official HTTP retrieval and web search.

### Validation and release

29 focused regression tests, 41 existing platform/image tests, and 42 enrichment integration contracts passed. The integration contracts now follow the shared quality worker rather than the retired provider-only handler. All three edge entrypoints passed Deno checking; targeted ESLint checks passed. Rolled-back production SQL checks verified restricted evidence/session access, the US$1 lifetime cap, stale-finding rejection, and preservation of closed human decisions. Every remaining review/quarantine job has an open review case. A sample of 20 newly published CDN assets returned HTTP 200 with the expected decoded dimensions.

TypeSafe charged **US$0.29117907** against the explicitly approved US$1 lifetime account. Public business evidence and exact requests/responses are retained locally in the private run directory; no API key was exported. The temporary session and verification account are disabled after completion.

The deployed functions at completion are `enrich-logos` v348, `logo-quality-repair` v12 and `logo-review-ops` v5. Source is in [PR #5865](https://github.com/tmaeder/queer-guide-hub/pull/5865), with automatic merge conditional on required checks. The branch reconciles applied logo migration versions and includes the existing recovery of an already-applied knowledge migration needed by repository-wide gates. It introduces no new knowledge feature. Parser-only hook exceptions are narrowly scoped to the two external-HTML parser files; no rendered UI defect was suppressed.

For another authorized review, compile `scripts/data-quality/logo-review-ocr.swift` to a private run directory's `logo-ocr`, export a stable manifest before writing, and supply a short-lived hashed review session in that directory's `session.secret`. Run `LOGO_REVIEW_DIR=/absolute/private/run node --import tsx scripts/data-quality/review-official-logos.mjs discover`, then review uncertain candidates before `publish`. Semantic calls require a separately approved budget and enabled lifetime account. Do not commit session secrets or public-source payload dumps to Git. The one-off batch tool supplements the production worker; it is not an always-on paid model integration.


## Second official-source review of the remaining 12,566 cases

This pass added **1,420 active repairs**, bringing production to **6,418 repaired jobs**. Another **30 existing SVG replacements** were corrected to preserve their intrinsic official colors; these are improvements to already repaired cases and are not counted as new repairs. The 12,566-case cohort now has **11,115 unresolved cases**. A further 31 cases were superseded by intervening edits or alias handling and are not counted as repairs. One newly published Pipeworks assignment was restored and reopened after the official site’s Glasgow/Leeds addresses conflicted with the target’s Brighton address; the active-repair count excludes it.

Review covered 4,396 official homepages, a further context pass over 4,360 homepage results, and 868 changed-domain destinations. The manual image review included 216 initial alternative groups, 144 family groups, 688 higher-confidence groups, 455 further groups, and 443 previously unseen redirect artwork groups. These are candidate groups with overlap across records, not unique businesses or individual manual inspections of all 12,566 cases. Existing first-pass evidence was retained for cases without another qualified source.

The remaining cases retain attempted official URLs, candidate sources, native dimensions, identity evidence and specific failure reasons in the existing review queue. The latest evidence export is [remaining-manual-review.json](/Users/tobiasmaeder/queer-guide-hub/logo-review-official-20261127-pass2/remaining-manual-review.json). Unreachable sites, missing or unreadable declarations, platform/parent assets, repurposed domains, unresolved branch identity and insufficient native resolution remain unverified. A failed request does not establish that a logo does not exist. Every open review/quarantine job has an open review case; closed human decisions were not revived.

Additional safeguards now bind native-size proofs to the exact reviewed source, check event editions against the recorded event date, re-fetch declared inline SVGs at publication, and preserve presentation attributes rather than overwrite them with default computed paint. Author-supplied colors are distinguished from a browser’s default blue link color. Explicitly reviewed backgrounds survive publication. Supplementary manual identity evidence is bound to the exact entity, official page and source URL; it cannot authorize changed artwork. Final researched approvals take precedence over earlier semantic candidates.

The periodic refresh now retains a verified researched official URL while the profile’s website is unchanged, including profiles whose old URL is a publisher or obsolete domain. Editing that website invalidates the retained proof. The applied migration is `20261127214608_logo_quality_keep_verified_redirect_source.sql`; its version is committed in the branch.

Official relationship evidence resolved renames and shared brands, including [Queer Power Alliance’s organizational history](https://queerpoweralliance.org/history-impact), [Vivent Health’s Austin announcement](https://viventhealth.org/news/aids-services-of-austin-asa-is-now-vivent-health/), [La Scène Montparnasse’s history](https://scenemontparnasse.com/notre-histoire/), [HEART’s Libertyville branch](https://heartautocare.com/locations/libertyville/), [Prisma Community Care’s history](https://prismacare.org/about/), [Robert Lee YMCA’s branch page](https://www.ymcabc.ca/locations/robert-lee-ymca), and [Soho House New York’s sixth-floor bar](https://www.sohohouse.com/ca/houses/soho-house-new-york/food-and-drink). Official press and property sources also supplied Christmas Avenue, Queer Ink, Axel TWO Barcelona and House of Riegillio assets. A redirect by itself was never ownership evidence.

Validation: **35 focused tests and 42 integration contracts passed**, as did targeted ESLint, formatting and diff checks. Live database assertions verified source retention and invalidation after a website change; their fixture mutations were rolled back. All 24 sampled newly published mirrors returned HTTP 200 and decoded successfully. All 30 SVG correction cases completed publication.

The lifetime TypeSafe account charged **US$0.64463091** across both official-source passes, within the authorized US$1 total, with no outstanding reservations. Temporary access and paid verification are disabled after completion; raw public-source evidence and exact model requests remain in the private run directory. The PR remains subject to required checks; publication counts describe live data repair and do not imply the PR has merged.

## Third official-source review — 28 November 2026

This pass added **159 verified repairs**, bringing production to **6,577 repaired jobs**. The fixed 11,115-case cohort now has **10,947 unresolved cases**; another nine were superseded and are not counted as repairs. Review covered all **730 previously unviewed candidate groups**, associated with 1,519 cohort cases. This was a review of the remaining candidate evidence, not 11,115 new individual manual inspections. Prior source attempts remain available for the rest of the cohort.

Official service and location pages resolved shared hospital, practice and business identities. Examples include [CHU Nantes CeGIDD](https://www.chu-nantes.fr/centre-gratuit-d-information-de-depistage-et-de-diagnostic-des-infections-sexuellement-transmissibles-du-vih-et-des-hepatites-cegidd), [Hôpitaux du Pays du Mont-Blanc CeGIDD locations](https://www.hpmb.fr/poles/prevention-education/cegidd/), [Kasa’s Long Beach property](https://kasa.com/properties/city-center-hotel-by-kasa-long-beach), and [Monocle’s own shops and cafés](https://monocle.com/monocle-shops-and-cafes/). Provider marks were accepted only with evidence connecting the specific service or location to that provider. Wrong-city namesakes, neighboring-hospital footer artwork, unrelated parent brands, CMS/social marks and unverifiable native resolution were held.

Navigation and cookie notices obscured some initial identity excerpts. A second context check used actual main/article content and public business addresses; model scores alone did not authorize replacement. All replacements still passed fresh source, native-quality, event-edition and current-record checks. Changed inline artwork was re-fetched and visually reviewed before publication. Existing edits and closed human decisions continued to take precedence.

The CLI now accepts an empty discovery file when a run consists entirely of manually reviewed approvals. A further SVG regression fix resolves inherited author text color past a browser’s default link blue. The affected Ten Bells artwork was visually checked again and published with its black foreground. **36 focused tests**, targeted ESLint and diff checks passed. **24 newly published mirrors** returned HTTP 200 and decoded successfully; every open review/quarantine job has an open review case.

Total lifetime TypeSafe charges are **US$0.726848682**, below the authorized US$1 total, with no outstanding reservations. Paid verification and the temporary session are disabled; both the retired token and an anonymous request returned HTTP 401, and the local token file was deleted. Exact requests, public-source evidence and the updated unresolved-case export remain in the private run directory, [logo-review-official-20261128-pass3](/Users/tobiasmaeder/queer-guide-hub/logo-review-official-20261128-pass3/remaining-manual-review.json). PR #5865 has merged; the small CLI/parser fixes and this report are a separate follow-up.
