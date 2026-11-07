-- Show saved business contacts beside the surviving venue in the admin-only
-- comparison. Preserve the existing safety gate for every record.
do $patch$
declare
  definition text:=pg_get_functiondef('api_private.admin_review_business_merge_context(uuid)'::regprocedure);
  change record;
begin
  for change in select * from (values
    ($old$'website',case when not o.safety_gated then o.website end)$old$,
     $new$'website',case when not o.safety_gated then o.website end,
   'address',case when not o.safety_gated then o.address end,
   'email',case when not o.safety_gated then o.email end,
   'phone',case when not o.safety_gated then o.phone end)$new$),
    ($old$'address',case when not d.safety_gated then d.address end) end,$old$,
     $new$'address',case when not d.safety_gated then d.address end,
   'email',case when not d.safety_gated then d.email end,
   'phone',case when not d.safety_gated then d.phone end) end,$new$),
    ($old$'website',case when not k.safety_gated then k.website end,'closed'$old$,
     $new$'website',case when not k.safety_gated then k.website end,
   'email',case when not k.safety_gated then k.email end,
   'phone',case when not k.safety_gated then k.phone end,'closed'$new$),
    ($old$'website',case when not ko.safety_gated then ko.website end) end,$old$,
     $new$'website',case when not ko.safety_gated then ko.website end,
   'address',case when not ko.safety_gated then ko.address end,
   'email',case when not ko.safety_gated then ko.email end,
   'phone',case when not ko.safety_gated then ko.phone end) end,$new$)
  ) changes(before_text,after_text) loop
    if (length(definition)-length(replace(definition,change.before_text,'')))/length(change.before_text)<>1 then
      raise exception 'Business review comparison contract changed';
    end if;
    definition:=replace(definition,change.before_text,change.after_text);
  end loop;
  execute definition;
end $patch$;
