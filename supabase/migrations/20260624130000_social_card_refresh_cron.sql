-- Daily cron for the privacy-safe social-card resolver (Pillar B).
-- Seeds social_profiles from entity social links (enrichable platforms) and
-- resolves pending/stale rows via the social-card-refresh edge function, which
-- calls the image-cdn worker /social/resolve (avatars mirrored to R2).

create or replace function public.run_social_card_refresh()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id   uuid;
  v_on   boolean;
begin
  select id, enabled into v_id, v_on from public.admin_automations where slug = 'social_card_refresh';
  if v_id is not null and v_on is false then
    update public.admin_automations set last_run_at = now(), last_run_status = 'paused' where id = v_id;
    return;
  end if;

  perform net.http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/social-card-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
    ),
    body := jsonb_build_object('mode', 'both', 'batch', 40)
  );

  if v_id is not null then
    update public.admin_automations set last_run_at = now(), last_run_status = 'success' where id = v_id;
  end if;
end;
$$;

grant execute on function public.run_social_card_refresh() to service_role;

insert into public.admin_automations (slug, name, description, managed_by, enabled, trigger, conditions, action, schedule)
values (
  'social_card_refresh',
  'Social card resolver',
  'Seeds social_profiles from entity social links and resolves Bluesky/Mastodon/Spotify/SoundCloud profiles (avatars mirrored to R2) for privacy-safe link cards.',
  'system',
  false, -- dormant until image-cdn worker + IMAGE_CDN_ADMIN_SECRET are deployed; enable in /admin
  '{"type":"schedule"}'::jsonb,
  '[]'::jsonb,
  '{"type":"run_function","function":"run_social_card_refresh"}'::jsonb,
  '40 4 * * *'
)
on conflict (slug) do update
set description = excluded.description,
    enabled = excluded.enabled,
    trigger = excluded.trigger,
    conditions = excluded.conditions,
    action = excluded.action,
    schedule = excluded.schedule;

select cron.unschedule('social_card_refresh') where exists (
  select 1 from cron.job where jobname = 'social_card_refresh'
);
select cron.schedule(
  'social_card_refresh',
  '40 4 * * *',
  $cron$ select public.run_social_card_refresh(); $cron$
);
