-- The read phase takes seconds; unconditional conflict updates rewrite every
-- cached case and amplify writes. Keep all current IDs but update only changes.
do $patch$
declare s text; anchor text;
begin
 s:=pg_get_functiondef('public.refresh_admin_review_worklist()'::regprocedure);
 anchor:='fingerprint=excluded.fingerprint,active=true,updated_at=now() returning id)';
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'Case upsert anchor changed'; end if;
 s:=replace(s,anchor,'fingerprint=excluded.fingerprint,active=true,updated_at=now()
 where row(admin_review_cases.stage,admin_review_cases.required_role,admin_review_cases.item,
  admin_review_cases.members,admin_review_cases.fingerprint,admin_review_cases.active)
 is distinct from row(excluded.stage,excluded.required_role,excluded.item,excluded.members,excluded.fingerprint,true)
 returning id)');
 anchor:='insert into review_worklist_refresh_ids select id from saved';
 if (length(s)-length(replace(s,anchor,'')))/length(anchor)<>1 then raise exception 'Complete case ID anchor changed'; end if;
 s:=replace(s,anchor,'insert into review_worklist_refresh_ids select id from grouped');
 execute s;
end $patch$;
