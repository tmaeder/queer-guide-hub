Run `QG_TEST_POSTGRES_BIN=/path/to/postgres/bin bash tests/sql/prideplaces-sync/run.sh`.
The runner creates and removes a private PostgreSQL cluster and applies the actual
Pride Places migration against isolated dependency tables. It never connects to
Supabase or production.

Assertions cover role privileges and RLS, disabled release controls, the approved
Sunday schedule, overlapping starts and claims, acknowledgement replay, expired
leases and scan deadlines, fresh validation gates, organizer mappings, historical payload preservation,
unchanged observations, source reversions and incomplete coverage failures.
