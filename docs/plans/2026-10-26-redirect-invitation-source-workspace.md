# Recipient-bound invitations across workspaces

Continue the approved tenant isolation contract by allowing a verified recipient
account to discover and accept active invitations without already belonging to
or selecting the publisher's workspace. A saved invitation's globally unique
opaque token hash or immutable ID identifies its source; a visitor workspace
header cannot redirect acceptance. Current source Owner, active source workspace,
verified recipient email, expiry/revocation, inactive membership and accepted
receipt checks remain mandatory under the ACL lock. Existing membership roles
are preserved and repeated acceptance returns the same membership.

Owner invitation list/create/revoke remain explicitly selected private operations.
The account inbox returns only current verified-email invitations, with source
workspace identity for an understandable review. It never returns token hashes,
recipient emails or other people's invitations. The acceptance result identifies
the joined workspace so the later immutable workspace picker can select it.
A narrow global account-flow exception precedes private request selection; it
opens neither private resources nor workspace activation. Keep tenant resource
and registry activation fences intact. Prove active/provisioning sources,
recipient/actor substitution, stable acceptance, preserved member roles and
visitor-header independence with rolled-back SQL and actual Edge HTTP fixtures.
