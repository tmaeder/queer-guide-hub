-- Recovered from production migration history. Already applied; do not renumber.
-- Recorded statement digest (MD5): e57184f37017befaea2a8fb700f6e5df
-- Revalidation must fail closed when source/status fields become NULL after a
-- claim. SQL WHERE already excludes UNKNOWN; a PL/pgSQL IF needs COALESCE.
do $migration$
declare src text; guard text;
begin
 src:=pg_get_functiondef('public.finish_event_gap(uuid,text,uuid,jsonb,jsonb,text,jsonb)'::regprocedure);
 if position('or not coalesce(' in src)>0 then return;end if;
 guard:=substring(src from '(if e\.duplicate_of_id is not null or not \([\s\S]*?\) then)');
 if guard is null then raise exception 'Historical finish guard changed; inspect before patching';end if;
 execute replace(src,guard,replace(replace(guard,'or not (','or not coalesce('),') then',',false) then'));
end $migration$;
;

