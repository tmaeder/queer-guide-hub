-- Closing an unusable uncertainty-only detector proposal does not verify or
-- invalidate the historical record. Preserve its existing verification stamp.
-- Ordinary factual proposals retain their existing invalidation behavior.
do $migration$
declare s text;anchor text:=' update public.milestones set last_verified_at=null where id=e;';
replacement text:=$patch$ -- proposal_integrity_preserves_verification: exact structural rejection only.
 if (a='reject'
  and k#>>'{payload,integrity_rule}'='uncertainty_without_replacement'
  and p->>'field'='description'
  and p#>'{proposed_value,issues}'='["uncertainty_language"]'::jsonb
  and nullif(btrim(p#>>'{proposed_value,replacement}'),'') is null) is distinct from true then
  update public.milestones set last_verified_at=null where id=e;
 end if;$patch$;
begin
 s:=pg_get_functiondef('api_private.jev_apply(public.admin_review_cases,jsonb,jsonb,text)'::regprocedure);
 if position('proposal_integrity_preserves_verification' in s)>0 then return;end if;
 if position(anchor in s)=0 or length(s)-length(replace(s,anchor,''))<>length(anchor) then
  raise exception 'Milestone verification apply branch changed; inspect before patching';
 end if;
 execute replace(s,anchor,replacement);
end $migration$;
