# City coordinate corroboration repair

The user has authorized research and repairs across the review queue, including recurring causes, and delegated clear evidence-backed editorial decisions without repeated approval. This correction stays within that scope.

San-Nicolao (Q731527, INSEE 2B313) had a stored point at 42.2259104, 9.550115. The French government's published commune polygon excludes that point and includes its published representative centre at 42.3687, 9.5068. PostGIS measures 16,258 metres between them. The existing Wikidata check nevertheless recorded agreement at 16.7 km because the city identity guard allowed 100 km. Santa Elena's existing point similarly falls tens of kilometres from the identified Ecuadorian city.

Use a 10 km limit for the existing city-to-Wikidata identity comparison. This retains the measured valid fixtures at 0–9.5 km and matches the existing review city discovery limit. Fetching country-specific municipal boundaries for every automated candidate would require additional source contracts, requests and operational controls; the current change keeps the existing retrieval and decision structure. The broad 100 km comparison cannot corroborate the newly researched counterexamples.

A refusal retains any existing identifier and representative point and stops adopting candidate facts; it does not decide which side is wrong. Genuine municipal representative points that differ by more than 10 km require source-backed review. Country, class, returned-entity name, missing-coordinate handling, source authorization, budget, consent and publication gates retain their existing behavior. The separate generic geography-link distance limit is unchanged.

Validation covers the actual San-Nicolao old and government-corrected points, Santa Elena's outlying point, the existing valid fixture cohort, near-boundary distances, unresolved namesakes, unavailable sources and the resolver returning a usable match after the point repair. Full edge and actual request-handler runtime suites check downstream behavior.

The production San-Nicolao repair is independently guarded by complete city/venue/business snapshots, no human city revisions or active leases, no saved/private city links, and government polygon coverage checks. Only its public city point and supported municipality classification change. All child points, publication/attention flags and human identity/parent verification gates remain; the obsolete coordinate verdict is retained in provenance and retracted for a real rerun. The old classification audit remains nested in the new evidence.

