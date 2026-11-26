# Reviewed personality batches

Use one manifest, one atomic data publication and one merged deployment per batch. Do not publish individual rows during research. Generated proposals and search excerpts are not verification.

## Prepare the review queue

Run the read-only audit, then snapshot up to 100 pending public profiles:

```sh
npx tsx scripts/data-quality/audit-personality-editorial.ts --out /absolute/audit.json
node --import tsx scripts/data-quality/personality-editorial-batch.mjs queue /absolute/audit.json /absolute/new-batch.json 100
```

The queue uses anonymous reads, prioritises featured/high-visibility profiles and excludes adult-marked profiles. Research hints are not evidence. Translation snapshots remain explicitly unreviewed because anonymous reads cannot establish whether a private draft exists. Obtain the authoritative translation snapshot before marking the batch reviewed.

The default queue size is 100. Group research by established institutional collections when they cover several candidates; use exact-name matches only to stage candidates, then cross-check occupation and birth information before reviewing the individual biography and the specific fact being published. Same-name collisions and unresolved identity conflicts must be excluded before freezing the manifest. Keep clear existing biographies and translate only affected fields. Verify every record through the anonymous API; use a representative live UI sample covering both languages, connection types and the longest texts, expanding it when a failure warrants it.

For each candidate, match the exact person and read the source. Record `url`, `title`, `checked_at`, `identity_match: "exact"`, a concise `basis`, and the exact changed `fields` supported. Use multiple sources when needed. Explicit public identity, activism, allyship and cultural work are distinct bases. Never infer personal identity from an occupation, a fictional role or a same-name match. Record unresolved candidates separately and leave their public values unchanged.

Fill the English `description` (120–240 characters), `lgbti_details`, and any other approved fields. Add reviewed translations. Each touched field needs its original value; `metadata_before` supplies original provenance and the connection-source value. For each translated field, `expected_translations[language][field]` is either `null` (authoritatively absent) or `{ "value": "...", "status": "...", "machine_source": null }` with the actual three values. Source review is an editorial decision: automated checks cannot prove that the evidence supports a claim.

Set record review status, connection basis and reviewed translation languages only after inspection. Set the batch reviewer and dated review. Commit reviewed manifests under `docs/editorial/personality-batches/<batch-id>.json`. Use the same ID and artifact directory throughout release.

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

Merge the one reviewed PR. Follow its Pages deployment to success, then verify the real site, not only the generated data. Record the release once:

```sh
node --import tsx scripts/data-quality/personality-editorial-batch.mjs receipt docs/editorial/personality-batches/<batch-id>.json /absolute/shared-artifacts <deployment-run-id>
```

The receipt checks the successful Pages run, the manifest contained in its commit, the frozen/public verification digest, and the live `build-id.txt`. It refuses a conflicting second deployment receipt for that batch. Preserve `release.json` with the prepared and verified artifacts. These are auditable process controls, not a global lock against a separate operator bypassing the workflow.

Refresh the audit once after the batch and carry unresolved IDs forward. Group further fixes into a new batch; do not add per-profile follow-up deployments to a completed batch.
