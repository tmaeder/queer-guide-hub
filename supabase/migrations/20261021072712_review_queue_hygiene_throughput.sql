-- 100+100 record repairs finish in 2.4s on production. Raise the bounded cap to
-- 400 per family per five-minute pass; keep the <=2000 caller clamp and SKIP LOCKED.
do $patch$
declare v_src text; v_code text; v_before text:='least(v_limit,100)'; v_after text:='least(v_limit,400)'; v_n int;
begin
 select pg_get_functiondef('public.run_review_queue_hygiene(integer,boolean)'::regprocedure) into v_src;
 select regexp_replace(pg_get_functiondef('public.run_review_queue_hygiene(integer,boolean)'::regprocedure), '--[^' || chr(10) || ']*', '', 'g') into v_code;
 v_n:=(length(v_code)-length(replace(v_code,v_before,'')))/length(v_before);
 if v_n<>2 then raise exception 'expected two bounded repair caps, got %',v_n; end if;
 execute replace(v_src,v_before,v_after);
end $patch$;
