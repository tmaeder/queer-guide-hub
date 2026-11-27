# Live news source structure repair — 2026-11-27

The eight articles in the live sample were repaired using exact archived feed blocks and current publisher HTML/feed structure. The current article body remains the source of wording: source evidence authorizes only exact widget deletion and whitespace boundaries, never replacing or adding prose.

All eight titles and bylines are unchanged. Eight atomic pre-repair snapshots are saved privately under `2026.11.27.source-layout.1`; concurrent-edit comparison is enforced by `news_apply_text_cleanup`. No prose additions or substitutions were found. All eight repeat passes proposed zero further changes.

| Publisher | Paragraph blocks before → after | Removed material |
| --- | --- | --- |
| Agencia Presentes | 3 → 59 | No prose removed |
| Attitude | 4 → 35 | Opening image credit |
| Fugues | 2 → 11 | No prose removed |
| GO Magazine | 3 → 30 | No prose removed |
| LGBTQ Nation | 5 → 37 | Related-story card and image credits |
| Outsports | 3 → 13 | Two related-story cards |
| Queerty | 1 → 34 | Related-story card, social media URLs and embed metadata; social quotations retained |
| Guardian | 44 → 43 | Breaking-news email/app/podcast promotion from body and excerpt |

Prevention now shares the same deterministic policy between browser display and backend sanitization. Feed HTML is inspected before flattening; related cards require structural evidence, social quotes survive metadata removal, and source paragraph recovery uses exact unambiguous matches. Quality-model decisions retain source wording. Unresolved source widget residue blocks automatic publication. The bounded five-minute janitor can recover further archived-feed boundaries without source network requests, with snapshots and stale-edit protection.

The earlier backend cleanup was deployed but absent from main, allowing a later routine deployment to restore the old implementation. This release tracks the prevention code and its regression coverage.

Validation: 116 focused backend tests passed with type checking; 206 broader backend tests passed with `--no-check` (pre-existing Deno 2.8 test-mock type errors in image-check.test.ts). All five changed entrypoints type-check. 32 focused frontend tests passed; frontend lint passed; typecheck ratchet reports 593 existing errors versus baseline 596, no new errors. Live sample verification and final deployment evidence are appended after release.

## Initial production verification

Frontend release `91060fe8d7bf5a297b5735fbf521e0d61f3bbc57` deployed successfully to production Pages deployment `e33ac471`. All eight live sample URLs rendered HTTP 200 with the correct build metadata, unchanged titles and zero browser errors. Each visible body is an exact whitespace-normalized prefix of its repaired stored body, has rendered paragraph boundaries, and contains none of the identified publisher promotions, related labels, image-credit opener or raw Twitter media URLs. Desktop checks at 1440px and mobile checks at 390px on Agencia Presentes and Queerty had no horizontal overflow. Screenshots were inspected.

All 18 production smoke checks passed; all 680 live-manifest assets returned correct CORS content types, with zero poisoned assets or stale routes. The live janitor dry run returned HTTP 200. Its next scheduled pass scanned 60 rows, updated 10, and flagged five for review. The existing five-minute schedule remains active. The RSS deployment preserves the already-live podcast transcript import metadata from the concurrent podcast release.

A CI compatibility regression was corrected: source-recovery page identity matching now ignores only the known publisher suffix for comparison, without modifying stored headlines. Unknown suffixes and genuine headline subtitles remain significant. Local follow-up tests also preserve quoted newsletter links as reporting.
