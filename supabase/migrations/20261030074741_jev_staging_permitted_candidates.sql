-- Offer only native-permitted actions. The generic approval plus the passing
-- news gate approval previously produced duplicate IDs; response distributions
-- then could not match the parser's option count. Ungated staging must not be
-- offered a generic approval that the native apply guard will always reject.
do $migration$
declare s text;
old_clause text:=$old$if q not in ('entity-links','duplicates','tags','news-quality','tag-enrichment','ai-suggestions') and s is not null then$old$;
new_clause text:=$new$if q not in ('entity-links','duplicates','tags','news-quality','tag-enrichment','ai-suggestions','staging') and s is not null then$new$;
begin
 s:=pg_get_functiondef('api_private.jev_context(uuid,boolean)'::regprocedure);
 if position(new_clause in s)>0 then return;end if;
 if position(old_clause in s)=0 or length(s)-length(replace(s,old_clause,''))<>length(old_clause) then
  raise exception 'Review candidate construction changed; inspect before patching';
 end if;
 execute replace(s,old_clause,new_clause);
end $migration$;
