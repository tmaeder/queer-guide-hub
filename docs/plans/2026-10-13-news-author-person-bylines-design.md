# Correct person attribution

The approved byline management feature must list people. User correction: URLs, Editors, podcast brands, and networks are not person names.

Keep source and publisher attribution separate. Reject explicit Organization JSON-LD authors and known collective/URL credits; fall through to the next real byline candidate. Never substitute hosts or infer a person from a Facebook ID. Do not impose two-word or Latin-script naming requirements.

Stop API publisher-name fallbacks. Apply the same conservative rules to RSS, sanitization, and database writes. Preserve rejected original bylines in staff-only audit records before clearing them, leaving every article and source intact. Backfill named authors only from source evidence.

Classification cannot prove that every plausible string is a person. Avoid speculative renaming; retain existing plausible names, including pseudonyms and mononyms.

Production cleanup is enforced in the database and ingestion path. Keep the existing frontend: the optional new client policy import caused an unverified cold-start failure during release, and was removed. Rename/merge still rejects non-person names through the guarded server RPC.
