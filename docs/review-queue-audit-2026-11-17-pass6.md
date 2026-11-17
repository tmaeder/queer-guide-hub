# Review queue continuation — 17 November 2026, pass 6

The user's checkpoint was 2,807 cases; this pass first read 2,800. The refreshed worklist reported 2,767 cases, and the later **07:30:17 UTC** snapshot had **2,769 active cases**. Scheduled processing and concurrent ingestion affect these totals. They are not a count of manually verified closures.

## Applied repairs

Production audit confirms **43 record repairs**, including **21 native business merges** and **54 superseded business findings reconciled**. The merge cohort was independently checked: all 21 donors point to the expected survivor, with 21 active source-backed native merge audits.

The merged business profiles are Les Thermes Marseille, Le Riad, Les Bains Lille, Paragonya, Halfway 2 Heaven, Fuse, Mother, Queer Britain, Le Bossuet, SLM Stockholm, SlutClub Hamburg, Sunnyday Basel, PumpJack Vancouver, Zum Pitter, Gear Berlin, Strong Madrid, former Les Thermes Toulouse, Apart Leipzig, Bar jeder Sicht, De Plak and El Brasi. Exact published identity/address evidence, same-city/country checks and already-merged venue relationships support these merges. Missing fields transferred only when independently corroborated; canonical profiles otherwise stayed unchanged. No claimed profile was merged.

Three independent missing-field updates supplied Gear Berlin's current shared support inbox, a factual Strong description and a factual Discus description. This avoided transferring an older Gear inbox or unsupported descriptive claims. Published shared contacts were used; no named employee contact was added.

Five venue/business pairs now have the correct municipality and region: Apart → Leipzig/Saxony, Bar jeder Sicht → Mainz/Rhineland-Palatinate, De Plak → Nijmegen/Gelderland, Il Cassero → Bologna/Emilia-Romagna, and El Brasi → Bochum. All existing coordinates were preserved; no new exact pin was inferred. No linked events required propagation at repair time.

Discus Sauna's business profile incorrectly referenced Dakar, Senegal; its canonical venue and official site identify Kriens, Switzerland. The business city/country/region now match Kriens. Its NULL coordinates and the canonical venue are unchanged. Existing triggers derive `safety_gated` from country risk plus the linked venue; that flag recomputed true → false under the unchanged native policy. The transaction asserted that exact consequence and preserved every other field except location provenance/update time. No country risk policy, human review or publication field changed.

Anónimo's Puerto Vallarta venue incorrectly linked to City Bar Vienna. It now links to the existing Puerto Vallarta business whose donor venue was already merged into it. The correct profile's primary venue link was repaired through native inheritance, allowing only exact existing canonical location values. Puerto Vallarta's official tourism directory corroborates the name and Rodolfo Gómez 157 address. The unrelated Vienna profile is byte-for-byte unchanged. An earlier Vienna business merge was inspected and is legitimate; it was not undone.

Three website/brand pairs were corrected. Le Riad's old domain serves a default WordPress placeholder; its current official Paris site confirms the same street address. Apart's old hostname fails DNS while apart.bar confirms Reichsstraße 16. Toulouse's old Les Thermes domain permanently redirects to L’éclipse's current site at the same 8 Place Belfort address and phone; both display names and websites now reflect L’éclipse. These are public-brand corrections, not assertions about legal ownership continuity.

## Why cases remain blocked

The latest snapshot has 994 missing-source, 631 missing-source-URL and 556 missing-action-candidate cases: **2,181 cases, about 79%** of the active worklist. Other holds include 249 conflicting identities, 139 unavailable sources, 107 source-authorization failures and 61 insufficient-confidence cases. Fifteen require visual review, eleven protected review, four retry, one queued, and one has no populated blocker/status.

A matching business name alone is insufficient when the native merge would also copy unsupported fields. Discus's duplicate remains held because its next automatic transfer includes donor coordinates that were not independently established. Cassero's donor also has a support role. Gear's registered office does not establish a current walk-in retail location. Les Salins has conflicting street addresses. Suspect cross-country business links and branch/operator relationships require stronger identity evidence. Unavailable, certificate-invalid, rate-limited and oversized sources were not bypassed. Exact sources, hashes, entity IDs and individual holds are in [the pass 6 manifest](review-queue-source-research-2026-11-17-pass6.json).

## Validation and limits

Every committed repair first passed a rolled-back transaction with expected-state/claim/provenance guards, row locks, exact native gap-fill assertions and before/after preservation checks. Full records are in production repair audits. This pass changes data and documentation only; it introduces no runtime code or schema changes.

At the pass's first read, the previously repaired image worker had 24 completed scheduled HTTP 200 requests and no failures since the prior timeout repair. The latest three observed runs (05:13, 05:18, 05:23 UTC) each processed 12 with zero failures or AI attempts. A newer follow-up query encountered a connector transport failure, so no claim is made about later unobserved runs.

The worklist refresh completed. Queue-top cache refresh attempts returned connector transport errors; their completion is unconfirmed. Direct worklist and repair-audit reads succeeded. The queue remains open; no confidence, authorization or protected-review requirements were lowered.
