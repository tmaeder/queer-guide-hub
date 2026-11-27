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
