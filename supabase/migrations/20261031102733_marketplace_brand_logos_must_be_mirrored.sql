-- RECOVERED FROM PROD BY scripts/recover-migration-drift.mjs.
--
-- Applied to prod as version 20261031102733 with no repo file — the signature of
-- MCP `apply_migration`, which stamps a version and commits nothing. An applied
-- version with no file fails migration-versions on every PR in the repo and
-- makes `db push` refuse to run.
--
-- Reconstructed from `schema_migrations.statements`, which holds the PARSED
-- statements: trailing semicolons are stripped (re-added here) and any original
-- comment header is NOT recorded, so the reasoning that accompanied this
-- migration is lost. Verified by md5 against a server-computed digest.
--
-- Never re-run: `db push` matches on version and skips an applied one. The file
-- exists so history is complete and a rebuild from zero works.
set local lock_timeout = '15s';

alter table public.marketplace_brands
  add column if not exists logo_origin_url text,
  add column if not exists logo_mirror_error text;

comment on column public.marketplace_brands.logo_origin_url is
  'Where the mirrored logo came from. A non-img.queer.guide value written to '
  'logo_url is diverted here by trg_marketplace_brands_logo_mirrored and mirrored '
  'by enrich-logos {mode:''mirror_external''}.';
comment on column public.marketplace_brands.logo_mirror_error is
  'Why the last mirror attempt of logo_origin_url failed permanently. Non-null '
  'removes the row from marketplace_brand_logos_to_mirror(); clear it to retry.';

create or replace function public.marketplace_brands_logo_must_be_mirrored()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $fn$
begin
  if new.logo_url is not null and new.logo_url not like 'https://img.queer.guide/%' then
    new.logo_origin_url   := new.logo_url;
    new.logo_url          := null;
    -- Polarity is measured from the mirrored bytes; a value set beside a
    -- hotlink is a guess, and the mirror pass rewrites it.
    new.logo_on_ink       := false;
    new.logo_mirror_error := null;
  elsif tg_op = 'UPDATE'
        and new.logo_url is null
        and old.logo_url is not null
        and new.logo_origin_url is not distinct from old.logo_origin_url then
    -- An explicit clear cancels any pending mirror: otherwise the next run would
    -- quietly put back the logo a human just removed.
    new.logo_origin_url   := null;
    new.logo_mirror_error := null;
  elsif new.logo_url is not null then
    new.logo_mirror_error := null;
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_marketplace_brands_logo_mirrored on public.marketplace_brands;
create trigger trg_marketplace_brands_logo_mirrored
  before insert or update of logo_url on public.marketplace_brands
  for each row execute function public.marketplace_brands_logo_must_be_mirrored();

create or replace function public.marketplace_brand_logos_to_mirror(p_limit integer default 50)
returns table (id uuid, display_name text, source_url text, legacy_hotlink boolean)
language sql
stable
security definer
set search_path = public, pg_catalog
as $fn$
  select b.id,
         b.display_name,
         coalesce(case when b.logo_url not like 'https://img.queer.guide/%' then b.logo_url end,
                  b.logo_origin_url) as source_url,
         b.logo_url is not null as legacy_hotlink
  from public.marketplace_brands b
  where b.logo_mirror_error is null
    and (
      (b.logo_url is not null and b.logo_url not like 'https://img.queer.guide/%')
      or (b.logo_url is null and b.logo_origin_url is not null)
    )
  order by b.product_count desc nulls last, b.id
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
$fn$;

revoke all on function public.marketplace_brand_logos_to_mirror(integer) from public, anon, authenticated;
grant execute on function public.marketplace_brand_logos_to_mirror(integer) to service_role;

insert into public.admin_automations (slug, name, description, "trigger", schedule, action, enabled, conditions)
select
  'enrich_logos_brands_mirror',
  'Mirror marketplace brand logos',
  'Mirrors marketplace_brands logos that were written as third-party hotlinks to '
    || 'img.queer.guide and measures logo_on_ink from the mirrored bytes.',
  '{"type": "schedule"}'::jsonb,
  '41 * * * *',
  jsonb_build_object(
    'type', 'cron',
    'jobname', 'enrich-logos-brands-mirror',
    'command', $cmd$
  SELECT public.automation_http_post(
    url := 'https://xqeacpakadqfxjxjcewc.supabase.co/functions/v1/enrich-logos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_invoke_secret')
    ),
    body := '{"table": "marketplace_brands", "mode": "mirror_external", "batch_size": 40}'::jsonb,
    timeout_milliseconds := 250000
  ) AS request_id;
$cmd$),
  true,
  '[]'::jsonb
where not exists (select 1 from public.admin_automations where slug = 'enrich_logos_brands_mirror');

do $verify$
declare
  v_id     uuid;
  v_url    text;
  v_origin text;
  v_plan   jsonb;
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.marketplace_brands'::regclass
      and tgname = 'trg_marketplace_brands_logo_mirrored' and tgenabled <> 'D'
  ) then
    raise exception 'trg_marketplace_brands_logo_mirrored is not attached';
  end if;

  select b.id into v_id from public.marketplace_brands b order by b.id limit 1;
  if v_id is not null then
    begin
      update public.marketplace_brands
      set logo_url = 'https://example.com/probe-logo.png'
      where id = v_id
      returning logo_url, logo_origin_url into v_url, v_origin;
      if v_url is not null or v_origin is distinct from 'https://example.com/probe-logo.png' then
        raise exception 'logo mirror guard did not divert a hotlink (logo_url=%, origin=%)', v_url, v_origin;
      end if;
      raise exception 'rollback_probe';
    exception when raise_exception then
      if sqlerrm <> 'rollback_probe' then raise; end if;
    end;
  end if;

  if has_function_privilege('anon', 'public.marketplace_brand_logos_to_mirror(integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.marketplace_brand_logos_to_mirror(integer)', 'EXECUTE') then
    raise exception 'marketplace_brand_logos_to_mirror is reachable by anon/authenticated';
  end if;

  if not exists (select 1 from cron.job where jobname = 'enrich-logos-brands-mirror') then
    select public.sync_automations_to_cron(false) into v_plan;
    if not (v_plan -> 'recreated') ? 'enrich-logos-brands-mirror' then
      raise exception 'sync_automations_to_cron would NOT create enrich-logos-brands-mirror; plan was %', v_plan;
    end if;
  end if;
end
$verify$;;
