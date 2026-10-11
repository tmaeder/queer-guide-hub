# Unified Organisation content type

Approved by the user on 2026-10-11.

Use `organizations` as the canonical identity and CMS content type. Roles are
multi-valued. Keep `venues` as internal location records, with existing IDs,
URLs, event links, images, comments and bookmarks. One organisation can have
zero, one or many locations. Location closure is independent of dissolution.

Expose identity, roles, contact, media, publication, quality and nested locations
in one CMS editor. Keep legacy venue editor entry points as compatibility
bridges to their owning organisation. Venue and accommodation submissions use
the organisation content type with location-specific fields, retaining their
existing staging target so pipeline validation and review gates remain intact.

Backfill identity links in bounded, resumable batches; adopt only unambiguous
name/domain/geography matches. New location inserts must acquire an identity.
Do not merge branch locations by domain. Preserve safety gates and publication
state, and return optimistic concurrency errors for identity and location edits.

Rollout: apply migration; complete the backfill; verify coverage and permissions;
then release the unified CMS. Public place pages remain independently reachable.
Production migration and deployment are separate from this workspace change.

Live read-only measurement: 97,810 canonical venues; 94,233 unlinked venues;
6,415 canonical organisations; 240 organisations have multiple canonical venues.

## Delivered implementation

The unified registry/editor, nested transactional location saves, compatibility
bridges, role filters and locationless submission form are implemented. Workflow
metadata and organisation public status synchronize in the database; editor
refreshes preserve pending edits. The migration and resumable backfill script are
ready for rollout. See the dated audit for validation and deployment sequencing.
