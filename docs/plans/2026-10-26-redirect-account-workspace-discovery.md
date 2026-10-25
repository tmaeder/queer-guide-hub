# Account workspace discovery

Replace the one-element selected-workspace list with service-only account
discovery of active workspaces where the current account is an explicit Owner
or active human Member, Viewer or Billing member. Application admins own the
legacy workspace only. Membership loss and inactive workspaces disappear on the
next read; no domain, credential, email, people or business resource data is
included. A supplied workspace ID is selection metadata, never authorization.

GET /workspaces remains account-only, supports bounded offset paging, and may
return an empty list for an account with invitations but no membership. Return
count, next offset and a nullable currentWorkspaceId. An explicit unavailable
selection stays null; the UI must not silently route a mutation to another
workspace. Without an explicit selection, prefer accessible legacy, then the
first stable visible workspace. Do not activate resources or add creation in
this change. SQL and actual HTTP tests must prove independent Owner and member
roles, current/inactive membership, global-admin isolation, pagination, explicit
unavailable selection, no-access accounts and key denial. Existing SDKs expose
the optional pagination parameter without mutating their bound workspace.
