# Reviewed personality batches

Use one manifest, one atomic data publication and one merged deployment per batch. Do not publish individual rows during research. Generated proposals and search excerpts are not verification.

## Prepare the review queue

Run the read-only audit, then snapshot up to 500 pending public profiles:

```sh
npx tsx scripts/data-quality/audit-personality-editorial.ts --out /absolute/audit.json
node --import tsx scripts/data-quality/personality-editorial-batch.mjs queue /absolute/audit.json /absolute/new-batch.json 500
```

The queue uses anonymous reads, prioritises featured/high-visibility profiles and excludes adult-marked profiles. Research hints are not evidence. Translation snapshots remain explicitly unreviewed because anonymous reads cannot establish whether a private draft exists. Obtain the authoritative translation snapshot before marking the batch reviewed.

The default and maximum queue size is 500. Group research by established institutional collections when they cover several candidates; use exact-name matches only to stage candidates, then cross-check occupation and birth information before reviewing the individual biography and the specific fact being published. Same-name collisions and unresolved identity conflicts must be excluded before freezing the manifest. Keep clear existing biographies and translate only affected fields. Verification reads every record in chunks of at most 100 IDs to respect the public editorial RPC limit; the publication and deployment still cover the complete batch. Use a representative live UI sample covering both languages, connection types and the longest texts, expanding it when a failure warrants it.

For each candidate, match the exact person and read the source. Record `url`, `title`, `checked_at`, `identity_match: "exact"`, a concise `basis`, and the exact changed `fields` supported. Use multiple sources when needed. Explicit public identity, activism, allyship and cultural work are distinct bases. Never infer personal identity from an occupation, a fictional role or a same-name match. Record unresolved candidates separately and leave their public values unchanged.

Fill the English `description` (120–240 characters), `lgbti_details`, and any other approved fields. Add reviewed translations. Each touched field needs its original value; `metadata_before` supplies original provenance and the connection-source value. For each translated field, `expected_translations[language][field]` is either `null` (authoritatively absent) or `{ "value": "...", "status": "...", "machine_source": null }` with the actual three values. Source review is an editorial decision: automated checks cannot prove that the evidence supports a claim.

Set record review status, connection basis and reviewed translation languages only after inspection. Set the batch reviewer and dated review. Commit reviewed manifests under `docs/editorial/personality-batches/<batch-id>.json`. Use the same ID and artifact directory throughout release.

New queues use `editorial_policy_version: 2`. Keep `expected_identity` (name, slug, Wikidata ID and birth date) equal to the authoritative reviewed person. For every existing translation, also snapshot `source_hash`, `source_lang`, `editorial_reviewed_by`, `editorial_reviewed_at`, `editorial_reviewed_value` and `editorial_reviewed_identity`. Obtain these private fields through the authorised database operator. Compiler version 3 locks and checks identity, binds claims to the exact reviewed text and source URL, and stamps translation review metadata. Previously frozen compiler version 2 artifacts remain byte-identical historical records.

Imports and automated translations are draft proposals. Service-role automation cannot verify personality evidence or publish translations. An authorised editorial database transaction must supply the exact identity, reviewed field value, source URL, reviewer, review date and English canonical language. Sources must include an exact identity match, title and specific reviewed basis. A translated work title may remain in its original language only with an explicit reviewed exception naming the title and enough surrounding native prose to assess the language.

## Freeze and validate once

```sh
node --import tsx scripts/data-quality/personality-editorial-batch.mjs validate docs/editorial/personality-batches/<batch-id>.json
node --import tsx scripts/data-quality/personality-editorial-batch.mjs prepare docs/editorial/personality-batches/<batch-id>.json /absolute/shared-artifacts
PGLITE_MODULE=/absolute/pglite/dist/index.js node --import tsx --test scripts/data-quality/personality-editorial-batch.contract.mjs
```

Preparation creates `<artifact-directory>/<batch-id>/prepared.json`, `review.json`, `apply.sql` and `rollback.sql`. The seal binds the manifest and both SQL files. Preparation rejects edits to a frozen batch; use a new batch ID after revising reviewed content. Keep originals and the prepared artifacts outside the public application bundle.

CI runs the isolated PostgreSQL contract and validates every committed manifest. Before the single merge, check the complete affected public flow: summary and biography language, evidence links, dates, share/report controls, desktop and mobile overflow. Reuse the existing public UI when a batch changes only data; avoid unrelated UI edits in a content batch.

