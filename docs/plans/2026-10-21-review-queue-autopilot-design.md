# Review queue automation and decision context

The user requests direct autonomous cleanup, faster automatic correction/enrichment, and complete information on the remaining decision page. Routine choices are inferred from the existing workflow and live evidence.

## Approach

A UI-only redesign leaves recurring junk untouched; lowering approval thresholds would publish unsupported content. Use evidence-based intake rejection and bounded reconciliation alongside an evidence-first decision workspace.

- Stop uncited city hooks and seasonal claims and country-only local LGBTQ ratings before they become pending decisions. Keep machine decisions and their reasons in the audit history.
- Reconcile outdated image observations only when their specific URL no longer belongs to the event. This retires obsolete evidence, without declaring replacement images valid.
- Resolve already-corrected missing-country findings automatically. Keep ambiguous geography and unsupported closure claims for source investigation.
- Fetch live record context for special review workflows. Present the question, source quotes/links, current versus proposed fields, missing evidence, confidence and timestamps before secondary metadata. Preserve inline corrections, existing consequences and safety gates.
- Run bounded cleanup every five minutes, with concurrency protection and machine-labelled outcomes. Never equate confidence with source verification.

## Verification

Exercise intake rules against country-only and local citations; prove that genuinely sourced proposals remain reviewable. Test the decision page with complete, missing and failed context. Dry-run and verify database cleanup counts and idempotency before shipping the changes.
