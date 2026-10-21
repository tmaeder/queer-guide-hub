-- A scheduled run and an explicit cleanup may observe the same missing review.
-- NOT EXISTS alone is insufficient across concurrent statements (and event
-- triggers); the pending-review unique index remains the final arbiter.
do $patch$
declare src text; target regprocedure; before_text text:='      RETURNING 1
    )
    SELECT (SELECT count(*) FROM upd), (SELECT count(*) FROM rq)';
 after_text text:='      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM upd), (SELECT count(*) FROM rq)';
begin
 target:=coalesce(to_regprocedure('api_private.link_event_venues(integer,boolean,boolean)'),
   'public.link_event_venues(integer,boolean,boolean)'::regprocedure);
 select pg_get_functiondef(target) into src;
 if (length(src)-length(replace(src,before_text,'')))/length(before_text)<>1 then raise exception 'Venue review insert anchor changed'; end if;
 src:=replace(src,before_text,after_text);
 src:=replace(src,'  PERFORM public.assert_admin_or_internal();',
  '  PERFORM public.assert_admin_or_internal();
  IF NOT p_dry_run AND NOT pg_try_advisory_xact_lock(hashtext(''link_event_venues'')) THEN
    RETURN jsonb_build_object(''skipped'',true,''reason'',''already_running'');
  END IF;');
 execute src;
end $patch$;
