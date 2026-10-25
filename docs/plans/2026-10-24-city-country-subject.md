# Country ISO statements attached to the wrong subject

Dutch settlements name Q55 as their country. Q55's NL ISO statement is deprecated because its intended subject is Q29999 (Kingdom of the Netherlands), which has the current NL statement. Ignoring deprecated claims correctly withheld identity, but left hundreds of otherwise corroborated cities unresolved.

The resolver follows only an explicit P8327 intended-subject declaration. The target must be the unique current parent of the original country and independently have one unambiguous current matching ISO code. Future, ended, scoped and conflicting evidence remains unresolved. This is one hop, bounded and cached, without a country-specific exception. Corrected multi-country candidates require every country to agree. Class, coordinate, exact-name, ambiguity and ownership checks remain unchanged. Probe evidence records both country identities.

Source: https://www.wikidata.org/wiki/Property:P8327 and the current Q55 / Q29999 claims.

Validation: 29 resolver tests pass; the native function entrypoint type-checks and scoped lint passes. Selective native deployment is v291, revision 2026-10-24.corrected-country-subject. Only the resolver, its new helper and the revision string changed in the fresh remote bundle; authentication and unrelated modules were preserved. No city quality synchronization or cron change was performed.

The recovery driver supports a strict ISO country filter, an existing blocked reason and a strict UUID exclusion file so the unknown sixth-campaign receipt remains quarantined. Default execution remains dry-run and journals all native request identities before submission. Native rollout results are recorded in outputs/city-netherlands-corrected-country-*.json.


The first native pilot persisted two corroborated identities and left Woerden ambiguous. The subsequent country campaign returned 445 processed, 377 updated and zero failures. A main release overwrote the function during the campaign, and its final 65 completed receipts report the old revision with no updates. That cohort is being recovered separately after restoring v293 (same tested code/hash as v291). The driver now accepts --expect-revision and stops before the next batch if a response reports different deployed code. It also rejects reused journal paths. The twenty unknown identities from the sixth campaign remain excluded throughout. No manual city-quality synchronization was run.
