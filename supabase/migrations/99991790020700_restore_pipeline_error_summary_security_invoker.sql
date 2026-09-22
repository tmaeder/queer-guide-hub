-- Preserve caller permissions and RLS when the operational summary view is queried.
-- A later recovery migration recreated the view without carrying forward the
-- security_invoker option from the baseline definition.

alter view public.pipeline_error_summary
  set (security_invoker = true);

revoke all on public.pipeline_error_summary from public, anon;
grant select on public.pipeline_error_summary to authenticated, service_role;

