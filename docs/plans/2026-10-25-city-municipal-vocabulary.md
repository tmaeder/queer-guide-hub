# Precise municipal classification vocabulary

The largest remaining research cohort contains unresolved city classifications. A fresh audit of 276 records with existing Wikidata identifiers found 21 records whose current name, country and coordinates already agree with the source, but whose municipal classes were absent from the shared classifier. This change recognizes exact local municipal forms rather than weakening identity or location checks.

Recognized forms: Ontario lower-tier and township municipalities, Quebec parish/township municipalities, Michigan charter townships, Italian `comune`, and Hungarian cities with county rights. Do not infer municipal autonomy from generic locality, township, borough, upper-tier municipality, district, administrative city or regional container labels. New vocabulary refuses conflicting historical, archaeological, ghost-town and subdivision classes.

Semantic sources:
- Ontario municipal organization: https://www.ontario.ca/document/ontario-municipal-councillors-guide/5-municipal-organization — local lower-tier municipalities include townships; upper-tier counties and regions remain distinct.
- Quebec municipal status symbols: https://statistique.quebec.ca/statistiques/divisions-territoriales/sym_municipalites_an.htm — parish and township municipalities are local municipal forms.
- Michigan municipal directory: https://milivcounty.gov/municipalities/ — charter townships are included as municipalities.
- Italian local-government law, article 3, reproduced by Ciampino municipal police: https://www.polizialocaleciampino.it/testo-unico-degli-enti-locali-tuel/ — comune is the autonomous local authority.
- Hungarian statistical office: https://www.ksh.hu/news_2608072 — towns with county rights are settlements, distinct from counties.

Verification: 10 Node classifier tests and six Deno source-evidence tests passed. Fresh Wikidata captures produced 21 eligible proofs. The existing safeguarded SQL operator was rehearsed with rollback before applying all 21 factual classification corrections: 20 passed native geography verification; one retains geography review. Independent full-row comparison confirms all 21 protected city projections and other field provenance are unchanged. No coordinates, country, content, relationships or publication fields were edited. Full source payloads, hashes and timestamps are retained in local evidence; native classification provenance retains the source URL, hash, coordinates, previous classification and evidence contract.

After native queue refresh, 20 of the 21 affected cities have no active worklist case. South Dundas retains its geography case. The total refreshed worklist was 5,774; concurrent ingestion means the affected-record check, rather than the overall count delta, is the reliable measure of this repair: 20 cases removed.
