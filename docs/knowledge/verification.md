# Implementation verification — 27 November 2026

The pilot is prepared for review, not published. No hosted schema, edge function, content or scheduling changes were applied during implementation.

| Check | Observed result |
| --- | --- |
| Focused Vitest suite | 99 tests passed across 8 files |
| PostgreSQL 17 integration | Passed permissions, private drafts, stale/expired evidence, specialist gating, immutable membership, publication, approved-copy replacement, five-per-day cap and rollback |
| Full manifest import | All 30 drafts imported atomically into an isolated fixture database; repeated import was idempotent |
| Edge worker | Deno typecheck passed |
| Knowledge TypeScript diagnostics | 9 implementation files checked using the existing application compiler configuration; zero errors |
| ESLint | Changed implementation files passed |
| Production build | Passed; existing large-chunk warnings remain |
| Browser | Local fixture review at 1440×1000 and 390×844; no horizontal overflow; preview and figure text toggle worked |
| Full repository typecheck | Fails in unchanged `ErrorBoundary.test.tsx` and `useMarketplaceRows.tsx`; baseline not modified |

The screenshots show an isolated local fixture preview, not a hosted admin session. The browser run used the real interface and pilot content with mocked read responses. Desktop/mobile defects found in the first pass were corrected together and confirmed in the second pass. The SVG exports use the same diagram renderer as the interface.

## Delivery and remaining review

- 20 glossary drafts and 10 profile drafts, approximately 7,600 words.
- 6 original vector figures, each with equivalent text and source references.
- 9 portrait candidates with recovered Commons rights metadata and adequate source dimensions; Zanele Muholi’s existing image remains an explicit low-resolution exception.
- 30 of 44 source candidates downloaded successfully in the local receipt run. Retrieval is not claim verification; blocked sources remain unresolved. Two broken candidate URLs were corrected before delivery.
- No drafts are labelled human-approved or specialist-reviewed. The profiles remain below the target length and need additional checked evidence before expansion.
- No five-person reader study was performed or fabricated.
- No AI budget was created or increased. The worker requires an explicitly assigned existing allocation before using model calls.

The database tests run against a focused production-shape fixture, not a complete clone of the hosted schema and all its triggers. A deployment must include a hosted schema/permissions smoke test and authenticated admin/public route checks before publication.

Reproduce the checks using the commands in the delivery README. `node scripts/knowledge/check-types.mjs` reproduces the scoped compiler diagnostics; it does not replace the repository-wide ratchet.
