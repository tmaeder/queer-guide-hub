-- An unlisted wishlist opened from its link showed "This list is empty."
--
-- get_wishlist_by_slug() returns the list for visibility public OR unlisted
-- (or the owner), but the wishlist_items SELECT policy only admits public lists
-- and the owner. So a recipient of an unlisted link got the title and zero
-- items, with no error: the share worked and silently showed nothing.
--
-- Widening the policy to 'unlisted' is NOT the fix: a row policy is evaluated
-- per row, so `select * from wishlist_items` with no filter would then return
-- every unlisted list's contents to anyone. The slug is the secret that makes a
-- list "unlisted", so access goes through the slug, in a definer function that
-- applies exactly the same rule as get_wishlist_by_slug().
--
-- Returns listing ids in list order only; the client reads the listings
-- through marketplace_listings' own RLS, so nothing unpublished leaks.

create or replace function public.get_wishlist_items_by_slug(p_slug text)
returns table (listing_id uuid, "position" integer, added_at timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select i.listing_id, i.position, i.added_at
  from public.wishlists w
  join public.wishlist_items i on i.wishlist_id = w.id
  where w.slug = p_slug
    and (w.visibility in ('public', 'unlisted') or w.user_id = (select auth.uid()))
  order by i.position asc, i.added_at desc
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC; revoke first, then grant the two
-- roles that need it.
revoke all on function public.get_wishlist_items_by_slug(text) from public;
grant execute on function public.get_wishlist_items_by_slug(text) to anon, authenticated;

do $verify$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_wishlist_items_by_slug' and p.prosecdef
  ) then
    raise exception 'get_wishlist_items_by_slug was not created as security definer';
  end if;
  if has_function_privilege('public', 'public.get_wishlist_items_by_slug(text)', 'execute') then
    raise exception 'get_wishlist_items_by_slug is still executable by PUBLIC';
  end if;
end
$verify$;
