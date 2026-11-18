-- These scalar CASE functions keep their exact expressions and search path.
-- PL/pgSQL caches expression plans; SQL functions with SET search_path cannot
-- inline and otherwise pay nested SQL executor startup for every worklist row.
do $patch$
declare signature text; definition text; body text; expression text; language_name text;
begin
 foreach signature in array array['public.review_case_family(jsonb)','public.review_case_key(jsonb)']loop
  select pg_get_functiondef(p.oid),p.prosrc,l.lanname into definition,body,language_name
  from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=signature::regprocedure;
  if language_name='plpgsql'and body like 'BEGIN RETURN (%); END;'then continue;end if;
  if language_name<>'sql'or body !~ '^[[:space:]]*select case'
    or body !~ 'end[[:space:]]*;?[[:space:]]*$'
    or position('LANGUAGE sql'in definition)=0 then raise exception 'Case classifier shape changed: %',signature;end if;
  expression:=regexp_replace(body,'^[[:space:]]*select[[:space:]]+','');
  expression:=regexp_replace(expression,';?[[:space:]]*$','');
  definition:=replace(definition,'LANGUAGE sql','LANGUAGE plpgsql');
  definition:=replace(definition,'AS $function$'||body||'$function$','AS $function$BEGIN RETURN ('||expression||'); END;$function$');
  execute definition;
 end loop;
end $patch$;
