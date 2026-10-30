-- Private submissions/account data are outside the approved Jev rollout. A
-- staging queue name alone does not establish that its source is public.
create or replace function api_private.jev_staging_source_allowed(p_source text,p_entity text)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(case p_entity
 when 'news_article' then p_source='rss-news'
 when 'event' then p_source=any(array[
  'eventfrog','gay-ch','gaybasel','gayout','gaytravel4u','haz-ch','lgbtnetwork',
  'milchjugend','queer-kalender','rheinfetisch','qcal','gaycities','queerde'])
 when 'venue' then p_source=any(array['gaybasel','eventfrog','milchjugend','haz-ch'])
 when 'marketplace' then p_source=any(array[
  'adamssceptre','autostraddle','backroomgear','beefcakeswimwear','bigbudpress',
  'charliebymz','effenberger','fetchshop','gfwclothing','mr-riegillio','ohmyfantasy',
  'orttu','peaudeloup','pridesocks','prowlerred','puppyplayexpert','regulation',
  'rubbertwunk','rufskin','ryvkstudio','spectrumoutfitters','twink-x','wetforher',
  'abuniverse','friend-of-dorothy'])
 else false end,false);
$$;
revoke all on function api_private.jev_staging_source_allowed(text,text) from public,anon,authenticated;
grant execute on function api_private.jev_staging_source_allowed(text,text) to service_role;

do $migration$
declare s text;anchor text:=E' if q=''staging'' then\n -- Only source content projections, never raw scraped metadata or user submissions.';
replacement text:=$patch$ if q='staging' then
 if not api_private.jev_staging_source_allowed(s->>'source_name',s->>'entity_type') then
  return jsonb_build_object('item',jsonb_build_object('queue_type',q),'record',null,'proposal',null,
   'related','{}'::jsonb,'research',null,'candidates','[]'::jsonb,'urls','[]'::jsonb,
   'input_hash',md5(c.fingerprint),'blocker','source_not_authorized');
 end if;
 -- Only source content projections, never raw scraped metadata or user submissions.$patch$;
begin
 s:=pg_get_functiondef('api_private.jev_context(uuid,boolean)'::regprocedure);
 if position('api_private.jev_staging_source_allowed' in s)>0 then return;end if;
 if position(anchor in s)=0 or length(s)-length(replace(s,anchor,''))<>length(anchor) then
  raise exception 'Jev context source projection changed; review before patching';
 end if;
 execute replace(s,anchor,replacement);
end $migration$;
