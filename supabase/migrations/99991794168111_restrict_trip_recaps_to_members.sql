-- Recaps include private budget totals, even when the itinerary is public.
alter policy trip_recaps_select on public.trip_recaps
  to authenticated
  using (api_private.is_trip_member(trip_id, (select auth.uid())));

alter policy trip_recaps_upsert on public.trip_recaps
  to authenticated
  with check (api_private.can_edit_trip(trip_id, (select auth.uid())));

alter policy trip_recaps_update on public.trip_recaps
  to authenticated
  using (api_private.can_edit_trip(trip_id, (select auth.uid())))
  with check (api_private.can_edit_trip(trip_id, (select auth.uid())));
