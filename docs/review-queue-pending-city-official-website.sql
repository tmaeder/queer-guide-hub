-- Prepared during the coordinated production DDL hold; NOT applied.
-- The field is already public city data. Only expose its explicit locator;
-- existing HTTPS/SSRF/credential guards and fetch limits still apply in research.ts.
do $patch$
declare definition text;
  anchor text := '''body'',''content'',''website'',''source_url''';
  addition text := '''body'',''content'',''website'',''official_website'',''source_url''';
begin
  definition:=pg_get_functiondef('api_private.jev_public_record(jsonb)'::regprocedure);
  if position(addition in definition)>0 then return; end if;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Public review projection changed; inspect before applying';
  end if;
  execute replace(definition,anchor,addition);
end $patch$;
