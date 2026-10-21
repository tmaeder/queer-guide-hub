These isolated regression fixtures exercise the source-contract migration without production data. They create a private, short-lived PostgreSQL cluster with only the affected interfaces. They are not a replacement for a rolled-back production-schema regression after deployment.

Run with PostgreSQL 17 binaries on PATH, or set `QG_TEST_POSTGRES_BIN` to their directory:

```sh
bash tests/sql/business-facts-only/run.sh
```

Coverage: facts-only scope, extra registered evidence, multiple locations, other identity roles, geography conflicts, raw supplied facts, dry-run non-mutation, preservation of supplied prose, auditable unavailable outcomes, idempotency, safety/publication preservation, source-change invalidation and private function grants.
