-- Post notifications open the post, and @mentions in a post notify.
--
-- 1. Inbox links. Likes and comments on your post opened /community/feed (a
--    redirect to the general feed); they now open /posts/<id>. Group items
--    went to the legacy /groups/<id> path; they now go to /meet/groups/<id>,
--    keeping ?post=, which the group page now reads. comment_reply had no
--    label and fell through to "sent you a notification".
-- 2. Comment mentions and replies on community posts were filed as
--    "Comment activity" linking to /community/feed. They keep type 'system'
--    (email_notice_current() matches the in-app row on type='system', so
--    changing the type would stop the email copy) and gain a title that names
--    who did what, plus a link to the post.
-- 3. community_posts.mentions was saved and never read. A trigger now notifies
--    each mentioned member who can see the post (same visibility rule the
--    comment emails use), once per post.
--
-- The two functions are patched from pg_get_functiondef with exactly-once
-- anchors rather than restated, so later changes to their other branches are
-- kept. 0 existing notifications link to /community/feed, so no backfill.

do $patch$
declare
  r record;
  v_src text;
  v_n int;
begin
  for r in
    select * from (values
      ('api_private.get_inbox_feed(uuid,timestamptz,text,text,integer)',
       E'''/community/feed'',\n      NULL::uuid, false, false, false, 0, NULL::boolean, NULL::text\n    FROM public.post_likes pl',
       E'''/posts/'' || pl.post_id::text,\n      NULL::uuid, false, false, false, 0, NULL::boolean, NULL::text\n    FROM public.post_likes pl'),
      ('api_private.get_inbox_feed(uuid,timestamptz,text,text,integer)',
       E'''/community/feed'',\n      NULL::uuid, false, false, false, 0, NULL::boolean, NULL::text\n    FROM public.post_comments pco',
       E'''/posts/'' || pco.post_id::text,\n      NULL::uuid, false, false, false, 0, NULL::boolean, NULL::text\n    FROM public.post_comments pco'),
      ('api_private.get_inbox_feed(uuid,timestamptz,text,text,integer)',
       E'''/groups/'' || gn.group_id::text',
       E'''/meet/groups/'' || gn.group_id::text'),
      ('api_private.get_inbox_feed(uuid,timestamptz,text,text,integer)',
       E'WHEN ''comment_liked'' THEN '' liked your comment''',
       E'WHEN ''comment_liked'' THEN '' liked your comment''\n          WHEN ''comment_reply'' THEN '' replied to your comment'''),
      ('email_private.capture_comment_notice()',
       E'values(target.id,''system'',''Comment activity'',''Open Queer Guide to review a mention or reply.'',new.id,''/community/feed'')',
       E'values(target.id,''system'',coalesce(nullif((select p.display_name from public.profiles p where p.user_id=new.user_id),''''),''Someone'')||case when reason_name=''mention'' then '' mentioned you in a comment'' else '' replied to your comment'' end,''Open Queer Guide to read it.'',new.id,''/posts/''||new.post_id::text)')
    ) t(fn, v_from, v_to)
  loop
    v_src := pg_get_functiondef(r.fn::regprocedure);
    v_n := (length(v_src) - length(replace(v_src, r.v_from, ''))) / length(r.v_from);
    if v_n = 0 and position(r.v_to in v_src) > 0 then
      raise notice '%: already patched', r.fn;
      continue;
    end if;
    if v_n <> 1 then
      raise exception '%: expected 1 anchor, found %', r.fn, v_n;
    end if;
    execute replace(v_src, r.v_from, r.v_to);
  end loop;
end
$patch$;

create or replace function api_private.notify_post_mentions()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_actor text;
begin
  if jsonb_typeof(new.mentions) is distinct from 'array' then return new; end if;
  if tg_op = 'UPDATE' and new.mentions is not distinct from old.mentions then return new; end if;

  select coalesce(nullif(p.display_name, ''), 'Someone') into v_actor
  from public.profiles p where p.user_id = new.user_id;

  insert into public.notifications (user_id, type, title, content, related_id, action_url, metadata)
  select c.id, 'system',
         coalesce(v_actor, 'Someone') || ' mentioned you in a post',
         'Open Queer Guide to read it.',
         new.id, '/posts/' || new.id::text,
         jsonb_build_object('kind', 'post_mention')
  from (
    select distinct (j->>'user_id')::uuid as id
    from jsonb_array_elements(new.mentions) j
    where j->>'user_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) c
  join auth.users u on u.id = c.id
  where c.id <> new.user_id
    and email_private.comment_post_visible('community', new.id, c.id)
    and not exists (
      select 1 from public.notifications x
      where x.user_id = c.id and x.related_id = new.id and x.metadata->>'kind' = 'post_mention'
    )
  order by c.id
  limit 50;
  return new;
end
$fn$;

revoke all on function api_private.notify_post_mentions() from public, anon, authenticated;

drop trigger if exists trg_notify_post_mentions on public.community_posts;
create trigger trg_notify_post_mentions
  after insert or update of mentions on public.community_posts
  for each row execute function api_private.notify_post_mentions();

do $verify$
declare
  v_feed text := pg_get_functiondef('api_private.get_inbox_feed(uuid,timestamptz,text,text,integer)'::regprocedure);
  v_cmt text := pg_get_functiondef('email_private.capture_comment_notice()'::regprocedure);
begin
  if position('/community/feed' in v_feed) > 0 then
    raise exception 'get_inbox_feed still links to /community/feed';
  end if;
  if position('/posts/'' || pl.post_id' in v_feed) = 0 or position('/posts/'' || pco.post_id' in v_feed) = 0 then
    raise exception 'get_inbox_feed does not link likes and comments to the post';
  end if;
  if position('''/meet/groups/'' || gn.group_id' in v_feed) = 0 or position('replied to your comment' in v_feed) = 0 then
    raise exception 'get_inbox_feed group items not patched';
  end if;
  if position('/community/feed' in v_cmt) > 0 or position('''/posts/''||new.post_id' in v_cmt) = 0 then
    raise exception 'capture_comment_notice does not link to the post';
  end if;
  if position('values(target.id,''system''' in v_cmt) = 0 then
    raise exception 'capture_comment_notice changed the notification type; email_notice_current needs system';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.community_posts'::regclass and tgname = 'trg_notify_post_mentions' and tgenabled <> 'D'
  ) then
    raise exception 'trg_notify_post_mentions missing';
  end if;
end
$verify$;
