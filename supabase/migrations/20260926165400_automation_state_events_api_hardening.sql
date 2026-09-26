-- The append-only state ledger is operational evidence, not a browser data
-- source. Keep it out of the exposed authenticated Data API; service-side
-- tooling can query it and a scoped RPC can be added if the UI needs it later.
revoke all on public.admin_automation_state_events from authenticated;
