# City quality drain repair

The 28 October production snapshot reports 5,830 publication blockers and
5,654 missing external identities. These are unresolved facts, not permission
to manufacture identifiers or change publication flags.

The native identity selector's next 60 candidates included 55 visited within
two days and only 18 indexable cities. Population took precedence over revisit
age, so unresolved high-population rows repeatedly displaced the untouched tail.
The alias job had automatically paused after three errors. Function and database
logs identify `cities_due_for_refresh` statement timeouts; the original large
batches also reached the gateway's 150-second idle timeout.

The repair limits gap content lookups to the selected rows, shares content
membership for the regular scopes, puts indexable and oldest unvisited cities
ahead of population, and applies a one-day gap revisit cooldown. Identity and
alias jobs use 20 rows every ten minutes, offset by five minutes; the factual
SPARQL job uses 12 rows at its existing cadence. Commands retain the native run
tracking wrapper and authentication. A human-disabled job aborts the migration;
only the observed automatic alias pause is eligible for reactivation. Historical
failure counters remain intact until a real successful run updates them.

The same release corrects the wrong-subject detector. Its unbounded `as an ai`
substring matched “has an airport” and “has an airfield”; historical mentions of
disambiguation also counted as disambiguation pages. The new predicate retains
actual disambiguation leads and AI/refusal wording with word boundaries. It
changes the detector, not the original descriptions, source evidence or ceilings.
The view owner, grants and options and the selector's service-only ACL remain
unchanged.

Before increasing the drain rate, the native worker now reads service-only
factual snapshots carrying PostgreSQL row versions. Its writer locks the city
and existing review rows, rechecks human holds and the original row version,
timestamp and provenance/status, and commits facts, fill-only aliases and evidenced locality registrations in
one transaction. Row versions catch edits even on paths that leave `updated_at`
unchanged. The RPC cannot change publication, lifecycle, names or ownership;
stale/held work is deferred. Database/provider failures produce failing HTTP
responses rather than an apparently healthy completed run. Reconcile native
receipts and audits before retrying any failed or unknown partial batch.

Run the isolated regression suite with:

```sh
python3 supabase/tests/isolated/run_city_refresh.py
```

It creates and removes its own PostgreSQL cluster and Unix socket, with no TCP
listener. Set `PG_BIN` to a PostgreSQL binary directory when Homebrew PG17 is not
installed. Tests cover fairness, cooldown, existing scopes, terminal exclusions,
content membership, limits, tracking, failure history, manual-pause refusal, view
options, function privileges and positive/negative description cases.
It also proves atomic city/alias rollback, rejection of stale provenance and
row versions, replay refusal across committed transactions, human-decision and
confirmation holds, protected-field rejection, atomic locality rollback, held-locality refusal, and exclusion of private city
columns from the snapshot response.

After ordinary CI deployment, verify the exact applied migration version,
selector execution time and candidates, registry/live-cron parity, fresh native
receipts and falling unresolved counts. Use the existing bounded
`scripts/data-quality/recover-city-review-identities.mjs` driver for additional
operator batches. Keep its receipt journal, reconcile every unknown outcome
before retrying, and retain native country, coordinates, settlement-class,
source/provenance and human-ownership guards. A successful HTTP response alone
does not prove that an identity or review was resolved.
