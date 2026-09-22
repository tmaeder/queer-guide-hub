begin;

-- The rejected URLs were already removed and preserved in the remediation
-- audit. Their public serving state is now an explicit, safe absence while the
-- open image_url review remains available for future portrait replacement.
insert into private.personality_remediation_audit
  (batch_key,personality_id,field_name,old_value,new_value,reason)
select 'personality-image-quarantine-resolved-v1',p.id,'image_status',to_jsonb(p.image_status),
  to_jsonb('unavailable'::text),'rejected placeholder removed; safe public fallback is no image'
from public.personalities p
where p.visibility='public' and p.image_status='rejected' and p.image_url is null
on conflict do nothing;

update public.personalities p
set image_status='unavailable',updated_at=now()
from private.personality_remediation_audit a
where a.batch_key='personality-image-quarantine-resolved-v1'
  and a.personality_id=p.id and a.field_name='image_status'
  and p.image_status='rejected' and p.image_url is null;

insert into public.admin_automations
  (slug,name,description,managed_by,enabled,trigger,conditions,action,schedule)
values (
  'personality_quality_signal_prune','Prune personality quality signals',
  'Retains the newest signal per personality/type/source and removes superseded history older than 30 days.',
  'system',true,'{"type":"schedule"}'::jsonb,'[]'::jsonb,
  '{"type":"rpc","fn":"prune_personality_quality_signals"}'::jsonb,'25 2 * * *'
)
on conflict(slug) do update set name=excluded.name,description=excluded.description,
  enabled=true,trigger=excluded.trigger,conditions=excluded.conditions,
  action=excluded.action,schedule=excluded.schedule,consecutive_failures=0;

do $$ begin
  if exists(select 1 from cron.job where jobname='personality_quality_signal_prune') then
    perform cron.unschedule('personality_quality_signal_prune');
  end if;
end $$;
select cron.schedule('personality_quality_signal_prune','25 2 * * *',
  $cron$select public.prune_personality_quality_signals(interval '30 days')$cron$);

commit;
