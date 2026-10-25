# Preserve source limits while adding published contact facts

The phone evidence writer currently refuses businesses whose source contract marks editorial or media unavailable. Registering a second source would invalidate the sole-source contract and generate unrelated work.

Allow only the existing registered Overture phone capture contract as a supplement to an otherwise unchanged facts-only importer. Validate the selected raw schema, exact STAC release and source identity, both hashes, captured selected row, published phone and canonical number, licenses, provenance shape and non-primary role. Additional prose, media, unknown source types or malformed evidence invalidate the contract. All registered hashes remain in outcome evidence. Existing canonical values that pass remain passes; no findings are manually changed.

The phone writer admits protected source-limit profiles only after this migration is recorded and a current original facts-only contract exists. After each factual write it verifies that the unrelated unavailable dimensions remain identical. Existing ownership, human review, exact identity, location, freshness, uniqueness, source and full-row guards remain in place.

Validation: real SQL helper and writer tests cover 28 malformed captures, both source hashes, wrong identities, unexpected sources, base prose, permissions, preserved outcomes, and all previous phone ownership boundaries.
