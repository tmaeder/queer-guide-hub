-- The managed event taxonomy is the write contract. Hardcoded choices offered
-- invalid legacy slugs and omitted active categories such as networking.
do $migration$
declare
 target regprocedure:='api_private.jev_context(uuid,boolean)'::regprocedure;
 definition text:=pg_get_functiondef(target);
 previous text:=$old$ select jsonb_agg(jsonb_build_object('id','category_'||x,'action','approve','payload',jsonb_build_object('event_type',x),'explanation','Set the explicit source-supported activity category to '||x)) into candidates
 from unnest(array['party','drag','concert','festival','pride','workshop','social','sports','art','theatre','film','comedy','karaoke','bingo','meetup','other'])x;$old$;
 replacement text:=$new$ select coalesce(jsonb_agg(jsonb_build_object(
  'id','category_'||t.slug,'action','approve','payload',jsonb_build_object('event_type',t.slug),
  'explanation','Set the explicit source-supported activity category to '||t.slug||' ('||t.name||')'||
    case when nullif(btrim(t.description),'')is null then '' else ': '||t.description end
 )order by t.slug),'[]'::jsonb)into candidates
 from public.event_types t where t.is_active;
 -- Revalidate the entire option catalogue at apply time, including removals
 -- and wording changes while a worker holds a lease.
 full_input:=full_input||jsonb_build_object('event_category_candidates',candidates);$new$;
begin
 if strpos(definition,previous)>0 then
  if length(definition)-length(replace(definition,previous,''))<>length(previous)then
   raise exception 'Ambiguous event category catalogue';
  end if;
  execute replace(definition,previous,replacement);
 elsif strpos(definition,replacement)=0 then
  raise exception 'Review category catalogue definition changed; inspect before applying';
 end if;
end $migration$;
