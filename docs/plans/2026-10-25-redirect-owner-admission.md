# Explicit workspace Owner admission

Continue the approved multiple-Owner workspace model without granting application
admin roles. Current explicit Owners may admit a verified active human member as
another Owner, or remove an Owner while retaining at least one current Owner.
Owner removal restores any existing member role; it does not invent membership.
Legacy Owners remain application admins and are managed through the existing
application user administration, never through this new registry API.

The account-only registry endpoint binds workspace, current authenticated actor,
target immutable membership/user identity and current role/revision. Each write
rechecks under the exclusive ACL lock. Owner rows gain a revision for stale
removal denial. Scope applies to active and provisioning workspace registries;
this does not activate their business resources or remove tenant fences.

Owner-only metadata includes account IDs, existing member labels/roles, grant
timestamps and whether removal is possible. It excludes account emails and auth
records. The UI reviews the target and all-workspace authority before admission,
requires explicit removal confirmation, and explains the legacy authority model.
SDKs expose account-only registry methods with explicit immutable workspace
selection. Isolated SQL and actual HTTP tests must prove independent tenants,
verified-member admission, no global admin escalation, current-role/revision
checks, last-Owner protection, Member/Viewer/Billing/key denial and preserved
resource activation fences.