## Publish the frozen batch

After local preflight and required CI pass, apply the complete `apply.sql` through the authorised database operator once. It locks the batch, rejects replay and changed fields/provenance/translations, writes new field-specific verified sources, and publishes only the reviewed translations. It does not approve existing pending/rejected claims or change unrelated profile fields. A stale row aborts the entire transaction.

```sh
node --import tsx scripts/data-quality/personality-editorial-batch.mjs verify docs/editorial/personality-batches/<batch-id>.json /absolute/shared-artifacts
```

Verification uses anonymous website credentials and checks all changed values, public explanations, categories, source URLs and published translations for every record. If it fails, stop before merge and investigate. Use the prepared rollback only after reviewing later edits; rollback protects later field changes, translations and reuse of the batch's sources.

Canonical or identity changes invalidate old evidence and draft stale translations. Returning to an older value does not restore its approval. Compiler version 3 rollback may restore only approvals invalidated by that batch's own publication transaction, still matching the restored person, text and source. It cannot undo a later reviewer revocation. If the original public state lacked the evidence now required by the publication guard, draft the affected profile before undoing the batch; never restore unsupported public content to make rollback pass.

Merge the one reviewed PR. Follow its Pages deployment to success, then verify the real site, not only the generated data. Record the release once:

```sh
node --import tsx scripts/data-quality/personality-editorial-batch.mjs receipt docs/editorial/personality-batches/<batch-id>.json /absolute/shared-artifacts <deployment-run-id>
```

The receipt checks the successful Pages run, the manifest contained in its commit, the frozen/public verification digest, and the live `build-id.txt`. It refuses a conflicting second deployment receipt for that batch. Preserve `release.json` with the prepared and verified artifacts. These are auditable process controls, not a global lock against a separate operator bypassing the workflow.

Refresh the audit once after the batch and carry unresolved IDs forward. Group further fixes into a new batch; do not add per-profile follow-up deployments to a completed batch.

## Prevent regressions

The editorial workflow runs on pull requests and every 12 hours. It audits the anonymous public projection and all eleven published languages, retaining its report for 14 days. `docs/editorial/personality-editorial-baseline.json` temporarily records exact fingerprints of existing defects. New profiles, changed defective values or new issues fail the audit. Baseline changes may only remove entries or issue codes; they cannot add exceptions or change a grandfathered fingerprint. Remove repaired entries after each published batch, and finish with an empty baseline.

```sh
node --import tsx scripts/data-quality/audit-personality-editorial.ts --baseline docs/editorial/personality-editorial-baseline.json --out /absolute/editorial-audit.json
node --import tsx scripts/data-quality/check-personality-editorial-baseline.mjs
```

Database guards reject incomplete new public profiles, stale or missing field evidence and unreviewed translations at the write boundary. These controls check review completeness and consistency; the reviewer must still read the source and establish that it supports the specific fact.

Review every visible biography alongside the new explanation. Preserving an existing biography is not evidence that it is accurate: check the person's identity, career, nationality, dates and any claims about sexual orientation or gender. Replace generic “notable figure in the LGBTQ community” biographies with specific sourced facts. A performance role or festival appearance supports a cultural connection, not an inference about personal identity. The batch validator and database reject newly published or changed biographies containing this known template, even when approval metadata is present.

Read private translation timestamps as JSON values, for example `to_jsonb(editorial_reviewed_at) #>> '{}' AS editorial_reviewed_at`, rather than PostgreSQL display text. The frozen snapshot must match the database's canonical JSON representation, including its time zone and microseconds. Run the actual manifest contract and a rollback-only production preflight before publication; never normalize a stale snapshot merely to make it pass.

### Correcting a mistaken identity within a batch

An optional `identity_correction` on a policy-2 record selects compiler 4. Existing
compiler-2 and compiler-3 manifests retain their exact SQL bytes and hashes.
Use this only after reading evidence for the intended person, including names,
career and date conflicts; never select a candidate merely because its name matches.
Read existing editorial provenance and newer first-person statements before changing
a display name: an older directory or venue biography must not override a later
publicly announced name.

