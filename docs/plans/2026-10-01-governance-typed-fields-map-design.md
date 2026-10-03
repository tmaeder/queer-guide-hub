# Governance typed fields and editable map

## Goal

Replace unconstrained text inputs in the Governance staging editor with controls that reflect the underlying data contracts, and present geographic data on an editable map. Reviewers should be able to correct structured proposals without memorising slugs or typing coordinates blindly.

## Field controls

Use a Governance-specific field-control registry keyed by entity type and field path. Unknown fields retain the existing safe text/number/boolean fallback.

- Venue `category` uses the canonical `VENUE_CATEGORY_OPTIONS` select.
- Event `event_type` uses the canonical `EVENT_TYPE_OPTIONS` select.
- `tags` uses an asynchronous searchable multi-select backed by active `unified_tags`. Existing unknown values remain visible so imported evidence is not lost, but the review editor does not create new tag variants.
- Location `country` uses the countries vocabulary.
- Location `city` uses live cities, filtered by the selected country and excluding merged-away rows.
- Boolean, numeric, URL, email, telephone, date, and long-text fields use their corresponding native or design-system controls.
- Open prose and names remain free text.

The registry belongs to the staging review surface rather than reusing the full CMS field renderer. Staging data is nested and source-shaped, while the CMS editor assumes flat table columns and can create related entities. Governance review must correct a proposal without silently expanding the corpus.

## Location editor

Treat `location` as one atomic nested value. Render address, country, city, postal code, latitude, longitude, and timezone together rather than showing the object as read-only data.

The map uses the shared MapLibre visual system and displays a primary marker for valid coordinates. The marker is draggable. Dragging updates the latitude and longitude draft fields; editing valid coordinate fields moves the marker. Values are clamped to latitude `[-90, 90]` and longitude `[-180, 180]` before saving.

If coordinates are missing, a selected city provides the initial map centre and a clear “Place marker” action. Selecting a country filters the city search and clears a city that no longer belongs to that country. It does not silently overwrite existing coordinates. Selecting a city without existing coordinates may centre the map but does not create coordinates until the reviewer places the marker.

The map provides attribution, keyboard-operable coordinate fields, and a non-WebGL fallback that keeps the structured controls usable.

## Saving and approval

All location edits are accumulated under a single top-level `location` change and sent through `update_staging_review_fields`. Other edited fields keep their existing top-level save shape.

The current safety contract remains unchanged:

- approval is disabled while edits are unsaved;
- identity, provenance, and review-state keys remain forbidden;
- only pending-review rows can be changed;
- saving corrections does not approve or publish an item;
- the approval guidance continues to explain the commit-pipeline handoff.

## Responsive behaviour

The map fills the detail-panel width and uses a compact fixed height. At narrow widths, location controls stack above the map. At wider widths, the structured controls and map can share the available space without introducing page-level horizontal scrolling. The existing resizable queue/detail split and compact drawer remain intact.

## Verification

Add focused tests for:

- canonical venue and event selects;
- asynchronous tag search and preservation of unknown imported values;
- country-filtered city search and incompatible-city clearing;
- nested location draft/save behaviour;
- coordinate validation and marker/field synchronisation;
- no-coordinate and no-WebGL fallbacks;
- approval remaining blocked until edits are saved;
- responsive rendering without page-level overflow.

Run the focused Governance tests, lint/typecheck ratchets, production build, protected CI, deployment workflows, and an authenticated non-destructive production browser check. Production verification may move a marker locally but must not save, approve, reject, or otherwise alter a review item.
