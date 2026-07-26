# Business Spine Unification — hotels, venues, merchants, partners, brands, support orgs

## Context

Six entity families live in separate tables with separate admin surfaces (`/admin/hotels`, `/admin/brands`, `/admin/vendors`, `/admin/affiliate`, CMS types). The same real-world business can exist as venue + hotel + merchant + brand with no link; overlapping identity columns drift; there is no way to model "one business, many roles"; and a future partner/claim portal has no spine to hang on.

**Decisions (user-confirmed):**
- `organizations` becomes the universal business-party spine (it already has `roles[]`, trust/completeness, claim_status/claimed_by, field_provenance, website_domain, and is in `search_documents`).
- Typed tables STAY as detail tables — no table merges. Detail rows link UP via nullable `organization_id` (pattern already live for venues, news_sources, marketplace_merchants since migration `20260620082831`).
- One new **Business console at `/admin/business`** (list + detail with role tabs) that absorbs the bespoke cockpits over time.
- Brands: **optional** link only — queer/small brands get org rows; global product brands stay standalone.
- Full program planned; phased delivery.

Key discovered facts:
- `link_entity_to_organization(p_org_id, p_entity_type, p_entity_id)` + unlink RPC already exist (venue/news_source/merchant cases) — extend with hotel/brand/partner cases.
- `list_organizations(p_q, p_role, p_country_id, …)` RPC exists — console list needs no new search infra.
- Roles in live use: `venue`, `publisher`, `seller`, `support`.
- `dedup_review_queue` CHECK already includes `'organization'` and `'hotel'`; `EntityReviewQueue` shell is config-driven.
- Domain-normalization SQL exists in `find_org_merchant_domain_matches()` (20260716202716); name keys `dedup_despace`/`dedup_core_tokens` (20260623150504).
- `hotels` has NO `safety_gated` and is NOT in `search_documents` (intentional).
- Latest migration is `20260801020000` — new files must sort after it.
- `affiliate_partners` is read live by the `/go` worker (fail-open) — only additive changes there.

---

## Phase A — Schema (migrations, no data change)

Files sort after `20260801020000`; use `2026080110xxxx` block.

