# Enrichment spec — history-import Stage B

You are enriching one chunk file of raw LGBTQ-history timeline entries
(`raw/chunks/<name>.json`) into seed-shaped milestone entries
(`enriched/<name>.json`). Read the whole chunk, then write the output file as a
single JSON array. Output entries in the same order as the raw entries they
came from.

## Input entry shape

```json
{ "source": "schwulengeschichte|wp-…", "source_url": "…", "year": 1990,
  "section": "heading context", "text": "raw entry text" }
```

## Output entry shape (one or more per raw entry — or zero if skipped)

```json
{
  "ref": "<chunk-name>:<raw-index>",
  "title": "Switzerland votes to equalize the age of consent",
  "description": "1–3 original English sentences.",
  "date": "1992" | "1992-05" | "1992-05-17",
  "date_end": "…optional, same formats…",
  "country_code": "CH",
  "country": "Switzerland",
  "city": "Zurich",
  "region": "",
  "category": "uprising-movement|law-equality|law-decriminalization|law-criminalization|depathologization|persecution-destruction|other",
  "impact": "positive|neutral|negative",
  "significance": 3,
  "sources": [{ "label": "…", "url": "…" }],
  "needs_review": false,
  "skip_reason": "only when the entry should NOT be imported"
}
```

`ref` is mandatory on every output entry (including skips) so coverage can be
audited: every raw index 0..N-1 of the chunk must appear in ≥1 output entry.

## Rules

### Direct-extract sources (ext-* — the added third-party timelines)
Some subagents fetch a live web page or PDF directly instead of a pre-parsed
chunk. For those: extract every datable LGBTQ-history event on the page, then
write output entries with `ref` = `<source-slug>:<sequential-index>` (0,1,2…).
There is no coverage requirement — just capture the real events. Everything
below (original English wording, dates, categories, significance, sources,
skips) applies identically. These sites are **copyrighted editorial content**:
extract only facts (who/what/when/where) and write your own original English
prose — never copy or closely paraphrase their sentences. Cite the page URL in
`sources`.

### Language & copyright (load-bearing)
- `title` and `description` are **English**, written by you **from the facts**.
- **Never translate or closely paraphrase the German schwulengeschichte text**
  — extract the factual event (who/what/when/where) and write your own
  original sentence(s). Sentence structure and phrasing must be yours.
- Wikipedia text is CC BY-SA: also rewrite in your own words; attribution goes
  in `sources`.
- Direct factual voice (project copy rule): no "discover/explore/amazing";
  no editorializing ("a landmark moment"); state what happened.

