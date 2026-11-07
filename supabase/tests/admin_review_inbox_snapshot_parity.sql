-- Run on an isolated database with a populated admin review queue.
-- Compare both implementations at the same data snapshot and clock.
begin isolation level repeatable read;

do $$
declare
  v_full jsonb;
  v_incremental jsonb;
  v_result jsonb;
begin
  perform public.refresh_admin_review_queue_top();
  select jsonb_agg(to_jsonb(t) - 'computed_at' order by scope, sort, rank)
  into v_full from public.admin_review_queue_top t;
  if v_full is null then
    raise exception 'Parity check requires a populated inbox fixture';
  end if;

  update api_private.review_inbox_source_state set refreshed_at = '-infinity'::timestamptz;
  v_result := public.refresh_admin_review_queue_top_if_changed();
  select jsonb_agg(to_jsonb(t) - 'computed_at' order by scope, sort, rank)
  into v_incremental from public.admin_review_queue_top t;

  if v_result->>'ok' is distinct from 'true'
    or coalesce((v_result->>'sources_refreshed')::integer, 0) = 0
    or v_full is distinct from v_incremental then
    raise exception 'Incremental inbox snapshot differs from the full rebuild';
  end if;
end
$$;

rollback;
