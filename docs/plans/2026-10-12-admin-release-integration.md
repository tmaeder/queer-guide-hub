# Admin release integration

Reconcile the user-approved unified Review queue and operational overview polish.
Keep the Review queue at /admin. Preserve the overview's count errors, retries,
independent health reads, role gates, mobile layout, and inventory formatting as
an Overview tab within /admin/diagnostics. Keep the existing engine panels beside
it without adding another top-level sidebar destination.

Restoring the former cockpit at /admin would replace the approved Review workspace;
discarding the cockpit would lose the approved reliability improvements. The
secondary Diagnostics placement preserves both changes. The overview author
confirmed this placement during the user-authorized release coordination.

Validate the queue wrapper, operational overview, independent health reads,
diagnostics navigation, typography/loading contracts, build, and required CI gates.
