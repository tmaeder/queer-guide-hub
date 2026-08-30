# Phase 2 — Legal corroboration

Design for Phase 2 of `docs/architecture/open-data-integration.md` §5.
Measured against prod 2026-08-30. Supersedes the Phase 2 entry premises in that document,
three of which this work falsified.

> **Status: SHIPPED and verified on prod, 2026-08-30.** Migrations `20260830131211`,
> `20260830132243`, `20260830132442`, `20260830132743`, `20261103100000`; territory
> inheritance in `import-ilga-data` (deploys via CI on merge — the first inheritance was
> applied by the migration, so live state is already correct).
>
> Two things in this document were written before they were measured and turned out to be
> wrong; both are corrected in place rather than deleted, because the elimination is worth
> more than the guess. (1) The `anon` grant was **not** the re-enable mechanism — see §C.
> (2) Treating an unstamped note as a drifted one was a defect in §D's own first design,
> caught by measuring before the cron ran and fixed in `20260830132442`.

## What the measurement changed

The roadmap entry rested on three claims. Two are wrong and one is incomplete.

**Claim: the 11 skipped countries fail the `a2_code` join.** False. ILGA's live GraphQL returns
**239 national jurisdictions, 239 distinct `a2_code`s, zero null codes** — a 100% join hit rate
against the 239 rows we update. None of the 11 appear under any code, and a name search over
ILGA's jurisdiction list finds no Åland, Svalbard, Cocos, Christmas, Norfolk, Western Sahara,
Antarctica, Bouvet, Heard or Outlying entry. ILGA *does* carry dependent territories that have
their own legal regime — Cook Islands, Niue, Tokelau, Jersey and Anguilla are all in the corpus and
all update nightly. "Dependent territory" is not the discriminator. **Having a distinct legal system
is.** `skipped: 11` is not an importer defect; it is ILGA's coverage boundary, reported faithfully.

**Claim: the 11 are stale, stamped `2026-04-21`.** Incomplete, and the difference matters. They are
**empty and always have been**: `lgbti_criminalization = {}`, `equality_score = null`,
`rights_verdict_general = null`, `lgbti_same_sex_unions = null` on all 11. The April timestamp is
seed data, not the residue of a successful run. There is no stale value to refresh — there is a
hole to disposition.

**Claim: Equaldex returns 403/404 and has no public API.** False, and the true reason is stronger.
`https://www.equaldex.com/api` returns **200**; `/api/region?regionid=us` returns **401**, i.e. the
API exists and wants a key. The real blocker is the licence: free tier is non-commercial only
(*"may not sell the data, offer it to paying users, or display it in a paid app or website"*),
requires attribution, forbids replicating the service, and **caps storage at 30 days**. A 30-day
storage cap is structurally incompatible with `countries` being the durable store behind
`location_is_high_risk()`. Scraping region pages violates the same terms. Migration
`20260330600000`'s stated reason must be corrected, not merely re-applied.

## The live exposure

7 cities in the 11 countries, all `shell_status='ghost'`, all `seo_indexable=false`, all
`safety_notes=null`. **0 venues, 0 events, 0 hotels.** So nothing is leaking today.

The default is nevertheless wrong. The gate predicate is
`(lgbti_criminalization->>'legal') = 'false'`; against `{}` that evaluates
`NULL = 'false'` → `NULL` → **not high risk**. El Aaiún (Western Sahara, ~220k residents, under a
de-facto criminalizing penal code) therefore **fails open**: the first venue to land there publishes
ungated. This is the defect worth engineering, not the empty columns themselves.

---

## A — Disposition of the 11

Three classes, three treatments. One mechanism cannot serve all three, and forcing one would either
invent facts or discard them.

| Class | Codes | Treatment |
|---|---|---|
| No permanent civilian population | AQ, BV, HM, TF, UM | `not_applicable` — no legal regime exists to record |
| Inhabited, parent-state law governs | AX (FI), CC/CX/NF (AU), SJ (NO) | inherited nightly, labelled as inherited |
| Disputed sovereignty | EH | `data_unavailable` + narrow fail-safe |

### A1 — Recurring inheritance (5 territories)

