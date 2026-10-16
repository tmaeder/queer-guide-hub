# Backend taxonomy management: coverage and verification

Implements the approved [design](2026-10-16-all-taxonomies-backend-design.md).

## Coverage

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Find every editorial taxonomy | `/admin/taxonomies`, sidebar entry, existing Tags taxonomy tab; searchable directory and direct family links | Catalog registration and destination tests; AdminTags tests; desktop/mobile browser checks |
| Manage existing domain dictionaries | Tags and tag/news/marketplace/event categories, amenities, services, accessibility, target groups, professions, intimate categories and interests | CMS registry contract tests; SQL CRUD/RLS tests |
| Manage formerly fixed classifications | Place/accommodation/milestone/cause-of-death, service/accessibility, identity/relationship/pronouns, 17 profile preference vocabularies, organisation roles | Seed/catalog and field-binding tests; SQL enum replacement and historical-selection tests |
| Manage rich reference dictionaries | Pride flags, handkerchief codes, competition categories, marketplace hierarchy, occasions and sizes | Reference metadata/store tests; SQL metadata and hierarchy tests |
| Create/edit/order/deactivate | Existing CMS fields and save workflow, managed field choices, reference metadata validation | SQL create/update/deactivation tests; dynamic field tests |
| Preserve references and hierarchy | Stable immutable identifiers, deletion guards, same-family/cycle/depth validation; inactive saved selections remain visible | SQL guards and selected-inactive regression tests |
| Apply edits to consumers | Shared paginated loader with retry, invalidation and refresh; public filters, content editors, profile forms and reference consumers | Loader/component tests and successful production build |
| Preserve marketplace assignment semantics | Staff category/group/fine assignment, fine/group checks, department propagation when hierarchy changes | Actual derive-trigger and authenticated moderator department-sync SQL tests |
| Preserve permissions and auditing | Existing tag/editor and organisation/admin floors; moderator taxonomy management, intimate eligibility, audited writes and private revision reads | RLS, privileged-path, revision and intimate-access SQL tests |
| Preserve existing URLs | Six competition category paths retained; new categories use `/competitions/types/:slug` | Reference route tests and edge metadata contract |

The catalog is the explicit inventory. Workflow states, permissions, privacy controls, protocol constants, safety enforcement and fixed analytical/rating scales remain application contracts, as approved.

## Verification

Run from the repository root:

```sh
node scripts/test-managed-taxonomies-sql.mjs
npm run typecheck
npx vitest run src/hooks/__tests__/useManagedOptions.test.tsx src/config/__tests__/taxonomyCatalog.test.ts src/lib/__tests__/managedReferenceTaxonomies.test.ts src/components/cms/fields/__tests__/DynamicChoiceField.test.tsx
```

The SQL runner uses an isolated PGlite database, a minimal surrounding schema fixture and the real existing CMS revision implementation. It applies all four migrations, exercises permissions and data guards, and makes no live database changes. This is not a replacement for the normal staging migration process against a full database.

Desktop and mobile browser checks verified the searchable directory, flex row layout, absence of page errors and horizontal overflow. Changed TypeScript sources pass ESLint. The repository typecheck ratchet passes with 701 existing errors against a baseline of 782; no baseline was relaxed.

## Release

Apply the four new migrations in version order through the normal database release process, then release the frontend. Existing identifiers are seeded/backfilled, including inactive historical values. Custom taxonomy values require the migrations before frontend use. No production migration, merge or deployment was performed as part of implementation.
