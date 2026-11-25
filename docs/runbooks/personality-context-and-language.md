# Personality context and language

Release prepared on 2026-11-25. The public editorial RPC migration and enrichment function version 281 are deployed. The frontend is released through PR #5757 and the normal Pages workflow. A source-reviewed production batch repaired 22 profiles, including all 21 featured profiles, and published 44 German translations of their summaries and explanations.

## Public reading contract

`personality_public_editorial(uuid[], text)` reads at most 100 requested IDs. It excludes non-public records and duplicates, returns only verified field-specific claims backed by a source URL belonging to the same personality, and overlays only published translations. The private claim-review table remains private. Its narrow SECURITY DEFINER projection is intentional and explicitly granted to the public website roles.

Connection categories do not verify explanation text: `lgbti_details` needs its own verified `personality_claim_sources` row. Pending/rejected claims, `none_known` and `unclear` never become public membership assertions. A verified scholarly explanation can appear without asserting the subject's identity.

Cards prefer verified connection context, with source links on the profile. Published prose translations come from `content_translations`; existing `description_i18n` values remain supported. Missing translations retain labelled source prose and a `lang` attribute. English is the canonical base; language detection marks legacy foreign-language prose and is not a source-verification system.

Directory/profile labels, dates, common profession labels, era selectors, cookie UI, sign-in text and alphabet navigation use locale resources. Canonical filter values and proper names remain unchanged. Translations of source content still require editorial work; this release does not pretend the catalogue is fully translated.

## Catalogue repair

Read-only public audit:

```sh
npx tsx scripts/data-quality/audit-personality-editorial.ts --out /absolute/path/report.json
```

Use `--rows /absolute/path/export.json` to audit offline. The audit never writes to the database or infers identity. Language flags are heuristic suggestions for an editor.

The post-repair 2026-11-25 audit scanned 2,223 public, nonduplicate profiles: 2,156 still lack an explanation and 1,665 need connection-category review. All 21 featured profiles now have verified explanations. The refined prose detector found no remaining mixed-language or mixed-script candidates. Its earlier flags mostly reflected foreign names or titles in English prose; Willy Wilkinson's actual mixed-script biography was replaced from the official source. These heuristic results do not establish that every remaining text is correct or translated.

For each repair, inspect the actual source for that exact person. Write a concise English description explaining the documented connection, and a fuller `lgbti_details` explanation distinguishing identity, activism, allyship and cultural contributions. Keep a `personality_sources` record with the supporting URL and a verified field-specific `personality_claim_sources` record. Do not bulk-approve pending or rejected claims. Translate description, bio, profession and connection explanation through the CMS sidecar and publish reviewed translations. Enrichment instructions now require consistent English and explicit evidence; generated output remains a proposal.

## Validation and release

The isolated SQL contract and focused frontend checks passed. Clean CI builds, typechecks, unit tests, locale checks and accessibility checks validate the release. The local release worktree uses a dependency overlay because the workstation lacks disk space for the current lockfile; local full-build results are therefore not the release gate.

Frontend tests cover locale switching, untranslated fallback badges, verified connection snippets, source URL safety, batched loading, dates and existing browsing/profile behavior. Shared cookie tests preserve consent behavior while checking translated copy. Locale duplicate-key and source/public sync checks must pass.

The SQL contract can be tested without production access using an external PGlite installation:

```sh
node scripts/tests/personality-public-editorial.mjs /absolute/path/to/pglite/dist/index.js
```

It creates an isolated schema, applies the actual migration and tests public/draft/duplicate visibility, pending/rejected claims, explanation-specific evidence, draft translations, source URL safety, bounded IDs, private-table access and function grants.

Migration `supabase/migrations/20261125180346_personality_public_editorial.sql` is applied in production. Anonymous RPC requests returned the verified explanations and published German translations after the repair batch. If the supplemental endpoint is unavailable, pages retain source biographies and summaries without exposing raw connection claims.


Production release verification must check the deployed build ID, actual anonymous editorial responses, English/German profile rendering and mobile layout. Earlier local fixture checks are not production evidence.
