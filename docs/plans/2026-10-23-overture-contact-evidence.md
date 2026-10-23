# Public Overture contact evidence

The public Overture Places release provides a bulk alternative to per-venue paid API requests. The collector reads the official STAC catalog and anonymous public Parquet assets for release `2026-10-21.0`. It captures source facts only and never writes application data.

Run the collector with a native candidate export and a bounded city window. Its default mode makes no source calls; `--collect` reads the source and checks positive websites. The window includes places without contact details, because those records can still make identity ambiguous. A window exceeding 150,000 records cannot produce positive evidence. Every candidate must sit inside the window with its entire matching radius covered.

A positive match requires a unique name, country, address and nearby coordinate match; open status; confidence of at least 0.9; one website; and recognized source licences. Closed, incomplete and low-confidence namesakes still block uniqueness. Website probes require the venue's distinctive name in the current page title and its street address in the returned document. HTTP 200 alone is insufficient: live San Francisco probes found a gambling site and unrelated replacement businesses at former venue domains. Probes also reject nonpublic destinations, cross-host redirects, known domain-parking responses, and unsuccessful or non-HTML responses.

The default-dry SQL operator retains the raw nearby records, source identifiers, release assets, individual attribution records, hashes, observation time and website response evidence. It rechecks identity, uniqueness, ownership and row freshness inside the transaction. Human edits, claimed profiles, existing contacts, conflicting provenance and known source-limitation contracts are protected. It changes only an empty venue website and records machine provenance. The ordinary business source producer handles inheritance and finding reassessment after the migration; no issue is waived and no human verification is claimed.

The first Zurich window contained 36,834 places. Six candidates met the strict source checks and four sites responded successfully. The initial operator dry run and rollback selected one record. Subsequent website-identity checks reduced the acceptable sites further; these earlier reachability results must not be reused as identity proofs. No source-match count should be reported as repaired findings.

## Source attribution and licences

The official [Overture attribution guidance](https://docs.overturemaps.org/attribution/) describes source-specific licences. Preserve every feature's `sources` array, including dataset, licence, record ID and update time. This collector permits CDLA-Permissive-2.0, Apache-2.0 and CC0-1.0; unknown licences remain unresolved. Exporters must preserve applicable attribution and licence/NOTICE obligations; do not describe all Overture Places as having a single licence.

Sources: [public cloud access](https://docs.overturemaps.org/getting-data/cloud-sources/), [DuckDB access](https://docs.overturemaps.org/getting-data/duckdb/), [Places schema](https://docs.overturemaps.org/guides/places/), and the [release STAC collection](https://stac.overturemaps.org/2026-10-21.0/places/place/collection.json).

Native application on 2026-10-23 registered four freshly checked websites (Soho Zürich, Archimedes Banya, Hi-Lo Club and San Francisco Eagle Bar). The existing business producer inherited all four and corrected four contact findings, with source attribution and machine provenance retained. The earlier expired proofs selected zero records; the CLI dry run later encountered a lock timeout and was reconciled before applying through the native connector. Neither rejected attempt is counted as a write.
