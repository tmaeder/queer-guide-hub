# Jev automation across Review queues

Approved by the owner on 28 October 2026. Extend the existing review system with a scheduled, service-only Jev evaluator rather than a recommendation-only interface or a generic approval bot.

Every active source participates in a durable, fair work queue. The worker loads current records and source evidence, asks independent typed questions, and selects only explicit queue-specific actions. Evidence support and conflict checks are separate from model confidence. Missing sources trigger bounded research; conflicting facts, consent, private membership and mandatory human judgments remain visible with concrete blockers. Never label a machine decision human-reviewed.

Apply source decisions transactionally with leases, current input fingerprints, source locks, provenance, before/after audit and idempotency. Temporary upstream failures retry with backoff; exhausted cases remain visible. Reopen evaluation when source inputs change. Configuration failures are operational failures, not evidence blockers.

Keep a bounded five-minute schedule and admin pause control. Validate malformed model answers, stale decisions, concurrency, queue coverage, privacy exclusions, evidence absence, idempotency and atomic rollback before enabling writes. All secrets remain server-side.

Official contracts: https://docs.typesafe.ai/api/system-one.md and https://docs.typesafe.ai/confidence.md. Jev evaluates supplied state; source retrieval and action execution belong to application code.
