-- In-app settings for post notifications: likes on my posts, comments on my
-- posts, and mentions/replies. All on by default; a member with no row gets
-- the old behaviour.
--
-- Applied where the inbox reads, not where notifications are written:
-- email_notice_current() only sends a comment email while the matching in-app
-- row exists, so skipping the row would also silence email, which has its own
-- setting. Likes and comments were never stored rows; the inbox derives them.
-- Both the list (get_inbox_feed) and the badge counts
-- (get_inbox_unread_counts) are patched, so a hidden kind never shows up as an
-- unread count with nothing to open.
--
-- Mentions/replies here means community-post notifications: type 'system'
-- rows linking to /posts/<id> (comment mentions, replies, post mentions).

create table if not exists public.inbox_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  post_likes boolean not null default true,
  post_comments boolean not null default true,
  post_mentions boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.inbox_preferences enable row level security;

drop policy if exists "Members read their inbox preferences" on public.inbox_preferences;
create policy "Members read their inbox preferences" on public.inbox_preferences
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Members insert their inbox preferences" on public.inbox_preferences;
create policy "Members insert their inbox preferences" on public.inbox_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Members update their inbox preferences" on public.inbox_preferences;
create policy "Members update their inbox preferences" on public.inbox_preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.inbox_preferences from public, anon, authenticated;
-- Table-level UPDATE: an upsert's ON CONFLICT needs it.
grant select, insert, update on public.inbox_preferences to authenticated;

do $patch$
declare
  r record;
  v_code text;
  v_src text;
  v_n int;
begin
  for r in
    select * from (values
      -- get_inbox_feed: one prefs row, then each derived kind checks it.
      ('api_private.get_inbox_feed(uuid,timestamptz,text,text,integer)',
       E'WITH me AS (\n    SELECT post_engagement_seen_at FROM public.profiles WHERE user_id = p_user\n  ),',
       E'WITH me AS (\n    SELECT post_engagement_seen_at FROM public.profiles WHERE user_id = p_user\n  ),\n  prefs AS (\n    SELECT COALESCE(ip.post_likes, true) AS likes,\n           COALESCE(ip.post_comments, true) AS comments,\n           COALESCE(ip.post_mentions, true) AS mentions\n    FROM (SELECT 1) one\n    LEFT JOIN public.inbox_preferences ip ON ip.user_id = p_user\n  ),'),
      ('api_private.get_inbox_feed(uuid,timestamptz,text,text,integer)',
       E'      AND n.type NOT IN (''dm'', ''message'')\n',
       E'      AND n.type NOT IN (''dm'', ''message'')\n      AND ((SELECT mentions FROM prefs)\n           OR NOT (n.type = ''system'' AND COALESCE(n.action_url, '''') LIKE ''/posts/%''))\n'),
      ('api_private.get_inbox_feed(uuid,timestamptz,text,text,integer)',
       E'WHERE cp.user_id = p_user AND pl.user_id <> p_user',
       E'WHERE cp.user_id = p_user AND pl.user_id <> p_user AND (SELECT likes FROM prefs)'),
      ('api_private.get_inbox_feed(uuid,timestamptz,text,text,integer)',
       E'WHERE cp.user_id = p_user AND pco.user_id <> p_user',
       E'WHERE cp.user_id = p_user AND pco.user_id <> p_user AND (SELECT comments FROM prefs)'),
      -- get_inbox_unread_counts: same rules for the badge.
      ('api_private.get_inbox_unread_counts(uuid)',
       E'declare\n  v_seen timestamptz;',
       E'declare\n  v_seen timestamptz;\n  v_likes_on boolean := true; v_comments_on boolean := true; v_mentions_on boolean := true;'),
      ('api_private.get_inbox_unread_counts(uuid)',
       E'  v_seen := coalesce(v_seen, ''1970-01-01''::timestamptz);',
       E'  v_seen := coalesce(v_seen, ''1970-01-01''::timestamptz);\n\n  select ip.post_likes, ip.post_comments, ip.post_mentions\n    into v_likes_on, v_comments_on, v_mentions_on\n    from public.inbox_preferences ip where ip.user_id = p_user;\n  v_likes_on := coalesce(v_likes_on, true);\n  v_comments_on := coalesce(v_comments_on, true);\n  v_mentions_on := coalesce(v_mentions_on, true);'),
      ('api_private.get_inbox_unread_counts(uuid)',
       E'     and n.type not in (''dm'', ''message'');',
       E'     and n.type not in (''dm'', ''message'')\n     and (v_mentions_on or not (n.type = ''system'' and coalesce(n.action_url, '''') like ''/posts/%''));'),
      ('api_private.get_inbox_unread_counts(uuid)',
       E'where p.user_id = p_user and pl.user_id <> p_user and pl.created_at > v_seen;',
       E'where p.user_id = p_user and pl.user_id <> p_user and pl.created_at > v_seen and v_likes_on;'),
      ('api_private.get_inbox_unread_counts(uuid)',
       E'where p.user_id = p_user and pc.user_id <> p_user and pc.created_at > v_seen;',
       E'where p.user_id = p_user and pc.user_id <> p_user and pc.created_at > v_seen and v_comments_on;')
    ) t(fn, v_from, v_to)
  loop
    -- Anchors are counted in the code only, so a comment quoting one cannot
    -- satisfy or break the count.
    v_code := regexp_replace(pg_get_functiondef(r.fn::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
    v_n := (length(v_code) - length(replace(v_code, r.v_from, ''))) / length(r.v_from);
    if v_n = 0 and position(r.v_to in v_code) > 0 then
      raise notice '%: already patched', r.fn;
      continue;
    end if;
    if v_n <> 1 then
      raise exception '%: expected 1 anchor, found %', r.fn, v_n;
    end if;

    -- The replacement runs on the full definition so its comments survive;
    -- it must also see exactly one anchor there.
    v_src := pg_get_functiondef(r.fn::regprocedure);
    if (length(v_src) - length(replace(v_src, r.v_from, ''))) / length(r.v_from) <> 1 then
      raise exception '%: anchor also appears in a comment', r.fn;
    end if;
    execute replace(v_src, r.v_from, r.v_to);
  end loop;
end
$patch$;

do $verify$
declare
  v_feed text := regexp_replace(pg_get_functiondef('api_private.get_inbox_feed(uuid,timestamptz,text,text,integer)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
  v_cnt text := regexp_replace(pg_get_functiondef('api_private.get_inbox_unread_counts(uuid)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
begin
  if position('(SELECT likes FROM prefs)' in v_feed) = 0
     or position('(SELECT comments FROM prefs)' in v_feed) = 0
     or position('(SELECT mentions FROM prefs)' in v_feed) = 0 then
    raise exception 'get_inbox_feed does not apply inbox_preferences';
  end if;
  if position('and v_likes_on;' in v_cnt) = 0
     or position('and v_comments_on;' in v_cnt) = 0
     or position('(v_mentions_on or not' in v_cnt) = 0 then
    raise exception 'get_inbox_unread_counts does not apply inbox_preferences';
  end if;
  if has_table_privilege('anon', 'public.inbox_preferences', 'select') then
    raise exception 'anon can read inbox_preferences';
  end if;
end
$verify$;
