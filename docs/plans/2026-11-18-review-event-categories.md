# Review event category repair

The owner has authorized fixing the remaining Review cases and the causes of repeated blockers. The live category action catalogue contains sixteen hardcoded values, including inactive `theatre`, `karaoke` and `bingo`, while omitting active `networking`, `community`, `theater` and others. A valid source-supported classification can therefore be unavailable to the reviewer, and a stale option can fail the managed taxonomy trigger.

Use the active `event_types` table for this exact catalogue, with deterministic slug ordering and the managed name/description in each option. A second hardcoded list would drift again; expanding the allowed choices without checking active taxonomy would still propose invalid writes. Preserve the current source, confidence, human-history, lease and apply gates. Do not retry protected or source-unauthorized cases or invent a model verdict.

Include category candidates in the context input hash so activation, deactivation or wording changes invalidate in-flight decisions. Test the real migration and context in isolated PostgreSQL, including active/inactive and newly added choices, stable ordering, stale taxonomy, unchanged protected contexts and the existing transaction/refusal suite. Independently researched factual category repairs remain machine-attributed and retain earlier findings as history.
