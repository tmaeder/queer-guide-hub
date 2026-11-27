-- The old title/day arm must not refill the inbox with different cities/showtimes.
-- Apply the same explicit conflict veto already used by incoming identity matching.
do $$
declare def text; old text := 'legacy where not exists ('; replacement text :=
  'legacy where not api_private.event_identity_conflicts(api_private.event_identity_document(legacy.a_id),api_private.event_identity_document(legacy.b_id)) and not exists (';
begin
  def:=pg_get_functiondef('api_private.run_dedup_truth_sweep(text,text,integer)'::regprocedure);
  if strpos(def,replacement)>0 then return; end if;
  if strpos(def,old)=0 then raise exception 'Expected legacy event wrapper is missing'; end if;
  execute replace(def,old,replacement);
end $$;
