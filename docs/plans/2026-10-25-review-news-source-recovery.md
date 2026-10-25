# Recover truncated news before requesting an editorial decision

The October 25 production probe found 98 pending articles blocked only by `truncated_body`, including 74 with no extraction attempt and otherwise passing machine decisions. They already have enriched/completed status, while the normal full-text node only selects pending enrichment. Recovery must address that scheduling gap without treating a fetch as approval.

## Contract

The existing extractor accepts an internal `repair_truncated` mode, claims at most four untouched eligible news rows, and checks only the captured public source URL. A five-minute lease with source and verdict fingerprints prevents stale workers or human-review races from overwriting changes. A crashed worker gets one retry. A completed unsuccessful attempt preserves the original article and verdict and stops automatic recovery.

Only a matching publisher headline and materially longer source text (280–100,000 characters, over 1.2 times the original length) can replace content. The fallback validates every redirect, caps downloaded HTML at 3 MB, and parses actual document metadata. Neither a failed fetch nor an identity mismatch can substitute content or markdown.

Recovery clears the stale verdict, keeps automatic publication false, preserves disposition, review state, enrichment state, headline, metadata and relationships, and requires a fresh native quality check. Both successful recovery and no-gain completion journal complete before/after values. Claims, requests, recovered text, and actual source dispositions remain separate measurements.

The existing five-minute automatic review cleanup enqueues source recovery and fresh quality work with bounded native requests. Existing pause control and browser denial remain authoritative. No new cron or user automation is introduced.

## Decision context

The news preview displays the actual recovered content and reports running recovery, quality pending, unsuccessful matching, and exhausted interrupted attempts. It includes publisher headline, captured URL, character counts and attempt time. Remaining manual work states what evidence the reviewer should check.

## Verification

PostgreSQL fixture exercises strict eligibility, paused/dry/zero runs, batch cap, leases and retry cap, immutable state, human races, idempotence, no-gain preservation, audit values, fresh-quality enqueue and browser denial. Deno tests cover title and material-gain checks, private/credentialed URLs, HTML identity, redirects and byte limits. Component tests cover fresh-quality and failed-source information and expired attempts. Production eligibility was measured with transaction-local functions and rolled back; no source dispositions were claimed from that probe.
