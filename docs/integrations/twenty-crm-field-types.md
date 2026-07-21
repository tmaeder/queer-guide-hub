# Twenty CRM: Feldtyp-Migration (2026-07-16)

Die `qg*`-Custom-Felder im Twenty-Workspace (crm.queer.guide) wurden von TEXT auf
korrekte Feldtypen migriert. Die Feld-**Namen** sind unverändert (Migration lief über
temporäre `*V2`-Felder mit anschließendem Rename), aber die **Payload-Formate** der
REST/GraphQL-Writes haben sich für die betroffenen Felder geändert.
`twenty-sync/index.ts` wurde im selben Zug angepasst (Helper `sel`, `msel`, `link`,
`igLink`, `email`, `phone`, `money`, `jsonText`).
> **Status-Korrektur (gleicher Tag):** Die Workspace-seitige Migration ist **nicht
> abgeschlossen**. Gemessen (2026-07-16): typisierte Felder existieren noch unter den
> temporären `*V2`-Namen und sind leer; die Daten liegen weiter in den Legacy-TEXT-Feldern;
> einige `*V2`-LINKS-Felder (villages, qgCities, qgCountries) haben Metadaten ohne
> DB-Spalte (List-Queries schlagen fehl). Ist-Zustand prüfen:
> `scripts/data-quality/twenty-schema-audit.mjs`. Migration abschließen:
> `scripts/data-quality/twenty-schema-repair.mjs` (Dry-run per Default; erst Backup,
> erst ein Einzelfeld testen). Danach beschreibt dieses Dokument den Zielzustand.

Die `qg*`-Custom-Felder im Twenty-Workspace (crm.queer.guide) werden von TEXT auf
korrekte Feldtypen migriert (über temporäre `*V2`-Felder mit anschließendem Rename;
die finalen Feld-**Namen** bleiben unverändert). Die **Payload-Formate** der
REST/GraphQL-Writes ändern sich für die betroffenen Felder.
`twenty-sync/index.ts` ist bereits angepasst (Helper `sel`, `msel`, `link`,
`igLink`, `email`, `phone`, `money`, `jsonText`) — **erst deployen, nachdem der
Repair durchgelaufen ist**, sonst schreibt der Sync Composite-Payloads in TEXT-Spalten.

## Neue Payload-Formate

| Typ | Vorher (TEXT) | Nachher |
|---|---|---|
| SELECT | `"active"` | Option-Value in UPPER_SNAKE: `"ACTIVE"`; unbekannte Werte werden von Twenty **abgelehnt** |
| MULTI_SELECT | `"venue, support"` | `["VENUE", "SUPPORT"]` |
| LINKS | `"example.com"` | `{"primaryLinkUrl": "https://example.com", "primaryLinkLabel": ""}` (Schema-Präfix nötig) |
| EMAILS | `"a@b.com"` | `{"primaryEmail": "a@b.com"}` |
| PHONES | `"+41 79 …"` | `{"primaryPhoneNumber": "+41 79 …", "primaryPhoneCallingCode": "", "primaryPhoneCountryCode": ""}` |
| CURRENCY | – | `{"amountMicros": 93150000, "currencyCode": "EUR"}` (Betrag × 1 000 000) |
| DATE / DATE_TIME | beliebiger String | ISO-String; **leerer String `""` ist ungültig** → Feld weglassen oder `null` |

## Migrierte Felder pro Objekt

