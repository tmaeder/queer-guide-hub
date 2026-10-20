-- Open web identity (Phase 2 of the AT Protocol / Bluesky standards plan).
--
-- Two read-only entry points for the edge (Pages Functions) and the SPA:
--   resolve_handle(handle)   -> /@handle, WebFinger
--   open_web_posts(...)      -> Atom feeds (per user, per tag)
--
-- Everything outward-facing is OPT-IN through privacy_settings.open_web = true,
-- and additionally requires the profile itself to be public. A handle that is
-- not opted in still resolves for /@handle (that page is gated again by
-- get_public_profile_safe, the single privacy gate profiles already use), but
-- it is never listed in WebFinger or published in a feed.
--
-- Feeds never carry a self-labelled post (porn/sexual/nudity/graphic-media):
-- a feed reader cannot apply Bluesky label preferences, so the only safe
-- default is to leave labelled content out.

create or replace function public.resolve_handle(p_handle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h text := lower(btrim(regexp_replace(coalesce(p_handle, ''), '^@', '')));
  p record;
  v_target text;
begin
  if h !~ '^[a-z0-9._]{3,20}$' then
    return null;
  end if;

  select user_id, username, privacy_settings into p
  from public.profiles where username = h;

  if found then
    return jsonb_build_object(
      'user_id', p.user_id,
      'username', p.username,
      'open_web',
        coalesce(p.privacy_settings ->> 'open_web', 'false') = 'true'
        and coalesce(p.privacy_settings ->> 'profile_visibility', 'public') in ('public', 'true')
    );
  end if;

  -- A renamed handle keeps working for its redirect window (change_username).
  select pr.username into v_target
  from public.username_redirects r
  join public.profiles pr on pr.user_id = r.user_id
  where r.old_username = h and (r.expires_at is null or r.expires_at > now());

  if v_target is not null then
    return jsonb_build_object('redirect', v_target);
  end if;
  return null;
end;
$$;

revoke all on function public.resolve_handle(text) from public;
grant execute on function public.resolve_handle(text) to anon, authenticated, service_role;

create or replace function public.open_web_posts(
  p_handle text default null,
  p_tag    text default null,
  p_limit  int  default 50
)
returns table (
  id uuid,
  username text,
  display_name text,
  content text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, pr.username, pr.display_name, c.content, c.tags, c.created_at, c.updated_at
  from public.community_posts c
  join public.profiles pr on pr.user_id = c.user_id
  where c.visibility = 'public'
    and cardinality(c.labels) = 0
    and coalesce(pr.privacy_settings ->> 'open_web', 'false') = 'true'
    and coalesce(pr.privacy_settings ->> 'profile_visibility', 'public') in ('public', 'true')
    and (p_handle is null or pr.username = lower(p_handle))
    and (p_tag is null or lower(p_tag) = any (select lower(t) from unnest(c.tags) t))
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.open_web_posts(text, text, int) from public;
grant execute on function public.open_web_posts(text, text, int) to anon, authenticated, service_role;

-- Postconditions ----------------------------------------------------------------
do $verify$
declare
  v_post_labels text;
begin
  -- A handle that does not exist resolves to nothing, not to an error.
  if public.resolve_handle('zz-not-a-handle-zz') is not null then
    raise exception 'open web: resolve_handle returned a row for a malformed handle';
  end if;
  -- The feed source must refuse labelled posts: check the predicate is in place.
  -- Strip comments first: pg_get_functiondef() includes them.
  select regexp_replace(pg_get_functiondef('public.open_web_posts(text,text,int)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g') into v_post_labels;
  if position('cardinality(c.labels) = 0' in v_post_labels) = 0 then
    raise exception 'open web: open_web_posts no longer excludes labelled posts';
  end if;
  if position('open_web' in v_post_labels) = 0 then
    raise exception 'open web: open_web_posts no longer requires the open_web opt-in';
  end if;
end
$verify$;
