-- 99991792712269_event_gap_captured_source_copy
--
-- Supply bounded original source fragments and occurrence identity to the
-- deterministic HTML reader. Preserve the existing worklist and lease rules.
do $patch$
declare target regprocedure;src text;
 anchor text:='''description'',left(coalesce(es.payload#>>''{raw,description}'',es.payload#>>''{raw,descShort}''),20000),';
 replacement text:='''description'',left(coalesce(nullif(btrim(es.payload#>>''{raw,description}''),''''),es.payload#>>''{raw,descShort}''),20000),
   ''full_description'',left(es.payload#>>''{raw,description}'',100001),
   ''descShort'',left(es.payload#>>''{raw,descShort}'',20000),
   ''name'',es.payload#>>''{raw,name}'',''slug'',es.payload#>>''{raw,slug}'',
   ''start'',es.payload#>>''{raw,start}'',''end'',es.payload#>>''{raw,end}'',
   ''source_id'',es.id,''payload_hash'',es.payload_hash,';
begin
 target:=coalesce(to_regprocedure('api_private.claim_event_gaps(text,uuid,integer,uuid[],boolean)'),to_regprocedure('public.claim_event_gaps(text,uuid,integer,uuid[],boolean)'));
 select pg_get_functiondef(target) into src;
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>2 then
  raise exception 'Captured event source projection anchor changed'; end if;
 execute replace(src,anchor,replacement);
end $patch$;

