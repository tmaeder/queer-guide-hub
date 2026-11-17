# Review queue continuation — 17 November 2026, pass 7

This pass applies **21 audited record repairs** and retires **24 superseded business findings**. All **nine native business merges** were independently checked against their expected survivor and active source audit; no open, non-waived fail/pending findings remain on those nine donors.

The user's checkpoint was 2,769 cases. The first live count was 2,946; a subsequent grouped snapshot had 2,976. The worklist refresh completed and the **17:18:57 UTC (18:18 Zurich)** snapshot has **2,940 active cases**. The queue is live: ingestion and scheduled research contribute to these changes. These counts are not attributed solely to manual repairs.

## Source-backed changes

The nine merged business profiles are Alibi Club Rome, Bee Kök & Bar Gothenburg, Believe Barcelona, BJ's White Swan London, Blue Club Metz, Boys Bar Barcelona, Celebrities Vancouver, City Sauna Bergamo and Den Draak Antwerp. Current official identity/address or exact shared phone/domain evidence supports each decision, alongside the existing donor-venue merge. All profiles are unclaimed, venue-only and in the same canonical city/country; the transactions reject additional distinct venue, merchant or news-source relationships.

Native gap fills were restricted to exact independently corroborated fields. Alibi received its official website, Bee a factual description, Believe its published shared inbox and City Sauna its published shared inbox. The other canonical profiles stayed byte-for-byte unchanged by their merge. Four independent missing-field repairs supplied Blue Club's current shared contact email and factual descriptions for The White Swan, Celebrities and FLEX Los Angeles. These avoided copying uncorroborated older contacts, pricing/crowd claims and club-size superlatives.

Believe's listed domain redirects to an unrelated gambling page. Its current official contact site confirms Balmes 56, the existing telephone and shared inbox; both venue and business now use the current official website. Den Draak's venue and business had no website; both now point to its official site at the exact Draakplaats 1 address. The duplicate's shortened link was not transferred.

The White Swan's official footer publishes a different shared telephone and a general/venue-hire inbox. Both records now use those contacts. The old phone was machine-inherited; there was no human contact provenance. Trigger-derived `phone_e164` and `email_lower` changes were separately asserted, with all other fields preserved.

Blue Club's old directory description made unqualified crowd claims and described Sunday drinks. Its venue and business descriptions now state the exact address, facilities and three soft drinks plus unlimited water explicitly listed on the current official site. The old Spartacus provenance remains recorded as non-winning; new provenance is machine-source review.

## Remaining evidence holds

The bounded candidate reads covered 48 business candidates, with 32 captured source URLs. This is not an individual review of all remaining cases.

Chakran and FLEX donor profiles have additional venue relationships. Their merge attempts were rejected by preservation guards and rolled back; no relationship guard was weakened. FLEX's independently supported branch description was still supplied. Discus's proposed merge still includes an unverified donor pin. Connection's shared shop/club identity needs further scope confirmation.

Eagle Manchester's official contact page publishes a taxi company's phone, not the proposed venue phone. That number was not copied. Eagle Amsterdam's proposed phone and older description were not fully corroborated by its current programme. Eagle Torremolinos, Fire London and Carré Rouge do not publish the proposed inbox in the retrieved official text. Fire supplies contact forms instead.

Boiler Room's supplied .com domain now serves unrelated content, while reopening/relocation reports need current first-party corroboration before changing the venue's address or identity. Brunos has an inaccessible certificate-invalid domain and closure reporting; neither current operation nor a replacement identity was certified. 1181, Artbridge and Delta had TLS/connection failures; Boot Rack supplied no readable website text. No TLS, access or rate-limit bypass was used.

## Reconciliation and verification

Every committed record repair first passed a rolled-back transaction with row locks, expected-state and claim/provenance checks, exact native gap-fill assertions and before/after preservation checks. Full records are in `admin_review_repairs`; merge/source history is in `entity_merge_audit`. The final audit confirms 9 merge rows, 4 independent profile-fill rows, 4 website rows, 2 contact rows and 2 current-description rows: **21 total**.

The general native finding reconciler timed out while selecting candidate organizations. An enclosing merge transaction rolled back cleanly, after which the verified merges were committed separately. A smaller reconciliation attempt skipped because another run held its native lock; a later attempt also timed out. No global timeout or persistent function was changed.

For this verified cohort only, the existing lifecycle bookkeeping was applied to the nine explicit donor/survivor UUID pairs. It retained the same advisory lock, canonical-duplicate checks, non-waived fail/pending scope, `business_brand_quality_events` audit records and donor quality summaries. The targeted transaction first passed rollback validation, then retired exactly 24 findings; a separate read confirms 24 superseded findings and zero open donor findings. The general candidate-selection performance issue remains unresolved.

The worklist refresh completed in 26.6 seconds. Queue-top refresh returned its normal “another refresh holds the lock” skip. At the final snapshot, missing source (1,019), source URL (625) or actionable proposal (535) accounts for 2,179 cases, about 74% of the worklist. Other large blockers remain conflicting identity (234), unavailable source (143), source authorization (120) and insufficient confidence (59). Queued, visual-review, protected-review, retry and incompletely classified cases remain visible.

This pass changes production data and audit documentation only. It introduces no runtime, schema, source-authorization, confidence, publication or human-review policy change and makes no new worker-runtime claim. JSON parsing and staged diff checks validate the documentation; no new runtime test result is claimed. Exact decisions, IDs, sources, hashes and limitations are in [the source manifest](review-queue-source-research-2026-11-17-pass7.json).
