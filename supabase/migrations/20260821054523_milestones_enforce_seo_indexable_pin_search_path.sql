-- Lint fix: pin search_path on the trigger fn added by the prior migration
-- (matches milestones_touch_updated_at's convention on the same table).
create or replace function public.milestones_enforce_seo_indexable()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (new.status <> 'published' or new.review_status <> 'approved' or new.safety_gated)
     and new.seo_indexable is distinct from false then
    new.seo_indexable := false;
  end if;
  return new;
end;
$function$;
