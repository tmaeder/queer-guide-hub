-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261010061125 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
-- knowledge_base.slug is generated from name. The cosmetic WiFi -> Wi-Fi
-- spelling change altered two established lookup identifiers. Retain the
-- original accepted spelling to preserve both generated keys and source data.
SELECT set_config('app.actor','admin:preserve-wifi-vocabulary-identifiers',true);
UPDATE public.event_amenities SET name='WiFi',aliases=array_remove(aliases,'WiFi')
WHERE name='Wi-Fi' AND description='Wireless internet access';
UPDATE public.knowledge_base SET name='WiFi'
WHERE name='Wi-Fi' AND category IN ('event_amenity','attribute');
;
