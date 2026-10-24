# Registered Gayout venue detail enrichment

The city-map importer stores listing identities and map facts, leaving public business contact and description fields unread. This operator captures positive facts from the exact registered detail page. It requires the publisher's primary listing ID, exact normalized name, country and coordinates within 60 metres. It retains only selected business JSON-LD fields, their hash and capture time. A listing URL is never substituted for an official business website.

Only absent phone and description fields are eligible. Phone values must pass the native country codec; descriptions must be complete published summaries of 10–25 words and at least 80 characters. Human changes, claims, verification, source drift, existing winning provenance and review decisions block writes. Full row assertions preserve unrelated venue and organization fields. Changed organizations receive normal quality reassessment; the writer never marks findings passed.

The preparation and registration scripts default to read-only previews. Registration supports a full rollback, bounded batches of 50, an existing producer lease, fresh proof validation and an atomic journal written before submission. An unknown receipt requires reconciliation before another write.

Validation: seven parser tests and 16 disposable PostgreSQL cases, including twelve protected records. The native Brisotel pilot completed a full rollback before one actual write on 2026-10-24. Its published phone normalized to +244933472424 and its short source description was registered. Ordinary `refresh_business_brand_quality()` subsequently returned `contact_available` and `description_usable`; verification remained pending. Receipts are retained in the operator's output journals.
