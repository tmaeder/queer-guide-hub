# Editorial rejection history

Approved by the user on 2026-10-14: preserve all rejected drafts while retaining one draft per entity and each non-rejected status.

The existing deferred unique constraint includes rejected drafts. Rejecting a second draft for the same place therefore fails at transaction commit. Nine reviewed drafts are currently blocked.

Keep the existing deferred uniqueness behavior using a generated status discriminator: NULL for rejected drafts, the original status otherwise. Replace the constraint with a deferred unique constraint on entity type, entity ID, and that discriminator. PostgreSQL permits repeated NULL values, preserving rejection history without weakening pending, approved, or published uniqueness.

A partial unique index is smaller but changes deferred checks into immediate checks. Deleting or overwriting prior rejected rows loses review history. The generated discriminator preserves both history and transaction semantics.

Verify repeated rejections and all three protected statuses in a transaction that rolls back. Also verify deferred transitions and unchanged stored draft content. Apply the schema repair, save the nine item-specific rejections through the existing review action, and verify outcomes and preservation of earlier rejected rows. The schema migration itself makes no review decisions and changes no publication or authorization rules.

For continuing review, use existing database jobs for mechanical work and an hourly chat automation for source-backed decisions. Keep uncertain items pending with evidence requirements, retain confirmed decision ledgers, verify writes, and report meaningful progress or failures only.
