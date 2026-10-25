# Correct production E2E failures and bound contact validation

The production suite found four viewport failures because Terms moved inside a collapsed footer section. Keep it visible beside Privacy with the existing 44px target. The village editor also tried to resolve its selected city from a capped country option list; load the current FK directly, preserving country/duplicate constraints and cancelling stale lookups without changing stored fields.

The intermittent author-page contrast failure matches a newly enabled pagination button fading from its disabled opacity. Keep opacity and color changes immediate; retain press and shadow transitions.

The first contact registration attempt stopped during its dry run with a statement timeout. Native reconciliation confirmed all 57 phones remained empty and no Overture source records were registered. Materialize only this venue's supplementary source rows before expensive capture validation, preventing the planner from validating unrelated captures. Preserve every source-contract, evidence and ownership condition. Require the performance migration before registration.

Validation: 14 frontend tests passed; targeted lint passed. PostgreSQL tests passed 28 real malformed-capture cases, 10,000 unrelated-source work-bound cases, and the actual phone writer's positive and protected ownership cases. Source captures are refreshed before any write. Production replay and full E2E follow normal deployment.
