# agendaq.fr — consent record

**STATUS: INCOMPLETE. Nothing may be staged or committed until the fields marked
`<!-- TODO -->` are filled in from the actual consent document.**

`scripts/data-quality/import-agendaq.mjs` reads `AGENDAQ_CONSENT_REF` from the
environment and exits if it is unset. That variable must hold the **Ref token**
below. The variable is not a password and nothing verifies its contents — its
job is to make enabling this an act that has to *name* the permission it relies
on, so "who said we could?" has an answer in the deploy config rather than in
somebody's memory. Same mechanism as `docs/licences/gays-cruising-consent.md`.

---

## Rightsholder

| | |
|---|---|
| Entity | Blue Savanah — SARL de presse, capital €70,000 |
| Registered | RCS 501 426 605 00033 — 3 rue de l'Arrivée, Tour CIT, BP 18, 75749 Paris 15 |
| Contact | contact@bluesavanah.com — +33 1 42 05 18 26 |
| Directeur de publication | Franck Desbordes |
| Service | https://www.agendaq.fr (data API: https://data.agendaq.fr/api/v1) |
| Host | OVH SAS, Roubaix |
| Stated terms | `/fr/legals` — **editor, publisher, host and cookie notice only** |

## Why consent is needed even though there is no prohibition to point at

This is the inverse of the gays-cruising case and must not be reasoned about the
same way. Keyup Studio's *Condiciones de Uso* §5 is an **express prohibition**;
agendaq's `/fr/legals` contains **no conditions of use at all** — no
reproduction clause, no API terms, no licence. Read on 2026-10-05 in full: it is
an editor/host/cookies notice and nothing else.

An absent prohibition is not a grant. Two French rights apply by default:

1. **Droit d'auteur** on the editorial prose — `descShort`, `desc`, and event
   `description`. Blue Savanah is a *société de presse*; this is its copy.
2. **Droit sui generis du producteur de bases de données** (CPI art. L341-1,
   L342-1). This is the operative one. It protects the *investment in the
   database* independently of whether any single fact is copyrightable, and it
   prohibits "l'extraction… de la totalité ou d'une partie **qualitativement ou
   quantitativement substantielle**" of the contents.

The planned extraction is **3,877 businesses and 16,433 events** — the whole
guide and the whole agenda. There is no reading of "substantial part" under
which that is not one. Individual facts (an address, a start time) are not
themselves protected, but the volume is the point: L342-1 is designed to catch
exactly a full-corpus copy of facts.

`robots.txt` allows `/fr/guide` and `/fr/agenda` with `Crawl-delay: 5`, and both
pages carry `robots: index,follow`. That is permission to **crawl and index**,
granted to search engines. It is not a database-right licence and must not be
cited as one.

## The consent being relied on

| | |
|---|---|
| Ref token | <!-- TODO: the value AGENDAQ_CONSENT_REF must hold --> |
| Granted by | <!-- TODO: name + role at Blue Savanah --> |
| Date | <!-- TODO --> |
| Medium | <!-- TODO: email thread / signed letter / contract — and where it is archived --> |
| Scope — entities | <!-- TODO: venues only? venues + events? the CeGIDD health directory? --> |
| Scope — fields | <!-- TODO: facts only, or does it cover the editorial prose? --> |
| Attribution required | <!-- TODO: exact wording and placement they require --> |
| Refresh permitted | <!-- TODO: one-off snapshot, or recurring re-sync? --> |
| Revocation / takedown | <!-- TODO: how they ask us to remove it, and our commitment --> |

## What the importer does by default, absent any consent on prose

Facts only. `--include-prose` additionally requires
`AGENDAQ_PROSE_ACK=i-accept-republishing-agendaq-editorial-prose`, so the
editorial copy cannot be swept in by someone running the obvious command. Without
it, these fields are **never read**:

- `data.descShort`, `data.desc` (business prose)
- event `description`, `descShort`

Imported regardless (facts): name, street address, postcode, city, region,
country code, latitude/longitude, category taxon, audience taxons, opening
hours, phone, email, website, social URLs, event name, start/end, timezone and
recurrence rule.

Images are **referenced, not mirrored**: `data.agendaq.fr` asset URLs are
recorded so nothing is copied to R2 until the scope row above says images are
covered.

## One thing the CeGIDD half is not

1,376 of the 3,877 rows are *Centres de santé sexuelle / CeGIDD* — France's
public sexual-health testing service. The underlying facts (a public clinic's
address and hours) are public-sector information and several are published
openly by the state. **That does not make agendaq's compilation of them free to
extract** — the database right attaches to their collection effort, not to the
facts. If the scope row above excludes them, re-source those from the French
open-data publisher rather than from here; do not quietly keep them because the
facts happen to be public.

## Verification

`src/lib/__tests__/agendaqLicence.test.ts` asserts the boundary in the repo
rather than in this document: the parser declares no prose field it reads by
default, the importer exits without `AGENDAQ_CONSENT_REF`, prose needs the
second acknowledgement, and no migration registers this source in
`cron` / `admin_automations` / `ingestion_sources`.
