# Personality context and language consistency

Approved by the user on 2026-11-25 with “continue”, following the proposed combined scope.

Preserve the current personality directory and profile layout. Cards should explain a documented LGBTIQ connection before repeating a generic occupation summary. Profiles should show the connection and supporting source links separately from the biography. Distinguish community membership, activism, allyship and cultural representation; never infer identity from occupation, appearance or association.

Use a bounded public editorial projection of verified claims. Private, duplicate and archived personalities, pending/rejected claims, unverified details and draft translations must not enter this projection. Keep the underlying claim table restricted. Missing evidence is an editorial gap, not a claim that someone has no community connection.

Read published field translations through the existing content_translations sidecar, and support description_i18n. Localize interface labels and dates using the selected UI locale. Mark fallback prose with its source language and a lang attribute. Keep canonical filter values separate from translated display labels. Add the connection explanation to CMS translatable fields.

Strengthen enrichment instructions: canonical English prose, explicit source evidence, a concise connection-first description where supported, no inferred identity. Provide a read-only audit identifying missing explanations, missing claim provenance and mixed-language content, without bulk-publishing generated sensitive claims.

Validation covers verified versus rejected claims, public visibility boundaries, published versus draft translations, language switching and fallback labels, dates, and existing personality browsing/detail regressions. Database migration and production publication remain explicit release steps.

Read-only production baseline: 2,223 public rows, 1,983 biographies, 720 connection categories, 45 connection explanations, no personality rows in content_translations. Claim-source statuses include verified, pending and rejected. A UI-only wording change cannot repair all missing evidence.
