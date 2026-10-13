-- ISOLATED TEST DATABASE ONLY. Minimal article schema and authorization adapter;
-- live authorization is separately verified against the deployed helper.
create role anon;
create role authenticated;
create role service_role;
create table public.news_articles (id bigint generated always as identity, author text, title text);
create function public.news_decode_entities(t text) returns text language sql immutable as $$ select replace(t,'&amp;','&') $$;
create function public.assert_admin_or_internal() returns void language plpgsql stable as $$
declare claims jsonb := nullif(current_setting('request.jwt.claims',true),'')::jsonb;
begin
if claims is null or claims->>'role'='service_role' or claims->>'user_role' in ('admin','moderator') then return; end if;
raise exception 'unauthorized' using errcode='42501';
end $$;
