# Local database-backed import contract

The optional `database.integration.test.ts` suite runs the actual import service through the Supabase JavaScript client against PostgreSQL and PostgREST. It verifies creation, correction, enrichment, typed compare-and-set predicates, RLS isolation, a database race, governed RPC saves, and complete matching with a two-row API cap. Auth identity is a local fixture and JWTs use a known test-only signing key; this does not test GoTrue or production domain-specific RPC internals.

Use a disposable local PostgreSQL cluster, never an application database. The SQL fixture requires the database name `qg_import_contract`, and the test rejects non-loopback database/API URLs. Ordinary test runs skip this suite when its environment variables are absent.

With PostgreSQL tools and PostgREST on PATH, start the fixture in two terminals:

```sh
initdb -D /tmp/qg-import-contract-db -U import_test_owner -A trust --no-locale -E UTF8
pg_ctl -D /tmp/qg-import-contract-db -l /tmp/qg-import-contract-db.log -o '-h 127.0.0.1 -p 6547' start
createdb -h 127.0.0.1 -p 6547 -U import_test_owner qg_import_contract
psql postgresql://import_test_owner@127.0.0.1:6547/qg_import_contract -v ON_ERROR_STOP=1 -f src/lib/tableImport/__tests__/fixtures/database.sql
```

Run PostgREST using this local configuration:

```ini
db-uri = "postgresql://import_contract_authenticator@127.0.0.1:6547/qg_import_contract"
db-schemas = "public"
db-anon-role = "import_contract_anon"
db-max-rows = 2
jwt-secret = "local-import-contract-only-not-a-production-secret"
server-host = "127.0.0.1"
server-port = 3007
```

```sh
postgrest /path/to/local-postgrest.conf
```

Then run the suite from the checkout:

```sh
QG_IMPORT_TEST_REST_URL=http://127.0.0.1:3007 \
QG_IMPORT_TEST_DATABASE_URL=postgresql://import_test_owner@127.0.0.1:6547/qg_import_contract \
npx vitest run src/lib/tableImport/__tests__/database.integration.test.ts
```

`QG_IMPORT_TEST_PSQL` can point to an absolute psql executable. Each test resets only `import_contract_rows` in this scratch database. Stop PostgREST and `pg_ctl -D /tmp/qg-import-contract-db stop` when finished. Do not reuse this unauthenticated local PostgreSQL cluster for application data.