A static `TERRITORY_PARENTS = { AX:'FI', CC:'AU', CX:'AU', NF:'AU', SJ:'NO' }` map applied inside
`import-ilga-data`, **after** the main loop, copying the parent's just-written row and stamping:

- `lgbti_data_last_updated = now()`
- `enrichment_status.lgbti_rights = { state:'inherited', parent:'FI', at:… }`

**This must not be a one-shot migration.** A copied legal profile is a derived field that outlives
its input — the class that produced 86 safety notes describing the wrong country's laws, and the
`detect_stale_venues` threshold a migration "fixed" while prod ignored it. Re-deriving on every ILGA
run means Åland self-heals the day Finland's law changes, with no second detector to build.

The inheritance is stamped as `inherited`, never as `ilga`, so no downstream reader can mistake a
copy for a measurement.

> **Known interaction.** `rights_verdict_general` is currently incoherent for high-scoring countries
> (Norway, Sweden, France, Germany, UK, Canada all read `hostile` at `equality_score = 100`, while
> identically-scored Denmark and Spain read `protected`). Svalbard would inherit Norway's `hostile`.
> This is tracked separately and deliberately excluded from this PR. The recurring design is what
> makes that acceptable: Svalbard self-corrects the night Norway is fixed.

### A2 — Recorded dispositions (6 territories), one-shot migration

`AQ, BV, HM, TF, UM` →
`{ state:'not_applicable', reason:'no permanent civilian population — no domestic LGBTI legal regime exists to record' }`

`EH` →
`{ state:'data_unavailable', reason:'disputed sovereignty; no uncontested legal authority' }`

`enrichment_status` already carries exactly this `{state, reason, source, at}` shape on `countries`
(verified live on AX), and `data_unavailable` is already the established terminal sentinel in the
country engine. No new column.

### A3 — Western Sahara fail-safe, narrowly scoped

Set **only** the gate-relevant fields:

```json
{ "legal": false,
  "disputed": true,
  "de_facto_authority": "MA",
  "basis": "Moroccan Penal Code Art. 489, applied in Moroccan-administered Western Sahara",
  "source": "manual:disputed-territory" }
```

Morocco's other 17 topic columns are **not** copied. Asserting that Moroccan marriage, adoption or
gender-recognition law governs Western Sahara is a sovereignty claim we cannot support; asserting
that the criminal law is enforced in the administered territory is documented, and erring toward
gating protects the user. The distinction is the whole point of the narrow copy.

Consequences, all desirable: the gate fires, El Aaiún content gates behind sign-in, and
`compose_safety_note()` — seeing a criminalizing country — forces `auto_publishable = false` and
routes to `entity_review_queue`. The outing-safety invariant needs no change to hold.

### A4 — Accounting, and a rejected exit criterion

239 ILGA + 5 inherited = **244 stamped fresh nightly**. The remaining 6 keep their existing
`lgbti_data_last_updated` **on purpose**.

The roadmap's literal exit is "250/250 fresh". Meeting it would require stamping a current timestamp
on six countries nothing checked, because there is nothing to check — recording an observation that
did not happen. The honest exit is **250/250 accounted for, 0 silent skips**, which is a stronger
property: it is falsifiable by a sentinel, where "fresh" would be satisfied by a lie.

**Sentinel.** New gate `country_rights_unaccounted` in `trust_safety_gate_status()`, severity
`critical`, **zero-tolerance with no baseline allowance** (the `stranded_human_approved` pattern —
14 rows hid under a 3,500-row floor for 40 days). It counts countries carrying neither fresh
ILGA/inherited data nor a recorded `enrichment_status.lgbti_rights` disposition. A 251st country, or
ILGA dropping a jurisdiction, fires it immediately instead of disappearing into `skipped: 11`.

---

## B — Corroborator: decision recorded, build deferred

**Scope decision.** Corroborate `lgbti_criminalization.legal` and `death_penalty` **only** — the two
fields that drive `location_is_high_risk()`, `safety_gated`, and RLS on venues/events/organizations.
That is ~66 criminalizing jurisdictions rather than 250 countries × 18 topics. A full second opinion
on all 18 is a large build for marginal safety value; the gate fields are where being wrong hurts.

