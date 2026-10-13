-- Keep one geocoder worker and its lease, but eliminate the idle interval
-- between its usual 40-second batch and the next one-minute cron tick.
select cron.schedule(
  'entity_location_completion',
  '50 seconds',
  (select command from cron.job where jobname = 'entity_location_completion')
);

update public.admin_automations
set schedule = '50 seconds'
where slug = 'entity_location_completion';
