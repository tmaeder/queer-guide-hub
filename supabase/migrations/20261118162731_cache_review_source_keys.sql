-- Keep source-key authorization semantics and security settings unchanged,
-- while caching the aggregate expression plan used by every case write.
do $patch$
declare definition text:=pg_get_functiondef('public.review_case_source_keys(jsonb)'::regprocedure);
 body text; language_name text;
begin
 select p.prosrc,l.lanname into body,language_name from pg_proc p join pg_language l on l.oid=p.prolang where p.oid='public.review_case_source_keys(jsonb)'::regprocedure;
 if language_name='plpgsql'and body like 'BEGIN RETURN (%); END;'then return;end if;
 if language_name<>'sql'or btrim(regexp_replace(body,'[[:space:]]+',' ','g'))<>$expected$select coalesce(array_agg(distinct m->>'queue_type'),'{}'::text[]) from jsonb_array_elements(p_members) m$expected$
 then raise exception 'Source-key expression changed';end if;
 definition:=replace(definition,'LANGUAGE sql','LANGUAGE plpgsql');
 definition:=replace(definition,'AS $function$'||body||'$function$','AS $function$BEGIN RETURN ('||btrim(body)||'); END;$function$');
 execute definition;
end $patch$;
