-- 99991795038043_review_city_official_website_projection.sql
-- Expose the existing public city official website locator to bounded review research.
-- Function ownership, grants, security and unrelated behavior remain unchanged.
do $patch$
declare definition text; code_definition text;
  anchor text := '''body'',''content'',''website'',''source_url''';
  addition text := '''body'',''content'',''website'',''official_website'',''source_url''';
begin
  definition:=pg_get_functiondef('api_private.jev_public_record(jsonb)'::regprocedure);
  -- Inspect executable text; retain the original definition for replacement.
  code_definition:=regexp_replace(pg_get_functiondef('api_private.jev_public_record(jsonb)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g');
  if position(addition in code_definition)>0 then return; end if;
  if (length(code_definition)-length(replace(code_definition,anchor,'')))/length(anchor)<>1 then
    raise exception 'Public review projection changed; inspect before applying';
  end if;
  execute replace(definition,anchor,addition);
end $patch$;