**Source decision.** **US State Department Country Reports on Human Rights Practices.** Public
domain as a US Government work — so unlike Equaldex there is no licence constraint on storage,
redistribution or commercial display at all. Independent embassy reporting, so it is not a
derivative of ILGA. Per-country LGBTI section, annual cadence.

**Rejected: Equaldex** (either licensing or scraping). The free terms forbid commercial display and
30-day-plus storage; a commercial licence is a negotiation with unknown cost and may carry the
storage cap into the paid tier. Scraping violates the same terms plus the anti-replication clause.

**Rejected: Wikipedia/Wikidata rights tables.** Free and redistributable, and they do cover the 11
territories ILGA omits — but those tables heavily cite ILGA. A corroborator derived from the primary
source manufactures false confidence, which is worse than a known single source.

**The build is deliberately deferred to its own PR.** Shipping a `country_rights_corroboration`
table with no working extractor reproduces the exact anti-pattern this phase exists to clean up: a
registered, enabled, dead row that reads as coverage. `equaldex-api` sat `is_enabled = true` and
dead for four months for that reason. §5 Phase 2 says it directly — *"the honest state is that the
platform's highest-stakes data has a single source, and the document should keep saying so rather
than implying a fix is queued."*

So Phase 2 lands the decision and updates §1.5 to state single-source honestly. When the extractor
is proven against real report text, it ships with its own table and writes disagreements to
`entity_review_queue` — **never to `countries`**. Physical table separation is the guarantee that
"flag, never overwrite" cannot be violated by a later edit.

---

## C — Reconciling the `scrape_sources` drift

Re-disable `equaldex-api` with the **corrected** reason recorded in the row itself, so the next
reader does not re-enable it on the stale "403/404" premise. The new migration's header states what
was measured: 200 on `/api`, 401 on the region endpoint, licence-incompatible.

**My first hypothesis for the re-enable was `anon` writes. It was verified with service role and
is FALSE — recorded here because the elimination is the useful part.** The baseline does carry
`GRANT INSERT, REFERENCES, DELETE, TRIGGER, TRUNCATE, MAINTAIN, UPDATE … TO anon` on
`scrape_sources`, but RLS is enabled and all four policies are `TO authenticated` +
`has_role_jwt('admin')`, so anon writes are denied. anon did not do it.

Nor did the scraper: all three `scrape-web-sources` write-backs (≈ lines 1288/1386/1426) set only
`last_run_at` / `last_error` / `consecutive_failures` / totals. **No code path in this repo writes
`scrape_sources.is_enabled` at all.** So the honest statement — the one the migration records — is
that the row's flag has not been written by any repo code path since creation and the earlier
migration's UPDATE did not take effect. No mechanism is invented to fill the gap.

**What the investigation did surface is larger and unrelated: `anon` holds `TRUNCATE` on 464
tables** — `venues`, `events`, `countries`, `trips`, `messages`, `user_roles` among them — and
**RLS does not gate `TRUNCATE`**; Postgres checks the privilege alone. It is not currently
reachable (PostgREST exposes no TRUNCATE verb, and of 543 anon-executable routines the only one
mentioning `truncate` is a read-only grant-audit function), so this is latent rather than live. It
is tracked as its own task: revoking across 464 tables is a security change that deserves its own
review, not a ride-along in a data-quality PR.

Per this codebase's own rule, a migration that "fixes" config is not evidence the config changed:
verify live afterwards with the SQL in §Verification, never assume.

---

## D — `safety_notes` fact drift

**The gap, precisely.** Eligibility in `run_city_safety_backfill` is
`(note never written) OR (source='derived' AND safety_notes NOT ILIKE '%'||country.name||'%')`.
The text test detects a city being **relinked** to another country. A country **changing its law**
leaves the prose naming the correct country and the `country_id` key intact, so it satisfies neither
arm and is never re-examined. The note serves outdated law indefinitely.

**The fix.** Stamp `field_provenance.safety_notes.facts` — a normalized jsonb of the **8 legal**
inputs the composer actually reads (`country_name`, `equality_score`, `criminalizing`,
`death_penalty`, `penalty`, `unions_summary`, `marriage`, `marriage_since`). These are already
assembled per row as `v_in`, so the stamp costs nothing extra. Eligibility gains:

