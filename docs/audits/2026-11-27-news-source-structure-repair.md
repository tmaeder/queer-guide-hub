# Live news source structure repair — 2026-11-27

The eight articles in the live sample were repaired using exact archived feed blocks and current publisher HTML/feed structure. The current article body remains the source of wording: source evidence authorizes only exact widget deletion and whitespace boundaries, never replacing or adding prose.

All eight titles and bylines are unchanged. Eight atomic pre-repair snapshots are saved privately under `2026.11.27.source-layout.1`; concurrent-edit comparison is enforced by `news_apply_text_cleanup`. No prose additions or substitutions were found. All eight repeat passes proposed zero further changes.

| Publisher | Paragraph blocks before → after | Removed material |
| --- | --- | --- |
| Agencia Presentes | 3 → 59 | No prose removed |
| Attitude | 4 → 25 | Opening image credit and publisher app/social panel |
| Fugues | 2 → 10 | French RSS attribution footer |
| GO Magazine | 3 → 30 | No prose removed |
| LGBTQ Nation | 5 → 36 | Related-story card, image credits and newsletter sign-off |
| Outsports | 3 → 12 | Two related-story cards and newsletter sign-off |
| Queerty | 1 → 33 | Related-story card, social media URLs and embed metadata; social quotations retained; newsletter sign-off removed |
| Guardian | 44 → 38 | Breaking-news email/app/podcast promotion from body and excerpt, plus trailing topic labels |

Prevention now shares the same deterministic policy between browser display and backend sanitization. Feed HTML is inspected before flattening; related cards require structural evidence, social quotes survive metadata removal, and source paragraph recovery uses exact unambiguous matches. Quality-model decisions retain source wording. Unresolved source widget residue blocks automatic publication. The bounded five-minute janitor can recover further archived-feed boundaries without source network requests, with snapshots and stale-edit protection.

The earlier backend cleanup was deployed but absent from main, allowing a later routine deployment to restore the old implementation. This release tracks the prevention code and its regression coverage.

Validation: 116 focused backend tests passed with type checking; 206 broader backend tests passed with `--no-check` (pre-existing Deno 2.8 test-mock type errors in image-check.test.ts). All five changed entrypoints type-check. 32 focused frontend tests passed; frontend lint passed; typecheck ratchet reports 593 existing errors versus baseline 596, no new errors. Live sample verification and final deployment evidence are appended after release.

## Initial production verification

Frontend release `91060fe8d7bf5a297b5735fbf521e0d61f3bbc57` deployed successfully to production Pages deployment `e33ac471`. All eight live sample URLs rendered HTTP 200 with the correct build metadata, unchanged titles and zero browser errors. Each visible body is an exact whitespace-normalized prefix of its repaired stored body, has rendered paragraph boundaries, and contains none of the identified publisher promotions, related labels, image-credit opener or raw Twitter media URLs. Desktop checks at 1440px and mobile checks at 390px on Agencia Presentes and Queerty had no horizontal overflow. Screenshots were inspected.

All 18 production smoke checks passed; all 680 live-manifest assets returned correct CORS content types, with zero poisoned assets or stale routes. The live janitor dry run returned HTTP 200. Its next scheduled pass scanned 60 rows, updated 10, and flagged five for review. The existing five-minute schedule remains active. The RSS deployment preserves the already-live podcast transcript import metadata from the concurrent podcast release.

A CI compatibility regression was corrected: source-recovery page identity matching now ignores only the known publisher suffix for comparison, without modifying stored headlines. Unknown suffixes and genuine headline subtitles remain significant. Local follow-up tests also preserve quoted newsletter links as reporting.


## Full-body footer follow-up

Six additional snapshotted updates (`2026.11.27.source-layout.2`) removed publisher sign-offs/panels and trailing topic labels beyond the bounded visible excerpts. No article prose was added or rewritten. Descriptive photo captions, quoted newsletter links, relevant campaign donation links, and closing reporting paragraphs are retained. Source metadata containing HTML is inspected too; taxonomy labels must match a multi-item trailing UI suffix before removal.

Source-worker markdown now uses the shared cleaner, preserving literal underscores and comparison characters. The archive janitor excludes podcast show notes, caps batches at 20, and budgets both article and saved-feed text. The archive sweep uses persistent per-range cursors and bounded retries for worker CPU exhaustion. Local full edge coverage reached 2,501 passing tests with one unrelated Deno 2.8 incompatibility in country-image-health.test.ts (assignment to the getter-only Deno.serve); the required CI suite is the final release gate.


## Completed archive pass and repeat check

All eight UUID ranges completed: 46,881 non-podcast article records scanned, 8,733 guarded updates reported, 3,489 records requiring text-hygiene review, zero stale-edit skips. Snapshot audit reports 7,519 distinct article records with actual text changes (7,514 bodies, 17 excerpts, zero titles); response totals include review-only updates and differ from snapshot totals because scheduled runs and retries also wrote snapshots. A stratified repeat dry run over 1,344 records proposed zero further changes. All eight sample fields still exactly match the final repaired values.

The existing source-recovery mode now keeps its input intact until page-identity and material-gain checks authorize a replacement. Known publisher suffix matching uses the canonical staged source-name fallbacks. This preserves the database RPC's no-gain contract instead of submitting a formatting-only mutation that the RPC must reject.
