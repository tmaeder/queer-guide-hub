# Geography verification and territory codes

The live CMS verifier compares the assigned country code and Natural Earth result with strict string equality. Fort-de-France is correctly assigned MQ while the country map returns FR. The existing containment validator explicitly requires geo_countries_equivalent as the sole country comparison, with MQ/FR already in the loaded territory mapping. This is a comparison inconsistency, separate from Beausoleil's actual FR/MC boundary conflict.

The user's standing instruction authorizes clear-evidence repairs and continued blocker fixes without repeated approval requests. Retain that scope: repair the existing comparator, preserve every other gate, and verify concrete live cases in rolled-back transactions.

Options considered: changing Fort-de-France to FR would erase the site's territorial organization; adding special MQ handling would duplicate the existing policy; using the established geo_countries_equivalent helper makes CMS consistent with the existing containment contract. Select the existing helper. Do not change its mapping, boundary data or 5km tolerance.

Change only the three comparisons that build country_match, the explanatory reason and the country_checked/review status in api_private.geo_cms_verify. Keep the public wrapper, internal/admin authorization, classification override, missing-coordinate handling, village-parent distance, source evidence and false identity/parent/queer-designation flags. Return the original assigned and polygon codes so equivalence remains transparent. Country equivalence is a boundary-data comparison, never human identity certification or a geopolitical reassignment.

Validate before and after in a transaction: Fort-de-France MQ/FR passes only the country check; Sosnowiec remains country_checked; Beausoleil FR/MC remains review; Lippen's classification gate remains review despite matching country; unprivileged callers remain denied. Test unchanged source rows. Ship through a reviewed migration, with no bulk re-verification or case deletion. Existing remote CI startup failures remain an external limitation, not a passed check.

