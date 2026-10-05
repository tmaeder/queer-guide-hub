# gays-cruising.com — consent record

**STATUS: COMPLETE FOR THE ONE-TIME FACTUAL-FIELD IMPORT DESCRIBED BELOW.**

`scripts/data-quality/import-gays-cruising.mjs` reads `GAYS_CRUISING_CONSENT_REF`
from the environment and exits if it is unset. That variable must hold the **Ref
token** below. The variable is not a password and nothing verifies its contents —
its job is to make enabling this an act that has to _name_ the permission it
relies on, so "who said we could?" has an answer in the deploy config rather than
in somebody's memory.

---

## Rightsholder

|                 |                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Entity          | Keyup Studio S.L.                                                                                                         |
| Registered      | Valencia, Spain                                                                                                           |
| Service         | https://www.gays-cruising.com                                                                                             |
| Governing terms | _Condiciones de Uso_ §5 (reproduction/exploitation), §12 (contents), §17 (Spanish law, Valencia), §18 (operator identity) |

§5 is an **express prohibition**, not an absent licence: it forbids reproducing,
copying, reselling or exploiting any part of the service without consent given
_"expreso y por escrito"_.

## The consent being relied on

|                         |                                                               |
| ----------------------- | ------------------------------------------------------------- |
| Ref token               | `hjdf87adffasdf78997dsadf`                                    |
| Date granted            | 2026-10-04                                                    |
| Medium                  | Email                                                         |
| Granted by (name, role) | Keyup Studio (individual name and role not supplied)          |
| Who holds the original  | Project owner; original email retained outside the repository |

## Scope actually granted

Answer each from the document itself. Do not infer.

| Question                                                                                             | Answer                                                   |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Covers automated/API access to the service?                                                          | Yes                                                      |
| Covers the fresh crawl performed on 2026-10-05 (see below)?                                          | Yes                                                      |
| Covers republishing **factual** fields (name, coordinates, locality, region, country, id, backlink)? | Yes                                                      |
| Covers republishing **user-authored spot write-ups**?                                                | Not relied upon; write-ups are excluded from this import |
| Any attribution requirement?                                                                         | None                                                     |
| Any expiry or revocation terms?                                                                      | None stated                                              |

### The write-ups are a separate question, and consent from Keyup may not settle it

The spot descriptions are authored by the site's **users**, not by Keyup. Keyup's
own terms may grant Keyup a licence to _host_ that text; a licence to host is not
a licence to _sublicense_. Unless the consent document contains a clause
specifically confirming Keyup holds redistributable rights in user-contributed
content, consent from Keyup does not make republishing those write-ups lawful —
it makes it an infringement of thousands of third parties who never agreed to
anything.

Separately, measured over the fresh corpus: **1,439 records name a recognised
retail or venue brand**, and that regex is a floor, not a ceiling — local
businesses are not caught. Publishing
_"the toilets in &lt;named business&gt; are a cruising spot"_ is an assertion about an
uninvolved third party that cannot opt out. `safety_gated` does not address this;
it is a signed-in gate, and signup is free.

The importer therefore keeps prose **off by default** and requires both
`--include-prose` and `GAYS_CRUISING_PROSE_ACK` to be set before it will emit a
description. That is a deliberate speed bump, not a legal opinion.

## Provenance of the data we hold — read this before writing any attribution

**This is our own crawl, not a dataset supplied by the rightsholder.**

On **2026-10-05** this machine ran `crawl-gays-cruising.mjs`, a one-time browser
crawler that issued **58,618 JSONP requests** to

```
https://www.gays-cruising.com/api/?op=obtenerZonaInfoWidget&id=<n>&idioma=en
```

at **concurrency 16**, over spot ids harvested from the three Spanish
approved-spot sitemaps. It wrote 58,578 usable factual records and 40
`source_not_found` records to a resumable JSONL checkpoint. Descriptions were
discarded before persistence.

So the correct phrasing everywhere — in `metadata.source_terms`, in any public
attribution, and in any correspondence with Keyup — is
**"crawled by us under consent ref &lt;X&gt;"**, never _"supplied by Keyup Studio"_.
The one artifact whose entire job is provenance must not misstate it.

## What is NOT authorised by this record

- Enabling `supabase/functions/source-gays-cruising/` on a schedule. That is a
  recurring crawler and needs its own decision. `src/lib/__tests__/gaysCruisingLicence.test.ts`
  fails the build if a migration registers it in
  `cron.schedule` / `admin_automations` / `ingestion_sources`, or if
  `config.toml` gains a `[functions.source-gays-cruising]` block.
- A further re-crawl of the API. The approved one-time corpus is on disk at
  `out-gays-cruising/enriched_spots.jsonl`
  (sha256 `6913bad729744d1f22ec8ebcae987c45cfbe257ef0b5c36e2d7f0e775ff7fec9`).

## Review

|                |                                                         |
| -------------- | ------------------------------------------------------- |
| Record written | 2026-10-05                                              |
| Written by     | Claude, during the import work — **not a legal review** |
| Reviewed by    | Project owner, 2026-10-05                               |
