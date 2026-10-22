# Review trigger release guard

Production migration history was checked immediately before editing:99991792694084 and99991792694100 are both unapplied. Only94084 needs a change:94100 already uses create-if-missing declarations and has no DROP statements. No applied migration is modified.

The94084 attachment block now compares all23 existing triggers against their exact normalized literal declarations, including relation, name, enabled state and full trigger definition. When every attachment matches, it skips the redundant DROP/CREATE block and avoids exclusive table locks during concurrent read-only schema dumps. A missing, disabled or changed trigger still executes the original full attachment block under the existing five-second lock budget. The preceding sweep-decoupling and schedule statements are unchanged.

Focused validation: the production catalogue comparison found23 attachments and zero mismatches; a synthetic definition mismatch was detected for each of the23. The actual DO guard was executed with its DDL body replaced by an exception: it compiled and skipped that branch successfully without changing production schema. All2464 migrations pass PostgreSQL17 grammar and body-balance checks. Literal CREATE TRIGGER declarations remain present for the unchanged schema drift scanner; its sentinel tests are also run.
