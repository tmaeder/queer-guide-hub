-- The cruising guide is a signed-in surface. Keep existing public venue
-- discovery intact while removing cruising-category rows from anonymous reads.

drop policy if exists venues_cruising_authenticated_only on public.venues;
create policy venues_cruising_authenticated_only on public.venues
  as restrictive
  for select
  to anon
  using (category is distinct from 'cruising');

comment on policy venues_cruising_authenticated_only on public.venues is
  'Cruising spots are available only to signed-in users through the authenticated cruising guide.';