Record `before` snapshots for the original name, slug, QID, birth date, every
changed text field, provenance, connection source and each metadata field being
corrected. Record `after` only for the supported name, QID and dates, or to clear
unverified optional metadata. Reject an unrelated portrait with a null image URL
and `image_status: rejected`. Preserve an uncertain date as null. The correction's
reviewed reason and URLs must refer to evidence in the same manifest.
`expected_identity` describes the corrected identity; `expected` describes the
text immediately after metadata correction and before replacement text. When the
identity changes, replace the complete biography in English and German and either
review or clear existing profession and pronoun fields.

The compiler locks rows in ID order, checks original metadata and translation
snapshots, corrects metadata, and writes replacement evidence and translations in
one transaction. The database invalidates old claims and drafts old translations.
Anonymous verification checks corrected metadata as well as text. A concurrent
edit aborts the batch. Rollback checks subsequent edits and restores the original
metadata and text with affected profiles and translations in draft; it never
republishes a known mistaken identity. Review and republish any later correction
through a new manifest.

### Unresolved inclusion and namesake errors

A verified connection is required for public inclusion. When the imported person cannot be bound to a reliable source, use a case-specific `review_holds` entry alongside the reviewed records. Include the exact original identity, texts, provenance and publication flags in `before`, a substantive evidence-gap `reason`, and each checked source with its actual finding. A failed lookup, a relative’s identity, illness, a role, a shared name or a generic imported biography does not establish personal LGBTQ identity.

Compiler 5 applies the holds and reviewed replacements in one transaction, rejects concurrent changes, sets held profiles to draft with `needs_attention=true` and `seo_indexable=false`, and records the reason and research in private `field_provenance.editorial_hold`. Anonymous verification must confirm these profiles are absent. Rollback deliberately keeps review holds private; only a new, exact-person source review can authorize republication. Earlier frozen compiler versions remain unchanged.

### Releasing a reviewed private hold

Compiler 6 accepts a policy-2 record with `review_hold_release`: an exact `before`
snapshot of the held draft and reviewed `evidence` (reason and URLs from that
record’s sources). It requires a documented hold, `needs_attention=true`,
`seo_indexable=false`, no duplicate, and complete replacement summaries,
biographies and explanations in English and German. Treat this as a new source
review, never as automatic approval of the previous import.

The transaction checks every original before changing metadata, writes reviewed
replacement text, evidence and translations while the record is private, and
sets public visibility only at the end. Existing publication guards still apply.
It removes only the released record’s hold metadata, sets attention false and
indexability true, and anonymous verification checks those flags. Concurrent
snapshot edits abort the transaction. Rollback rejects later publication edits,
restores the original hold and returns the profile and legacy translations to
draft. It cannot republish an unsupported original.

The same manifest may refresh `review_holds` for existing held drafts, using
fresh exact snapshots and source-specific findings. Record what would resolve
each evidence gap. These remain private on both publication and rollback.
Compiler versions 2–5 retain their frozen SQL bytes and hashes.

For unverified imported scene tags, set `review_hold_release.clear_unverified_tags`
to true and include the exact nonempty `before.tags` array. Explain the clearing
in the review evidence. Publication removes these tags; anonymous verification
checks that they remain absent. Concurrent tag changes abort release, and later
tag changes block rollback. Rollback restores the original tags only with the
profile returned to private draft. Do not transfer scene-category identity labels
into a person's biography.

### Assert the outcome of existing publication gates

New publications use `publication_assertions: "strict"` (compiler 7). Existing
production gates may silently return a requested publication to draft when an
accepted image or the adult-performer publication-consent record is missing.
Source substantiation alone cannot satisfy those separate requirements. Read
`quality_dimensions.hard_failures` and the promotion-consent state before staging
a held release; never invent consent or restore an unbound image to pass a gate.

Compiler 7 checks the actual final visibility, attention, indexability and duplicate
state of every reviewed record before the transaction can commit. Any blocked
release aborts the complete publication, including its translations and sources.
It also asserts that continued holds are private and have no published translations.
A completed source review that still lacks publication prerequisites can be recorded
as a private hold with that specific reason. Anonymous verification checks profiles,
translations and source metadata. Read policies require a public nonduplicate parent
for personality translations and sources; staff retain their review access.

The rollback-only production preflight must execute these final assertions, rather
than treating a successful SQL statement as proof of publication. Earlier compiler
versions and their frozen hashes remain historical records of what actually ran.