### Validator language sniff (practical constraint)
The validator rejects titles/descriptions containing these literal words —
even inside proper nouns: `und`, `wird`, `wurde`, `nicht`, `eine/einen/einer`,
`gegründet`, `schwule(n/r)`, `zum ersten Mal`, `Zeitschrift`, `Verein`.
Refer to organizations/magazines by their distinctive name without German
generic words (write "the magazine Der Kreis", not "die Zeitschrift Der
Kreis"; "the Freundschaftsbund association", not "…-Verein").

### Dates
- Base the date on the raw text. `year` field of the raw entry is the
  authoritative year unless the text clearly states another.
- If you are confident the source misfiled the year of a well-documented
  event, use the correct year AND set `needs_review: true`.
- Use day precision (`YYYY-MM-DD`) only when day+month are in the raw text (or
  you are certain of the date of a globally documented event, e.g. Stonewall =
  1969-06-28). Month in text → `YYYY-MM`. Otherwise → `YYYY`.
- **Never invent a day or month.** When unsure, use year precision.
- Multi-year processes ("built 1970–1975"): `date` = start, `date_end` = end.
  `date_end` is equally valid for multi-day events (conferences, riots).
- Skip (with `skip_reason: "pre-1000"`) anything before year 1000 CE — the
  schema and frontend are 4-digit-CE only. BC/BCE entries are always skipped.

### Splitting multi-jurisdiction entries
Raw entries like "Came into effect: Netherlands (with joint adoption),
Germany (…)" list one legal change across several jurisdictions. Emit **one
output entry per country** (same `ref`), each with its own `country_code`.
Sub-national jurisdictions (US states, Canadian provinces, …): use the parent
country's `country_code` and name the jurisdiction in title + description; if
several states of the same country are listed together in the same raw entry,
one combined entry for that country is fine. Overseas territories use the
parent country's code (UK territories → GB). If a country inside a
multi-jurisdiction list already got its own entry from another raw entry in
this chunk, silently omit that country from the split (coverage via the other
countries is fine).
"Passed" and "came into effect" of the same law are distinct milestones — keep
both when both appear, with titles that make the distinction explicit
("… passes …" vs "… takes effect …").

### Countries & cities
- `country_code` = ISO 3166-1 alpha-2, uppercase. Leave `""` for genuinely
  global/multi-country events (e.g. WHO depathologization → `""`).
  Historical states: use the closest present-day code when the location is
  unambiguous (Prussia→DE, USSR→RU, Batavian Commonwealth→NL); else `""` and
  name the state in the description.
- `country` = English display name matching the code.
- `city` only when the event is tied to a specific city. schwulengeschichte
  entries: Swiss events get `country_code: "CH"`; German/Austrian/international
  entries on those pages get their own country.

### Category
- laws/ballots/court rulings expanding rights (marriage, partnership, adoption,
  anti-discrimination, age-of-consent equalization, gender recognition) →
  `law-equality`
- decriminalization of same-sex acts → `law-decriminalization`
- new criminalization/tightening → `law-criminalization`
- removal from disease classifications, conversion-therapy bans →
  `depathologization`
- protests, riots, prides, movement/organization foundings, first CSDs →
  `uprising-movement`
- persecution, raids, registries, murders, destruction of archives/bars,
  executions → `persecution-destruction`
- culture, media, sport, religion, firsts-in-office, research, people →
  `other`
- *pathologization* (adding homosexuality to disease classifications) has no
  own category: use `other` + `negative`.
- Multi-step legislative processes (commissions, drafts, chamber debates
  toward one legal change): procedural steps are `other` + `neutral` (low
  significance); only the decisive approval/referendum/entry-into-force gets
  the `law-*` category.

### Impact
`positive` = rights/visibility gained; `negative` = persecution, criminalization,
setbacks, murders; `neutral` = descriptive/mixed (e.g. a person born, a study
published, an organization dissolved amicably).

### Significance (be honest — most entries are 1–3)
- **5** — globally pivotal: Stonewall, first country to legalize same-sex
  marriage, WHO declassification, Hirschfeld's institute founding/destruction.
- **4** — major national turning point: a country decriminalizes, legalizes
  marriage, first national pride; landmark supreme-court rulings
  (Lawrence v. Texas, Obergefell).
- **3** — notable national first or major national organization/event: first
  openly gay MP/minister of a country, national referendum, founding of a
  national umbrella org (Pink Cross), civil-union laws of smaller scope.
- **2** — regional/local milestone with lasting effect: city's first pride,
  important venue/center opening, regional court ruling, sub-national laws.
  Sub-national events default to 2; raise to 3 only when nationally
  consequential (e.g. the first state/province of a large country to legalize
  marriage — Massachusetts 2004, Ontario 2003).
- **1** — minor local event: local group founded, choir named, local magazine
  renamed, individual comings-out of local figures.

### Sources
- Always include the raw entry's `source_url`.
- schwulengeschichte label: `"schwulengeschichte.ch — Zeittafel <period>"`.
- Wikipedia label: `"Wikipedia — <page title> (CC BY-SA 4.0)"` with the
  wiki page URL (e.g. `"Wikipedia — Timeline of LGBTQ history, 20th century
  (CC BY-SA 4.0)"`).

### Skips (`skip_reason`, entry otherwise minimal: ref + skip_reason only is fine)
- `pre-1000` — before 1000 CE.
- `not-lgbtq-history` — navigation cruft, legend/map text, unrelated content.
- `unverifiable` — you cannot tell what event is meant.
- `person-note` — pure birth/death notes of non-pivotal individuals with no
  event character (famous figures' births MAY stay as significance 1–2 `other`
  entries if the raw source presents them as timeline entries).
- `duplicate-in-chunk` — the same event appears twice in this chunk (keep the
  more detailed raw entry).

### needs_review
Set `true` when you are unsure about the date, the country, the
classification, or whether the event is real/notable. These import as
`review_status='pending'` for admin triage.
