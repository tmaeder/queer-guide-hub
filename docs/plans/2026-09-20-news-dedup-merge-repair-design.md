# News dedup merge repair

## Context

Production duplicate cleanup exposed two coupled defects in the generic News merge path:

1. Reparenting a duplicate article in `news_story_articles` can violate the table's unique index on `article_id` when both the canonical and duplicate articles already belong to different stories.
2. A partially completed cluster cannot be resumed because retrying the cluster stops at the first member that is already merged into the selected canonical.

The admin UI merges cluster members sequentially, so both defects must be addressed in the database merge contract rather than worked around in the browser.

## Chosen design

### Idempotent retry

`_news_merge_core` will treat a drop article whose `duplicate_of_id` already equals the requested keep article as a successful no-op. A drop pointing at any other canonical remains an error. This lets the existing sequential UI resume partially completed clusters safely.

### Story-membership conflict handling

If the canonical article has no story membership, the duplicate's `news_story_articles` row moves to the canonical as today.

If the canonical already has a story membership, the canonical relationship wins. The duplicate relationship is removed before the article is marked as merged, avoiding the unique-index violation.

### Reversibility

Removed story relationships are stored in `entity_merge_audit.details.removed.news_story_articles`, including `story_id` and `similarity`. `unmerge_entities` recreates those rows for the restored duplicate. Existing moved-row restoration remains unchanged.

### Verification

- SQL assertions cover idempotent retries, conflicting story memberships, and unmerge restoration.
- Existing merge/unmerge checks remain green.
- After deployment, the production News duplicate queue is retried to completion.
- Production E2E verifies every requested content type, all fuzzy views, merged-record visibility, redirects, and browser errors.

## Rejected alternatives

- Deleting conflicting story links without audit metadata: not reversible.
- Removing story membership from the canonical instead: silently changes the survivor's established relationship.
- Handling retries only in the UI: the UI cannot reliably know which cluster members are already merged because the duplicate finder is backed by a stale search index.