```
OR (source='derived' AND stamped facts IS DISTINCT FROM current facts)
```

**Self-healing, no backfill migration.** All ~4,529 existing derived notes are unstamped, so they
are eligible once, recompose, and stamp — converging at 300/night in roughly 15 nights. This is
preferred over a backfill that stamps today's facts onto an old note: that would record "these facts
produced this note" without proving it, and would bless a note that had *already* drifted. The same
reasoning gated `20260913114500`'s stamp on the note naming its current country.

**`density` is deliberately excluded from the fingerprint.** The composer does read venue/event/
village counts, but those churn constantly; including them makes every city with any ingest activity
eligible every night, storming the `cities → geo_places → search_reindex_queue` chain on a
disk-constrained DB. Density drift changes tone, not legal correctness. Values are normalized
(trim, case-fold, unify `''` / `null` / `'No data'`) so cosmetic ILGA flicker cannot fire it.

**What this does not change.** The composer still forces `auto_publishable = false` for criminalizing
and death-penalty countries; `approve_city_review()` still requires `p_confirm = true`. A
fact-drifted note now reaches the existing ELSE branch, which already retracts to NULL and preserves
the old text under `field_provenance.safety_notes.retracted` — so it stops serving stale law while it
waits for a human, rather than serving it for months.

**What it still cannot catch.** A country whose law changes in a way that alters none of the 8
stamped fields. That is a narrower residue than today's "any fact change at all", and it is recorded
here rather than implied away.

---

## Testing

Following the established migration-text-scan pattern (`src/lib/__tests__/`), which parses the
latest definition out of `supabase/migrations/` so a later edit that removes a property fails:

1. **`countryRightsDisposition.test.ts`** — all 11 codes carry an `enrichment_status.lgbti_rights`
   state; the 5 inherited names a parent; EH sets `legal:false` **and** `disputed:true`; EH does
   **not** copy Morocco's other topic columns.
2. **`citySafetyFactDrift.test.ts`** — the fingerprint contains all 8 legal keys and **not**
   `density`; the ELSE branch still retracts; `auto_publishable=false` is still forced for
   criminalizing.
3. **Deno, `supabase/functions/_shared/`** — `TERRITORY_PARENTS` covers exactly the 5, every parent
   is a real ILGA-covered code, and the inheritance pass writes `state:'inherited'` never `'ilga'`.
4. **Sentinel** — `country_rights_unaccounted` returns 0 against the post-migration state, and
   returns nonzero when a disposition is removed (mutation-tested, not merely asserted green).

## Verification (service role required — run after merge)

```sql
-- C: the drift, reconciled and live
select slug, is_enabled, updated_at, scrape_config
  from scrape_sources where slug like 'equaldex%';

-- C: the grant that may explain the re-enable
select grantee, privilege_type from information_schema.role_table_grants
 where table_name='scrape_sources' and grantee='anon';
select relrowsecurity from pg_class where relname='scrape_sources';

-- A: 250/250 accounted for, 0 silent
select count(*) from countries
 where lgbti_data_last_updated < now() - interval '2 days'
   and enrichment_status->'lgbti_rights'->>'state' is null;   -- expect 0

-- A: the fail-safe fires. `safety_gated` lives on the CONTENT tables, not on
-- `countries` — so ask the predicate directly, and confirm it would gate.
select public.location_is_high_risk(id, null) from countries where code='EH';  -- expect t
select code, lgbti_criminalization->>'legal', lgbti_criminalization->>'disputed'
  from countries where code='EH';

select * from trust_safety_gate_status() where gate='country_rights_unaccounted';
```

## Out of scope, recorded

- **`rights_verdict_general` is incoherent** — 10 countries at `equality_score=100` spread across 4
  verdicts; Norway/Sweden/France/Germany/UK/Canada published as `hostile`. Live user-facing safety
  misinformation on the canonical surface. Tracked as its own task; excluded to keep this PR scoped.
- The State Dept extractor (§B), its own PR.
- The `anon` write grant (§C) — surfaced here, but revoking it is a security change that deserves
  its own review rather than riding along in a data-quality PR.
