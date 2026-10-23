# Stop speculative tag prose

The native search-intelligence service rejected **33** unsolicited proposals: **18** rewrites of human-reviewed definitions and **15** unattributed, low-confidence generated descriptions. This rejects proposals without declaring their claims factual or publishing replacement prose. One separate approved translation retry remains protected from this policy.

All 33 rejections have `search_audit_log` before/after records with a null system actor. The complete affected tag records have the same MD5 before and after (`2e29ce889a136ec337d12fc9355c35f0`). No original descriptions, identifiers, ownership flags or other tag fields changed. The tag-enrichment queue went from 34 to 1.

An internal-secret invocation previously produced actor ID `internal`, which cannot be stored in UUID reviewer/audit columns. Search-intelligence now maps system invocations to its existing service-role actor path while retaining real original actors. Optional expected status and update timestamp protect automatic rejections from changing a proposal reviewed concurrently. The internal rejection/stale-revision endpoint regression passes. The focused endpoint was deployed as version **91**, with JWT verification retained and all seven remote shared files preserved exactly.

`reject-ungrounded-tag-prose.sql` defaults to dry run and processes at most 20 requests through that native endpoint. It preserves approved/human-owned suggestions, existing review notes and other models/workflows. Its HTTP writes commit independently; SQL rollback does not undo remote decisions. Native status and revision checks make a repeat safe.

The producer now skips unsupported model definitions when source lookup fails, and advances only the derived scan cursor for reviewed or ungrounded existing prose. It makes no inference request and creates no proposal in those cases. Source-backed enrichment, native ownership guards and genuine review paths remain. The mocked producer regression and all 16 existing actor/ownership tests pass; typecheck and scoped ESLint pass. Producer deployment and final integration verification are tracked separately from the already completed rejections.