- **companies**: qgStatus, qgClaimStatus, qgSource, qgProvider → SELECT · qgRoles → MULTI_SELECT · qgEmail → EMAILS · qgWebsite, qgLogoUrl → LINKS
- **people**: qgSource → SELECT · qgBirthDate, qgDeathDate → DATE · qgWebsite, qgImageUrl → LINKS
- **hotels**: qgType → SELECT · qgEmail → EMAILS · qgWebsite, qgBookingUrl → LINKS
- **qgEvents**: qgStartDate, qgEndDate → DATE_TIME · qgType, qgStatus, qgLiveness → SELECT · qgWebsite, qgTicketUrl → LINKS
- **venues**: qgCategory, qgSubtype → SELECT · qgClosedAt → DATE · qgEmail → EMAILS · qgWebsite, qgBookingUrl, qgInstagram → LINKS
- **companies**: qgStatus, qgClaimStatus, qgSource, qgProvider, qgLastSyncStatus → SELECT · qgRoles → MULTI_SELECT · qgEmail → EMAILS · qgPhone → PHONES · qgWebsite, qgLogoUrl → LINKS
- **people**: qgSource → SELECT · qgBirthDate, qgDeathDate → DATE · qgWebsite, qgImageUrl → LINKS
- **hotels**: qgType → SELECT · qgEmail → EMAILS · qgPhone → PHONES · qgWebsite, qgBookingUrl → LINKS
- **qgEvents**: qgStartDate, qgEndDate → DATE_TIME · qgType, qgStatus, qgLiveness → SELECT · qgWebsite, qgTicketUrl → LINKS
- **venues**: qgCategory, qgSubtype → SELECT · qgClosedAt → DATE · qgEmail → EMAILS · qgPhone → PHONES · qgWebsite, qgBookingUrl, qgInstagram → LINKS
- **newsArticles**: qgPublishedAt → DATE_TIME · qgSentiment, qgMediaType, qgCategory, qgLanguage → SELECT · qgUrl, qgCanonicalUrl, qgImageUrl → LINKS
- **products**: qgAvailability, qgPriceType, qgContentRating, qgDepartment, qgCurrency → SELECT · qgOwnershipTags → MULTI_SELECT · qgUrl → LINKS · **neu:** qgPriceMoney (CURRENCY, aus price_usd + currency)
- **qgCities**: qgOfficialWebsite, qgImageUrl → LINKS
- **qgCountries**: qgImageUrl → LINKS
- **villages**: qgWebsite, qgImageUrl → LINKS

Bewusst TEXT geblieben (offenes Vokabular / JSON / strikte Validierung): alle qgTags,
qgTargetGroups, qgAmenities, qgServices, qgVibeTags, qgAccessibility, qgLanguages,
event.qgCurrency, country.qgSameSexUnions / qgAdoptionRights / qgGenderRecognition /
qgConversionTherapy, **qgPhone** (Twenty-PHONES-Validierung lehnt Nummern ohne
Ländercode ab — ein invalider Wert würde den ganzen Sync-Record kippen) und
**companies.qgLastSyncStatus** (enthält freie Fehlermeldungen, nicht nur ok/error).
Bewusst TEXT geblieben (offenes Vokabular / JSON): alle qgTags, qgTargetGroups,
qgAmenities, qgServices, qgVibeTags, qgAccessibility, qgLanguages, event.qgCurrency,
country.qgSameSexUnions / qgAdoptionRights / qgGenderRecognition / qgConversionTherapy.

## SELECT-Optionslisten (Sync darf nur diese Werte senden)

Neue Enum-Werte in Supabase ⇒ zuerst Option in Twenty ergänzen (Settings → Data Model),
sonst schlägt der Write des Records fehl.

