# gays-cruising.com — consent record

**STATUS: INCOMPLETE. Nothing may be staged or committed until the fields marked
`<!-- TODO -->` are filled in from the actual consent document.**

`scripts/data-quality/import-gays-cruising.mjs` reads `GAYS_CRUISING_CONSENT_REF`
from the environment and exits if it is unset. That variable must hold the **Ref
token** below. The variable is not a password and nothing verifies its contents —
its job is to make enabling this an act that has to *name* the permission it
relies on, so "who said we could?" has an answer in the deploy config rather than
in somebody's memory.

---

## Rightsholder

| | |
|---|---|
| Entity | Keyup Studio S.L. |
| Registered | Valencia, Spain |
| Service | https://www.gays-cruising.com |
| Governing terms | *Condiciones de Uso* §5 (reproduction/exploitation), §12 (contents), §17 (Spanish law, Valencia), §18 (operator identity) |

§5 is an **express prohibition**, not an absent licence: it forbids reproducing,
copying, reselling or exploiting any part of the service without consent given
*"expreso y por escrito"*.

## The consent being relied on

| | |
|---|---|
| Ref token | <!-- TODO: the exact string, also set as GAYS_CRUISING_CONSENT_REF --> |
| Date granted | <!-- TODO --> |
| Medium | <!-- TODO: email / signed contract / support ticket --> |
| Granted by (name, role) | <!-- TODO --> |
| Who holds the original | <!-- TODO --> |

## Scope actually granted

Answer each from the document itself. Do not infer.

| Question | Answer |
|---|---|
| Covers automated/API access to the service? | <!-- TODO: yes / no / silent --> |
| Covers the access that **already occurred** on 2026-09-18/19 (see below)? | <!-- TODO --> |
| Covers republishing **factual** fields (name, coordinates, locality, region, country, id, backlink)? | <!-- TODO --> |
| Covers republishing **user-authored spot write-ups**? | <!-- TODO — see the warning below --> |
| Any attribution requirement? | <!-- TODO --> |
| Any expiry or revocation terms? | <!-- TODO --> |

### The write-ups are a separate question, and consent from Keyup may not settle it

The spot descriptions are authored by the site's **users**, not by Keyup. Keyup's
own terms may grant Keyup a licence to *host* that text; a licence to host is not
a licence to *sublicense*. Unless the consent document contains a clause
specifically confirming Keyup holds redistributable rights in user-contributed
content, consent from Keyup does not make republishing those write-ups lawful —
it makes it an infringement of thousands of third parties who never agreed to
anything.

Separately, measured over the corpus: **1,826 records (3.1%) name a real retail
chain** (Walmart 39, Basic-Fit 37, Planet Fitness 26, Carrefour 22, …) and that
regex is a floor, not a ceiling — local businesses are not caught. Publishing
*"the toilets in &lt;named business&gt; are a cruising spot"* is an assertion about an
uninvolved third party that cannot opt out. `safety_gated` does not address this;
it is a signed-in gate, and signup is free.

The importer therefore keeps prose **off by default** and requires both
`--include-prose` and `GAYS_CRUISING_PROSE_ACK` to be set before it will emit a
description. That is a deliberate speed bump, not a legal opinion.

## Provenance of the data we hold — read this before writing any attribution

**This is our own crawl, not a dataset supplied by the rightsholder.**

On **2026-09-18/19** this machine ran `enrichment_server.mjs`, a local server
driving a browser that issued **58,618 JSONP requests** to

```
https://www.gays-cruising.com/api/?op=obtenerZonaInfoWidget&id=<n>&idioma=en
```

at **concurrency 16**, over spot ids harvested from three approved-spot sitemaps.
`enrich_workbook.mjs` folded the results into `gays_cruising_all_spots.xlsx`.

So the correct phrasing everywhere — in `metadata.source_terms`, in any public
attribution, and in any correspondence with Keyup — is
**"crawled by us under consent ref &lt;X&gt;"**, never *"supplied by Keyup Studio"*.
The one artifact whose entire job is provenance must not misstate it.

**If the consent post-dates 2026-09-18**, then the crawl happened before the
permission existed and that is a fact to disclose to the rightsholder, not to
paper over here.

## What is NOT authorised by this record

- Enabling `supabase/functions/source-gays-cruising/` on a schedule. That is a
  recurring crawler and needs its own decision. `src/lib/__tests__/gaysCruisingLicence.test.ts`
  fails the build if a migration registers it in
  `cron.schedule` / `admin_automations` / `ingestion_sources`, or if
  `config.toml` gains a `[functions.source-gays-cruising]` block.
- Re-crawling the API. The corpus is already on disk at
  `out-gays-cruising/enriched_spots.jsonl`
  (sha256 `58feeb82486166ea538b8644debab888013b0af9ac3c00e00230951472325090`).

## Review

| | |
|---|---|
| Record written | 2026-09-19 |
| Written by | Claude, during the import work — **not a legal review** |
| Reviewed by | <!-- TODO --> |
