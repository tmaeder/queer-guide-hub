-- Queer Guide feed generator for Bluesky (Phase 5 of the AT Protocol plan).
--
-- app.bsky.feed.getFeedSkeleton returns post at:// URIs; Bluesky's AppView
-- hydrates them. The source is the posts members themselves cross-posted to
-- their own Bluesky accounts (community_posts.at_uri, Phase 4), so the feed
-- needs no firehose: everything in it is already public on Bluesky by the
-- author's explicit choice. Still public-only, and self-labelled posts are
-- kept (Bluesky applies each viewer's label preferences to the skeleton).
--
-- Cursor = the last post id; its own created_at is looked up, so equal
-- timestamps page stably and no float conversion can skip a post.

create or replace function public.bluesky_feed_skeleton(
  p_cursor text default null,
  p_limit  int  default 30
)
returns table (post_uri text, next_cursor text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ts timestamptz;
  v_id uuid;
begin
  if p_cursor ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := p_cursor::uuid;
    select c.created_at into v_ts from public.community_posts c where c.id = v_id;
  end if;
  return query
    select c.at_uri, c.id::text
    from public.community_posts c
    where c.at_uri is not null
      and c.visibility = 'public'
      and (v_ts is null or (c.created_at, c.id) < (v_ts, v_id))
    order by c.created_at desc, c.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

revoke all on function public.bluesky_feed_skeleton(text, int) from public;
grant execute on function public.bluesky_feed_skeleton(text, int) to anon, authenticated, service_role;

do $verify$
declare n int;
begin
  select count(*) into n from public.bluesky_feed_skeleton(null, 5);
  if n < 0 then raise exception 'unreachable'; end if;
  -- A garbage cursor must not error (it is ignored).
  perform * from public.bluesky_feed_skeleton('not-a-cursor', 1);
end
$verify$;