- companies.qgStatus: ACTIVE, INACTIVE, PENDING · qgClaimStatus: UNCLAIMED, CLAIMED, PENDING · qgSource: ORGANIZATION, MERCHANT · qgProvider: SHOPIFY_PUBLIC, WOOCOMMERCE_PUBLIC, CRAWL · qgRoles: VENUE, SUPPORT, SELLER, PUBLISHER
- companies.qgStatus: ACTIVE, INACTIVE, PENDING · qgClaimStatus: UNCLAIMED, CLAIMED, PENDING · qgSource: ORGANIZATION, MERCHANT · qgProvider: SHOPIFY_PUBLIC, WOOCOMMERCE_PUBLIC, CRAWL · qgLastSyncStatus: OK, ERROR · qgRoles: VENUE, SUPPORT, SELLER, PUBLISHER
- people.qgSource: PERSONALITY, USER, CONTACT
- hotels.qgType: BNB, APARTMENT, HOTEL, RESORT
- qgEvents.qgType: CONCERT, PRIDE, DRAG, PARTY, FILM, FETISH, PROTEST, FUNDRAISER, THEATER, SPORTS, SOCIAL, ART, WORKSHOP, FESTIVAL, CONFERENCE, FAIR, COMMUNITY, MEETUP, OTHER · qgStatus: ACTIVE, COMPLETED, CANCELLED, POSTPONED · qgLiveness: LIVE, CANCELLED, UNKNOWN
- venues.qgCategory: BAR, CLUB, SAUNA, CAFE, RESTAURANT, OUTDOOR, HOTEL, SHOP, COMMUNITY_CENTER, EVENT_VENUE, CRUISING, THEATER, SALON, GALLERY, ORGANIZATION, GYM, OTHER · qgSubtype: NUDE_BEACH, NATURIST_RESORT, HOT_SPRING, BNB, OTHER
- newsArticles.qgSentiment: POSITIVE, NEUTRAL, NEGATIVE, MIXED · qgMediaType: ARTICLE, PODCAST · qgCategory: GENERAL, POLITICS, CULTURE, SPORTS, TRANSGENDER, LEGISLATION, ADVOCACY, HUMAN_RIGHTS, HEALTH, EDUCATION, LIFESTYLE, RIGHTS, NEWS · qgLanguage: EN, DE, IT, FR, ES, PT, NL
- products.qgAvailability: IN_STOCK, OUT_OF_STOCK, UNKNOWN · qgPriceType: FIXED, STARTING_AT · qgContentRating: SFW, ADULT, EXPLICIT · qgDepartment: APPAREL, UNDERWEAR, SWIMWEAR, INTIMACY, BDSM_FETISH, HYGIENE, JEWELRY, BOOKS_ART, SERVICES, OTHER · qgCurrency: EUR, USD, GBP, AUD, CAD, SEK, CHF, NOK, DKK, JPY · qgOwnershipTags: QUEER_OWNED, TRANS_OWNED, WOMEN_OWNED, BLACK_OWNED
- products.qgAvailability: IN_STOCK, OUT_OF_STOCK, UNKNOWN · qgPriceType: FIXED, STARTING_AT · qgContentRating: SFW, ADULT, EXPLICIT, SUGGESTIVE · qgDepartment: APPAREL, UNDERWEAR, SWIMWEAR, INTIMACY, BDSM_FETISH, HYGIENE, JEWELRY, BOOKS_ART, SERVICES, OTHER · qgCurrency: EUR, USD, GBP, AUD, CAD, SEK, CHF, NOK, DKK, JPY · qgOwnershipTags: QUEER_OWNED, TRANS_OWNED, WOMEN_OWNED, BLACK_OWNED

## Behobene Datenbugs

- `qgGenderRecognition` (u. a.) enthielt `"[object Object]"` — jsonb-Spalten wurden via
  `String()` serialisiert. Fix: `jsonText()`-Helper (JSON.stringify für Objekte).

## Aufgeräumt im CRM

- Redundante TEXT-Felder (qgCity/qgCountry neben city/country-Relations, qgInStock neben
  qgAvailability, person.qgCompany/qgJobTitle neben Builtins) bleiben **aktiv** (der Sync
  schreibt sie weiter), sind aber aus allen Views/Layouts ausgeblendet.
- Archiviert (nicht sync-geschrieben, leer): products.qgPriceUsd, products.qgImageHint,
  qgCities.qgCountry (TEXT).
- Alte TEXT-Originale der migrierten Felder: archiviert als `<feld>Legacy`.
- Event-Relations city/country wurden aus den qgCity/qgCountry-Texten gematcht
  (Supabase `events.city_id` ist meist NULL, daher kam vom Sync nie eine Relation).
