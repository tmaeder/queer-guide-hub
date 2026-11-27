-- Reference copy promoted after the coordinated migration hold was released.
-- Authoritative migration: supabase/migrations/99991795038043_review_city_official_website_projection.sql
do $patch$
declare raw_definition text := pg_get_functiondef('api_private.jev_public_record(jsonb)'::regprocedure);
  definition text;
  anchor text := '''body'',''content'',''website'',''source_url''';
  addition text := '''body'',''content'',''website'',''official_website'',''source_url''';
begin
  definition:=regexp_replace(raw_definition, '--[^' || chr(10) || ']*', '', 'g');
  if position(addition in definition)>0 then return; end if;
  if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Public review projection changed; inspect before applying';
  end if;
  execute replace(raw_definition,anchor,addition);
end $patch$;