1. **`20260801100000_org_spine_link_columns.sql`**
   - `ADD COLUMN organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL` (nullable, no default → no rewrite) + btree index on: `hotels`, `affiliate_partners`, `marketplace_brands`.
   - Partial unique on `affiliate_partners(organization_id) WHERE organization_id IS NOT NULL` (one payout config per org).
   - No unique on hotels/venues/merchants (chains, multi-provider integrations).
   - `hotels.safety_gated boolean NOT NULL DEFAULT false` + wiring mirroring venues (20260623160000).
   - Roles vocabulary CHECK, `NOT VALID`: `roles <@ array['venue','publisher','seller','support','hotel','affiliate_partner','brand','organizer','community_group']`. (Keep `seller` for merchants — don't introduce a duplicate `merchant` role.)
2. **`20260801100100_org_spine_match_rpcs.sql`** — read-only finders `find_org_adoption_candidates(entity_type)` reusing domain-normalization regex + despace/core-token keys.
3. **`20260801100200_org_spine_backfill_rpcs.sql`** — batched backfill RPCs + `decide_org_adoption` + extended `link_entity_to_organization` (add hotel/brand/partner branches, role promotion with `AND NOT roles @> …` guard) + `promote_entity_to_organization` + explicit `GRANT EXECUTE` per RPC (service_role; admin finders to authenticated).
4. **`20260801100300_org_spine_backfill_kickoff.sql`** — pg_cron small-batch schedule; NO inline full backfill in a migration (search-trigger storm + timeout).
5. **Later: `20260801110000_org_spine_validate_roles.sql`** — `VALIDATE CONSTRAINT` after checking `SELECT DISTINCT unnest(roles)`; drift-count RPC (counts of unlinked eligible rows per source — no new table, disk-constrained DB).

Traps honored: no CONCURRENTLY, no statement-level triggers, nullable-no-default ADD COLUMN, explicit GRANTs, version block clear of collisions, never bulk-UPDATE `organizations` (per-row search trigger).

## Phase B — Backfill / linking (adopt-before-create)

Matching ladder per source, each RPC `run_backfill_orgs_from_<src>(p_limit default 200)`, idempotent (`WHERE organization_id IS NULL`), cron-driven:
1. Domain exact (normalized `website_domain`) → auto-link.
2. `dedup_despace(name)` equal + same `city_id` → auto-link.
3. `dedup_core_tokens` match or despace-without-geo → INSERT into `dedup_review_queue` (`entity_type='organization'`, source `org_unification`) — open-pair unique makes re-runs idempotent. NO auto-link.
4. No match → mint org (slug+collision suffix, copy name/website/domain/city/country/logo, `roles=[role]`, provenance stamped, `status` active only for vetted sources), link back in same batch.

Order + per-source rules:
- **merchants** (mostly linked already; mint for enabled unlinked; role `seller`)
- **affiliate_partners** (tiny; match `domains[1]` or adopt merchant's org via `affiliate_partner_id` back-link; role `affiliate_partner`; NEVER touch `enabled`/`go_key`/`redirect_template`)
- **hotels** (role `hotel`; phase-1 eligibility gate: `duplicate_of_id IS NULL AND (verified OR lgbtq_friendly)` — minted orgs DO enter search, that's intended but must not flood with unvetted scrape rows; copy `safety_gated`)
- **venues** last (biggest; extend existing `run_link_orgs_to_venues_by_domain()` with name+city rung; mint only for `quality_score ≥` threshold; 200/batch over days)
- **brands**: queue-only — rows with queer-ownership tags get a review-queue suggestion; global brands stay NULL forever. No auto-create.

Canonicalization: **link-only** in this program. Org = aggregation point. (Documented end-state: org canonical for party-identity fields — name/legal_name/website/social/logo — via provenance; address/geo/hours stay per-location. Not built now.)

## Phase C — Business console v1 (frontend)

Routes in `src/routes.tsx` (admin block ~line 360):
- `/admin/business` → `src/pages/admin/AdminBusiness.tsx` — list on `AdminEntityTable`, backed by `list_organizations` (extend RPC only if claim-status filter needed). Columns: name+logo, role badges (monochrome outline `Badge`), city/country, claim pill, trust, completeness, linked count, updated. Filters: role, claim status, needs_attention. Search = `p_q` direct query (NOT the search worker).
- `/admin/business/:id` → `src/pages/admin/AdminBusinessDetail.tsx` — `?tab=` role tabs.

New components under `src/components/admin/business/`:
- `OrgIdentityHeader.tsx` — logo/name/domain/roles/claim/trust + Edit (opens registry-CMS edit for `organizations` — CMS stays the scalar-field editor; console owns relationships/roles/claims; no duplicate form code) + Merge (existing dedup lane).
- `OrgOverviewPanel.tsx` — linked entities, provenance, enrichment, claim history.
- Role tabs v1: **Venue** (linked venues via `organization_venues`, link/unlink, deep-links to CMS), **Merchant** (filtered `useMarketplaceMerchants` by organization_id, logic lifted from `SellerOrgsPanel`), **Support** (contact fields). Hotel/Brand/Partner tabs = deep-links in v1.
- `OrgEntityPickerDialog.tsx` — "Link existing…": type-scoped autocomplete (search_documents typeahead; ILIKE fallback for hotels — not indexed). Calls extended `link_entity_to_organization`.
- `PromoteToOrgButton.tsx` — on unlinked hotel/merchant/venue rows; calls `promote_entity_to_organization`; pre-filled confirm sheet.
- `OrgLinkReviewQueue.tsx` — `EntityReviewQueue` config over the suggestion RPC (confidence, cross-country `approveGuard`); absorbs SellerOrgsPanel's preview/link-all as the shell's `batch` config. Also flags role/link drift (linked rows without role and vice versa).

Nav (`src/config/adminNavigation.ts`): **Business** in Cockpit section (icon `Briefcase`, `reviewCountKey: 'review_org_links'`). `get_admin_counts` additions: `organizations`, `organizations_unclaimed`, `review_org_links` (later `review_org_claims`).
Redirect (existing `<Navigate>` precedent): `/admin/vendors?tab=orgs` → `/admin/business`.

## Phase D — Absorb cockpits (v2)

- Consolidate the two near-duplicate `MerchantsManager` files (`vendors/` vs `affiliate/`) into one shared component with optional `organizationId` prop — do this FIRST or the org tab embeds the wrong one.
- Same optional-scope prop on `AffiliatePartnersManager` (needs layout-neutral variant — it renders its own `p-6` container) and `BrandReviewQueue` (org filter; **must not bypass the trust-gated approve/reject RPCs**).
- Hotel/Brand/Partner tabs go live (needs Phase A columns backfilled).
- Retire with redirects: `/admin/vendors` → `/admin/business`; `/admin/brands` → `/admin/business?role=brand`; `/admin/hotels` → `/admin/business?role=hotel` (after hotel CRUD re-homed). `/admin/affiliate` SLIMS to network analytics (Performance/Revenue/Link-health/Click codes stay — they're network-level, not per-org). Delete `AdminVendors.tsx`, `AdminBrands.tsx`, `AdminHotels.tsx`, `SellerOrgsPanel.tsx` at end state.

## Phase E — Claim portal (v3, sketch)

Public `/business/claim` → search org → claim flow. Verification: token email to `x@{website_domain}`; manual-evidence fallback. Sets `claim_status='pending'`, `claimed_by`. Admin: `OrgClaimReviewQueue` (EntityReviewQueue config) + `review_org_claims` count. Approve flips to `'claimed'`. Detailed design deferred to its own plan when reached.

---

## Verification

- **Phase A/B:** after each migration, `list_migrations` to confirm no drift; run one manual batch of each backfill RPC via MCP `execute_sql`, then drift-count RPC; spot-check: a hotel with a website domain matching an existing org gets linked not duplicated; `/go` redirect for an affected partner still resolves; `SELECT count(*) FROM dedup_review_queue WHERE source='org_unification'` sane.
- **Phase C:** `npm run typecheck && npm run lint && npm test`; deploy; on production queer.guide: open `/admin/business`, filter by role, open a detail, link a hotel via picker, promote an unlinked merchant, approve a suggestion in the queue; confirm `get_admin_counts` badge.
- **Phase D:** e2e smoke on redirects; verify brand approve still goes through `approve_marketplace_brand` RPC only.
- Design-system lint gates (monochrome badges, semantic radius, 8pt) enforced by existing ESLint config.

## Critical files

- `supabase/migrations/20260620082831_organizations_spine.sql` (spine + link/unlink RPCs to extend)
- `supabase/migrations/20260716202716_org_merchant_domain_dedup.sql` (domain matcher to generalize)
- `supabase/migrations/20260623150504_unified_dedup_name_keys.sql` (name keys)
- `supabase/migrations/20260725200000_dedup_review_queue.sql` (queue)
- `src/routes.tsx`, `src/config/adminNavigation.ts`
- `src/components/admin/review-queues/EntityReviewQueue.tsx` (shell)
- `src/components/admin/vendors/SellerOrgsPanel.tsx` (logic to absorb)
- `src/config/contentTypes/organization.ts` (CMS type — extend fields, cross-link)

## Risks

- Search-trigger storm on org mint/role-promotion → bounded p_limit batching, never bulk-UPDATE organizations.
- Dup explosion → adopt-before-create ladder + idempotent queue; same-name-different-city lands in review by design.
- `/go` breakage → additive-only changes to affiliate_partners.
- Two MerchantsManager divergence → consolidate before embedding.
- Hotels not in search_documents → picker needs ILIKE path.

---

## Implementation notes (Phase A–C, shipped 2026-07-26)

Deviations from the plan above, decided during implementation:

- **Own suggestion queue, not `dedup_review_queue`.** That queue is a same-type
  merge-pair queue whose approve path runs merge cores; adoption is a link
  decision, not a merge. New tiny table `org_link_suggestions` (open-entity
  unique index, admin-only RLS) + `decide_org_adoption` RPC. Registered in
  `triage_sources` ('org-link-review') so `get_admin_counts` exposes
  `review_org_links` automatically and the queue is inbox-visible.
- **bnb/apartment hotels never mint orgs.** 300 of 325 hotels are misterb&b
  private-room listings — a host's spare room is not a business. Mint gate:
  `hotel_type IN ('hotel','resort')`. They can still be linked/promoted by hand.
- **Roles vocabulary** kept `seller` for merchants and `community` (not
  `community_group`), matching live values.
- Migrations applied live via MCP and committed at their stamped versions:
  `20260726182150/182227/182350/182400/183016`.
- Backfill cron `org_spine_backfill` nightly 05:10 UTC, 200/batch per source;
  progress via `SELECT org_spine_drift_counts()`.
