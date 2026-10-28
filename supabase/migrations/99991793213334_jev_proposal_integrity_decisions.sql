-- A malformed proposal can be rejected without asserting its underlying facts are true or false.
do $patch$
declare s text;anchor text;replacement text;
begin
 s:=pg_get_functiondef('api_private.jev_context(uuid,boolean)'::regprocedure);
 anchor:=' -- Never overwrite protected review or infer a safety-critical field.';
 replacement:=$insert$
 if q='milestone-review' and s->>'field'='description' and s#>'{proposed_value,issues}'='["uncertainty_language"]'::jsonb
 and nullif(btrim(s#>>'{proposed_value,replacement}'),'')is null then
 candidates:=jsonb_build_array(jsonb_build_object('id','reject','action','reject',
 'payload',jsonb_build_object('integrity_rule','uncertainty_without_replacement'),
 'explanation','Reject only the detector proposal that flags qualified historical wording solely for uncertainty_language and supplies no replacement or contradictory evidence. Qualified prose is not defective merely for saying possibly. Keep the current text and every factual verification status unchanged; do not claim its historical assertions were checked.'));
 elsif q='entity-links' and s->>'candidate_id'is null then
 candidates:=jsonb_build_array(jsonb_build_object('id','reject','action','reject',
 'payload',jsonb_build_object('integrity_rule','missing_link_candidate'),
 'explanation','Reject this unusable relationship proposal because it has no canonical candidate ID. Retain the source mention and do not assert that the named entity does not exist.'));
 end if;
 -- Never overwrite protected review or infer a safety-critical field.
$insert$;
 if position(anchor in s)=0 then raise exception 'Jev context patch anchor changed';end if;
 execute replace(s,anchor,replacement);
end $patch$;
