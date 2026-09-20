# Glossary quality programme

## Decision

Govern every active `unified_tags` row, but stop treating every tag as the same
kind of public glossary article. Add an explicit publication role:

- `article` — editorial glossary content.
- `utility` — facets, filters and internal descriptors.
- `entity_redirect` — place/person vocabulary that resolves to its canonical
  entity surface.

`entity_kind` remains the semantic classification. `publication_role` controls
publishing requirements and quality scoring. Defaults are deterministic:
attributes are utility; people and places are redirects; concepts and audiences
are articles; descriptors are articles only when indexable, otherwise utility.
Editors may override the default without changing the semantic kind.

Entity redirects carry a reviewed canonical content type, entity ID and route.
Existing tag assignments remain intact for filters, but a person, city, country,
village, venue, organisation or event can no longer compete as a glossary
article. Exact-name collisions are only review candidates: common terms such as
“Male”, “Reading”, “Angel” and “Party” must never be converted by string match.

## Content contract

`description` is the only published summary. `short_description` is legacy
candidate data and does not satisfy article completeness until reviewed and
promoted. Article entries need one primary category and reviewed prose; health,
legal, safety, identity-sensitive and substance content also needs an
authoritative source. Utility tags need a canonical vocabulary identity and a
valid owner/use, not prose. Redirect tags need a valid destination.

The existing all-purpose `quality_score` is retained for compatibility but is
superseded editorially by role-aware dimensions. Usage orders work; it is never
a quality signal. Embeddings propose candidates; they are never reader-facing
evidence. Automated prose, category and relation suggestions remain review
gated.

## Surfaces

Add a role-aware scorecard RPC and a queryable editorial queue with stable issue
codes, evidence, risk, usage and priority. Admins work one reviewed description
at a time; the boilerplate bulk-description writer is removed. The public index
and detail route respect publication roles, while taxonomy, aliases, redirects
and utility-tag use remain available to their owning features.

Glossary photography stays retired. The shared `TagPlate` remains the index
visual; explanatory visuals are selectively registered with kind, accessible
alternative, provenance, licence and review state. No per-tag image quota is
introduced.

## Delivery order

1. Add and backfill publication roles, role-aware scorecard/queue and hard
   invariants.
2. Remove unsafe bulk prose publishing and expose the queue in admin.
3. Correct known wrong-sense/category rows and prevent short-only articles from
   counting as complete.
4. Gate public article surfaces by role and add redirect/utility regression
   coverage.
5. Extend the visual metadata contract and quality sentinels.
6. Verify migrations, focused unit tests, typecheck, lint and build before
   rollout.

## Deprecated-corpus repair

`deprecated` is reserved for a reviewed retirement, invalid import, superseded
term, or content moved to another canonical entity. Zero usage and absence of
assignments are prioritisation signals, not retirement evidence.

Rows retired only by the historical zero-use/orphan sweeps are restored as
active, quarantined review candidates. Their former reason and entity kind are
retained in dedicated audit fields. They remain excluded from the public
glossary, detail resolver, previews, and search index until an editor records a
publication decision. Categorised concepts with substantial prose keep the
article role; incomplete rows remain utility vocabulary during review. This
does not mark machine prose as human-reviewed.

The old `deprecate_unused_tags` RPC becomes a compatibility no-op. A serial
admin queue can approve a candidate as an article, approve it as utility
vocabulary, or return it to reviewed retirement. Actual biographies and other
canonical entities are moved to their owning content type rather than restored
as glossary articles. CI treats a quarantined row leaking into public search or
index surfaces as a hard failure.
