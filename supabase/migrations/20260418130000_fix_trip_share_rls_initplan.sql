-- Wrap unwrapped auth.uid() calls in trip_share_reactions and trip_share_comments
-- write-side policies so Postgres caches the result per statement instead of
-- re-evaluating per row (auth_rls_initplan advisor warning).
--
-- SELECT policies on both tables already wrap correctly.

-- ── trip_share_reactions ─────────────────────────────────────────────────────
drop policy if exists trip_share_reactions_insert on public.trip_share_reactions;
create policy trip_share_reactions_insert on public.trip_share_reactions for insert with check (
  exists (
    select 1 from public.trips t
    where t.id = trip_share_reactions.trip_id and t.is_public = true
  )
  and (
    ((select auth.uid()) is not null and viewer_id = (select auth.uid()) and viewer_fingerprint is null)
    or ((select auth.uid()) is null and viewer_id is null and viewer_fingerprint is not null)
  )
);

drop policy if exists trip_share_reactions_delete on public.trip_share_reactions;
create policy trip_share_reactions_delete on public.trip_share_reactions for delete using (
  ((select auth.uid()) is not null and viewer_id = (select auth.uid()))
  or ((select auth.uid()) is null and viewer_fingerprint is not null)
);

-- ── trip_share_comments ──────────────────────────────────────────────────────
drop policy if exists trip_share_comments_insert on public.trip_share_comments;
create policy trip_share_comments_insert on public.trip_share_comments for insert with check (
  exists (
    select 1 from public.trips t
    where t.id = trip_share_comments.trip_id and t.is_public = true
  )
  and (
    ((select auth.uid()) is not null and viewer_id = (select auth.uid()) and viewer_fingerprint is null)
    or ((select auth.uid()) is null and viewer_id is null and viewer_fingerprint is not null)
  )
);

drop policy if exists trip_share_comments_delete on public.trip_share_comments;
create policy trip_share_comments_delete on public.trip_share_comments for delete using (
  ((select auth.uid()) is not null and viewer_id = (select auth.uid()))
  or ((select auth.uid()) is null and viewer_fingerprint is not null)
  or exists (
    select 1 from public.trips t
    where t.id = trip_share_comments.trip_id and t.owner_id = (select auth.uid())
  )
);
