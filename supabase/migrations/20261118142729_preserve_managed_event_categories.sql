-- Preserve registered managed terms before the existing active-term validator.
-- The old literal list silently converted active networking/business/cultural
-- values to other. Unknown input still falls back to other, while inactive
-- registered terms reach the managed validator (which preserves unchanged
-- historical values and refuses new inactive assignments).
do $migration$
declare
 target regprocedure:='public.normalize_event_taxonomy()'::regprocedure;
 definition text:=pg_get_functiondef(target);
 declaration text:=$old$DECLARE
  -- Must stay identical to events_event_type_check and to src/lib/eventTypes.ts.
  v_valid CONSTANT text[] := ARRAY[
    'party','festival','pride','fetish','community','meetup','conference',
    'workshop','concert','film','drag','sports','art','theater','fundraiser',
    'protest','social','fair','cruise','comedy','exhibition','other'
  ];
$old$;
 previous text:='IF NEW.event_type = '''' OR NOT (NEW.event_type = ANY (v_valid)) THEN';
 replacement text:=$new$IF NEW.event_type = '' OR NOT EXISTS (
    SELECT 1 FROM public.event_types t WHERE t.slug = NEW.event_type
  ) THEN$new$;
begin
 if strpos(definition,previous)>0 and strpos(definition,declaration)>0 then
  definition:=replace(replace(definition,declaration,''),previous,replacement);
  execute definition;
 elsif strpos(definition,replacement)=0 or strpos(definition,'v_valid')>0 then
  raise exception 'Event taxonomy normalizer changed; inspect before applying';
 end if;
end $migration$;
