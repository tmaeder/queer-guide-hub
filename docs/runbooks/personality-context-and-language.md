# Personality context and language

Implemented locally on 2026-11-25. The application and database migration have not been deployed by this task. No production personality data was changed.

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

The 2026-11-25 audit scanned 2,223 public, nonduplicate profiles: 2,178 lack an explanation, 1,672 have an absent/unclear/no-known connection category, 16 biographies and 8 descriptions have possible mixed-language sentences. Another 4 descriptions and 2 biographies were flagged as non-English base content. Counts are review candidates, not proven defects or evidence that a person has no connection.

For each repair, inspect the actual source for that exact person. Write a concise English description explaining the documented connection, and a fuller `lgbti_details` explanation distinguishing identity, activism, allyship and cultural contributions. Keep a `personality_sources` record with the supporting URL and a verified field-specific `personality_claim_sources` record. Do not bulk-approve pending or rejected claims. Translate description, bio, profession and connection explanation through the CMS sidecar and publish reviewed translations. Enrichment instructions now require consistent English and explicit evidence; generated output remains a proposal.

## Validation and release

The focused frontend runs passed 53 tests across 15 files. The isolated SQL contract passed all assertions. ESLint, locale duplicate-key checks, locale source/public sync and the design detector passed. The repository typecheck had 755 existing errors and no new errors at the pre-release check.

Frontend tests cover locale switching, untranslated fallback badges, verified connection snippets, source URL safety, batched loading, dates and existing browsing/profile behavior. Shared cookie tests preserve consent behavior while checking translated copy. Locale duplicate-key and source/public sync checks must pass.

The SQL contract can be tested without production access using an external PGlite installation:

```sh
node scripts/tests/personality-public-editorial.mjs /absolute/path/to/pglite/dist/index.js
```

It creates an isolated schema, applies the actual migration and tests public/draft/duplicate visibility, pending/rejected claims, explanation-specific evidence, draft translations, source URL safety, bounded IDs, private-table access and function grants.

Apply `supabase/migrations/20261125180346_personality_public_editorial.sql` through the normal migration release workflow before deploying the frontend. Verify the RPC as an anonymous reader after release. If the supplemental endpoint is unavailable, pages retain source biographies and summaries without exposing raw connection claims.

Local browser verification used the public catalogue with a fixture for the new RPC (which is not deployed). German desktop/mobile browsing and a profile rendered without page errors; the mobile page had no horizontal overflow. The fixture used a previously verified connection and its source, and blocked the view-count mutation. This is local UI verification, not a production release check.
