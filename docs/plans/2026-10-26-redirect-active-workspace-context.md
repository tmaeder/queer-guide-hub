# Active private workspace context preparation

Accept a syntactically valid explicit workspace UUID in private Edge requests,
then require current active workspace and actor/principal checks in SQL. Remove
legacy-only selection checks from the private selector and session context;
retain explicit Owner/member authority and all role/resource restrictions.
Unknown, provisioning or unauthorized workspace access remains denied. Never
infer future ownership from application-admin status.

For a server key without an explicit header, derive its immutable workspace from
the globally unique token digest in a narrow service-only lookup. Require an
active workspace and unexpired/unrevoked key, then authenticate its requested
scope and current owner/member grant again using that workspace. With an explicit
header, the normal scoped authentication must find that same key in the selected
workspace; mismatch denies. Lookup is selection, never a scope grant. No key,
credential metadata or account details are returned. One immutable service client
is created per request, never shared header mutation.

This prepares selection while all 40 resource fences, private integration fence
and registry activation constraint remain intact. New workspace creation and
activation remain unavailable until immutable UI context and resource tests are
complete. Prove independent active future Owner/member/key operations inside
rolled-back fixtures, current role loss, explicit key/header mismatch, omitted
key context, unknown/inactive contexts and unchanged legacy behavior. Public
capabilities/native signup/recipient invitations retain their source selection.
