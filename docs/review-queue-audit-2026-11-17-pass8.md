# Review queue continuation — 17 November 2026, pass 8

The superseded-business reconciler timeout is **fixed and deployed**. This pass also applies **23 audited record repairs**, including **six native business merges**, and the repaired native reconciler retires **18 superseded findings**.

The user's checkpoint was 2,940 cases. This pass first read 2,849; the refreshed **17:43:59 UTC (18:43 Zurich)** snapshot has **2,820 active cases**. Scheduled research and ingestion contribute to that movement; it is not a count of manually verified closures.

## Reconciler diagnosis and design

Production logs record SQLSTATE 57014 at the reconciler's `FOR` candidate SELECT, including the 17:10 and 17:16 UTC failures. The original plan starts with the organizations primary-key order, checks each organization's open findings and only then joins the canonical survivor. It estimates approximately 117,000 organizations and 107,000 eligible rows, although the observed empty backlog has no eligible rows. Exhausting an empty queue can therefore probe the live catalogue rather than the roughly 1,500 merged profiles.

Three approaches were considered: explicitly filter non-NULL duplicate links, materialize valid merged identities before the finding lookup, or add another partial finding index. The first predicate alone used the existing duplicate index but took 4.57 seconds in one cold read. A materialized merged-identity set completed a subsequent read in 0.40 seconds. Cache warmth and concurrent load differ, so these observations are not a controlled speedup benchmark. The query-only materialization avoids another write-maintained index and prevents the original join ordering.

Migration [20261117173045_bound_superseded_business_candidates.sql](../supabase/migrations/20261117173045_bound_superseded_business_candidates.sql) replaces only the candidate SELECT, with an exact-source anchor guard. It explicitly restricts non-NULL duplicate links and materializes the valid donor/survivor cohort before probing findings. PostgreSQL documents [CTE materialization and its optimization boundary](https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION).

Eligibility, waiver exclusions, deterministic UUID order, default 500/cap 2,000, row/advisory locks, dry runs, audit records and lifecycle writes are unchanged. Owner, SECURITY DEFINER, search path and grants remain unchanged. No timeout or global planner setting was raised. The filename matches the exact recorded production migration version.

## Production and regression verification

With the caller forced to generic-plan mode and an eight-second statement budget, the deployed function completed a 500-item dry run in **329 ms** and a 2,000-item write-mode check in **135 ms**. Both correctly found zero eligible work. Complete function readback matches the expected candidate-only replacement; anon/authenticated execution remains denied and service_role execution allowed. Normalized security-advisor findings are unchanged.

After the six verified merges below, the ordinary native reconciler examined six donors and retired **18 findings in 291 ms**, with its existing quality-event audits. The preceding rolled-back test retired the same 18 findings in 1.71 seconds. A separate read confirms all six expected survivor links and native source audits, 18 superseded findings and **zero open non-waived donor findings**.

The new [native fixture runner](../supabase/tests/isolated/run_superseded_business_quality.py) executes the actual original migration and candidate patch in a disposable PostgreSQL 17 cluster. The original lifecycle regression passes: dry run, producer hook, waiver preservation, live/canonical/self-cycle exclusions, idempotency and unmerged identity preservation. The new regression adds 60,000 live profiles with 120,000 open findings, 2,105 eligible duplicates, generic planning, default/capped/zero/negative batches, deterministic selection, audited writes and full canonical-record preservation. It verifies the original function ACL/owner/settings and the internal assertion call; authorization is stubbed locally and production grants/readback are checked separately.

A repeated test hit its five-second limit during full-catalogue JSON preservation comparisons, after the reconciler calls. Those comparisons now run outside the timed RPC block; the final fixture passes. The fixture is wired into the existing merge-policy CI job (CI PostgreSQL 16; local verification PostgreSQL 17). No unobserved CI success is claimed.

The new migration passes both repository parser versions (PostgreSQL 17 grammar 17.8.2 and current grammar 18.2.4) plus body-balance checks. Missing local parser packages were installed only in a temporary directory. Application dependencies are unchanged.

## Source-backed record repairs

Seven venue/business pairs have corrected municipality references:

- K1 Club and Nähkörbchen: Cologne → Düsseldorf. K1's actual official imprint confirms Bismarckstraße 93. The Altstadt directory confirms Nähkörbchen at Hafenstraße 11; historical municipality is corrected without asserting current operating status.
- Mylord: donor Baar/Zug → Zurich.
- Predigerhof and Reno's Relax: donor Winterthur → Zurich.
- Club Feathers: donor New York → River Edge/New Jersey.
- Circolo Fabrik: donor Florence → Calenzano/Tuscany.

The canonical Fabrik venue already references Calenzano. Its business still referenced Florence with a central-Florence pin. A fifteenth geography repair corrects that business municipality and withdraws its known-wrong pin to NULL. The existing canonical venue and its coordinate remain unchanged. Every other coordinate in the geography repairs is preserved, without a new exact-pin certification. No linked events required propagation at repair time.

Two independently sourced missing descriptions were supplied before merging. Predigerhof's proposed donor summary still said Winterthur; the official Zurich Tourism listing supports the factual Zurich description. Feathers' official site supports a neutral nightclub/address description, omitting uncorroborated floor/food claims.

Six duplicate businesses were then merged natively: K1 Club and Bar, the translated “Sewing basket”/Nähkörbchen, sauna mylord, Predigerhof Bistro Bar, Gay Sauna Renos Relax and Club Feathers. They are unclaimed venue-only profiles with the same corrected city/country and already-merged donor venues. Guards reject additional venue, merchant or news relationships. Their automatic field-transfer patches are empty; every canonical business profile is byte-for-byte unchanged by its merge.

All record repairs were first rollback-tested with expected-state, row-lock, claim/provenance and exact before/after preservation guards. Production audit confirms **15 municipality rows + two profile rows + six merge rows = 23**. The source manifest records exact entity IDs, URLs, retrieval times, hashes and allowed changes.

## Remaining holds and queue state

Fabrik's duplicate remains held because its next automatic gap fill would introduce an unverified donor coordinate. Hot Box's current Trégueux source conflicts with a Caen donor/pin; more history/identity evidence is needed. The Oberhausen source redirects elsewhere without readable venue evidence. Mother Lode's source fails DNS and metro-label cases remain ambiguous.

Predigerhof's own root, /en and discovered /impressum return 404; its municipality/description use official Zurich Tourism evidence. Nähkörbchen's own certificate is invalid and closure reporting exists; no opening-hours/contact/closure publication was inferred from an old directory. Both Zodiac domains redirect to Google, while current karaoke pages conflict with recent closure reporting. Bluepoint's source is parked/for sale; that is not venue confirmation. No unavailable source, TLS validation, source-authorization, ownership or human-publication gate was bypassed.

The queue-top refresh completed in 13.7 seconds. One worklist refresh hit its local 30-second budget while enrolling research jobs; a single retry with a one-off 45-second session budget completed in **17.9 seconds**. No persistent worklist timeout/function change was made.

The final blockers include missing source (992), missing source URL (623), missing actionable proposal (544), conflicting identity (225), unavailable source (141), source authorization (107) and insufficient confidence (52). Queued, visual/protected review, retries and unclassified cases remain visible. This bounded pass does not claim individual examination of all remaining cases or resolution of all database health alerts.

See [the pass 8 source and validation manifest](review-queue-source-research-2026-11-17-pass8.json).
