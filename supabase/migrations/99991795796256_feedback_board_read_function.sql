-- /feedback could not load for anyone: anon and authenticated have no SELECT on
-- public.feedback_board_v (measured 2026-11-27: grants are postgres,
-- service_role and the algolia roles only), so every read returned 42501 and
-- the board showed "did not load".
--
-- Migration 99991791735864 granted SELECT on the view, but the view is
-- SECURITY DEFINER (not security_invoker), and the definer-view gate
-- (scripts/check-definer-view-grants.mjs, check 3) forbids API-role SELECT on
-- such views. The grant is not restored and the gate is not loosened.
--
-- Instead: one STABLE read function that returns exactly the view's reviewed
-- allowlist projection (id, submitted_at, feedback_status, data with three
-- keys, aggregated vote_count). The view's own WHERE (feedback only, not spam,
-- not a duplicate) still applies because the function reads the view.
create or replace function public.get_feedback_board()
returns table (
  id uuid,
  submitted_at timestamptz,
  feedback_status text,
  data jsonb,
  vote_count int
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select v.id, v.submitted_at, v.feedback_status::text, v.data, v.vote_count
  from public.feedback_board_v v
  order by v.submitted_at desc
  limit 500
$fn$;

comment on function public.get_feedback_board() is
  'Public /feedback board read. Returns feedback_board_v''s allowlist projection '
  'only. Never add columns without deciding to publish them.';

revoke all on function public.get_feedback_board() from public;
grant execute on function public.get_feedback_board() to anon, authenticated;

do $verify$
begin
  if not has_function_privilege('anon', 'public.get_feedback_board()', 'execute') then
    raise exception 'get_feedback_board: anon cannot execute';
  end if;
  if has_table_privilege('anon', 'public.feedback_board_v', 'select') then
    raise exception 'get_feedback_board: the view itself must stay ungranted';
  end if;
end
$verify$;
