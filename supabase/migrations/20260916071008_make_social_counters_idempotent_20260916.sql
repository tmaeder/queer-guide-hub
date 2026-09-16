-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20260916071008 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.

create table if not exists security_audit.phase9_20260916_counter_function_snapshot (
  object_identity text primary key,
  original_definition text not null,
  captured_at timestamptz not null default now()
);
revoke all on table security_audit.phase9_20260916_counter_function_snapshot from public, anon, authenticated;

insert into security_audit.phase9_20260916_counter_function_snapshot(object_identity,original_definition)
select p.oid::regprocedure::text,pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
 'increment_comment_likes','decrement_comment_likes',
 'increment_post_likes','decrement_post_likes','increment_post_comments'
)
on conflict (object_identity) do nothing;

create or replace function public.increment_comment_likes(comment_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.post_comments c
  set likes_count = (select count(*)::integer from public.comment_likes l where l.comment_id=c.id)
  where c.id=comment_id;
end
$function$;

create or replace function public.decrement_comment_likes(comment_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.post_comments c
  set likes_count = (select count(*)::integer from public.comment_likes l where l.comment_id=c.id)
  where c.id=comment_id;
end
$function$;

create or replace function public.increment_post_likes(post_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.community_posts p
  set likes_count = (select count(*)::integer from public.post_likes l where l.post_id=p.id)
  where p.id=post_id;
end
$function$;

create or replace function public.decrement_post_likes(post_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.community_posts p
  set likes_count = (select count(*)::integer from public.post_likes l where l.post_id=p.id)
  where p.id=post_id;
end
$function$;

create or replace function public.increment_post_comments(post_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $function$
begin
  update public.community_posts p
  set comments_count = (select count(*)::integer from public.post_comments c where c.post_id=p.id)
  where p.id=post_id;
end
$function$;

revoke all on function public.increment_comment_likes(uuid) from public, anon;
revoke all on function public.decrement_comment_likes(uuid) from public, anon;
revoke all on function public.increment_post_likes(uuid) from public, anon;
revoke all on function public.decrement_post_likes(uuid) from public, anon;
revoke all on function public.increment_post_comments(uuid) from public, anon;
grant execute on function public.increment_comment_likes(uuid) to authenticated, service_role;
grant execute on function public.decrement_comment_likes(uuid) to authenticated, service_role;
grant execute on function public.increment_post_likes(uuid) to authenticated, service_role;
grant execute on function public.decrement_post_likes(uuid) to authenticated, service_role;
grant execute on function public.increment_post_comments(uuid) to authenticated, service_role;
;
