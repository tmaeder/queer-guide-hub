-- The fine classifier's inlined CTE repeats the group classifier throughout its
-- CASE ladder. Materialize one row so normalized text/group are each computed
-- once. This changes execution only, never a taxonomy rule or stored listing.
-- PostgreSQL 17: https://www.postgresql.org/docs/17/queries-with.html#QUERIES-WITH-CTE-MATERIALIZATION
do $$
declare signature text;definition text;anchor text:='WITH s AS (';
begin
 foreach signature in array array['public.marketplace_subcategory_group(text)','public.marketplace_subcategory_fine(text,text)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('WITH s AS MATERIALIZED (' in definition)>0 then continue;end if;
  if position(anchor in definition)=0 then raise exception 'Taxonomy CTE changed for %, inspect before optimizing',signature;end if;
  execute replace(definition,anchor,'WITH s AS MATERIALIZED (');
 end loop;
end $$;
