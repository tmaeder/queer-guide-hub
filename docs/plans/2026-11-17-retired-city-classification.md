# Reconcile classification after explicit non-city archival

Four geography findings still demand settlement proof for rows already archived through the native `not_a_city` disposition. Preserve the archived records and their history. An old unresolved-city finding should stop overriding native geographic checks when the row is a ghost, SEO is disabled and the explicit disposition is `not_a_city`.

Add that narrow exclusion to `geo_cms_classification_issue`. Do not exclude every ghost or every row with a disposition marker. Keep active unresolved records, inconsistent/public ghosts, fingerprint protection and native country/coordinate checks unchanged. Recheck affected records through `geo_cms_verify`; a successful country check is not a claim that a region is a verified city. Preserve separate boundary conflicts.

Validate the real historical classification guard and native verifier in a disposable PostgreSQL cluster. Cover active unresolved, explicit retired non-city, heuristic ghost, inconsistent live disposition, public ghost, stale classification and an archived record with a wrong country. Assert unchanged city rows and function security, plus migration idempotency. Apply only after the fixture passes, read back the function and use audited native rechecks for reviewed archival decisions.
