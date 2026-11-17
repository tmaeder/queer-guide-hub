-- An explicitly archived non-city is not an unresolved active city.
-- Country/coordinate verification still runs and can retain an independent conflict.
do $migration$
declare definition text; old_predicate text:=$old$where c.id=p_id and c.duplicate_of_id is null$old$;
new_predicate text:=$new$where c.id=p_id and c.duplicate_of_id is null
  and not (coalesce(c.shell_status,'')='ghost' and c.seo_indexable is false
    and coalesce(c.enrichment_status#>>'{disposition,state}','')='not_a_city')$new$;
begin
 select pg_get_functiondef('public.geo_cms_classification_issue(uuid)'::regprocedure) into definition;
 if position(new_predicate in definition)>0 then return;end if;
 if position(old_predicate in definition)=0 then raise exception 'Unexpected city classification predicate; inspect before replacing';end if;
 execute replace(definition,old_predicate,new_predicate);
end $migration$;
