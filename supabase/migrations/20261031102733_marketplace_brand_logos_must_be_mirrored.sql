-- marketplace_brands.logo_url must point at our mirrored copy on img.queer.guide.
--
-- MEASURED 2026-10-31: 307 rows carried a non-null logo_url on a third-party
-- host (cdn.shopify.com 112, thumb.wikimedia.org 74, static.wixstatic.com 14,
-- images.squarespace-cdn.com 10, ...). At least one is broken in every browser:
-- Bad Dragon's static.bad-dragon.com apple-touch-icon fails with
-- net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin (Cross-Origin-Resource-Policy), so
-- its plate only ever showed the monogram. A hotlinked mark also never gets a
-- MEASURED logo_on_ink, because polarity is computed from the mirrored bytes;
-- all 307 held the column default or a hand-set guess.
--
-- THE WRITER WAS NOT CODE. `enrich-logos` mirrors before it stores, and nothing
-- else in the repo (or on any branch) writes marketplace_brands.logo_url. The
-- revision trail names the writer: all 307 current values were written between
-- 2026-10-30 08:45 and 2026-10-31 04:38 by `actor_kind='system'` with no
-- declared actor — direct SQL from curation sessions — carrying logo_source tags
-- (`retailer:verified:<shop>`, `verified_author_portrait:<source>`,
-- `verified_first_party_native_logo`, ...) that occur nowhere in the codebase.
-- A writer that is not code cannot be fixed in code, so the rule moves into the
-- table: whatever writes the column, the column cannot hold a hotlink.
--
-- 1. A BEFORE trigger diverts any non-img.queer.guide value into
--    `logo_origin_url` and stores NULL in `logo_url`. The write is not refused —
--    a curator's verified choice is kept as the source to mirror — but it is
--    never published as a hotlink. `logo_fetched_at` is left as the writer set
--    it, so `marketplace_brand_logo_candidates()` (which needs it NULL) does not
--    re-probe the row and overwrite a hand-verified mark with logo.dev's.
-- 2. `marketplace_brand_logos_to_mirror()` is the work list for the mirror
--    pass (here `enrich-logos {mode:'mirror_external'}`; moved to its own
--    function `marketplace-brand-logo-mirror` by 20261031110558): pending
--    diverted rows plus legacy hotlinks written before this trigger existed.
-- 3. An hourly automation drains it, so a diverted logo is mirrored and
--    measured within the hour instead of waiting for a human to remember.
--
-- A permanent mirror failure (4xx, not an image, too large) is stamped on
-- `logo_mirror_error` and leaves the row out of the work list, so the job
-- terminates instead of re-fetching the same dead URL hourly. A transient one
-- (5xx, timeout, upload failure) stamps nothing and is retried.

-- Applied live via MCP apply_migration on 2026-10-31 (which stamped this
-- version), so `db push` skips it. The lock_timeout is what the live apply ran
-- with: marketplace_brands is read by a frequent worklist refresh, and an
-- unbounded wait would queue every reader behind the ALTER.
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

-- The schedule. Registry row first; the cadence goes in the `schedule` COLUMN
-- (branch (d) of sync_automations_to_cron reads the column, not
-- action->>'schedule' — the trap 99991791182256 records), and the command is
-- copied from the live enrich-logos-organizations row.
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

  -- Behavioural probe, rolled back: a source-text check cannot tell a live
  -- guard from a dead one.
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

  -- The reconciler must intend to create the job, or the registry row is
  -- enabled and wired to nothing. Skipped if the job already exists.
  if not exists (select 1 from cron.job where jobname = 'enrich-logos-brands-mirror') then
    select public.sync_automations_to_cron(false) into v_plan;
    if not (v_plan -> 'recreated') ? 'enrich-logos-brands-mirror' then
      raise exception 'sync_automations_to_cron would NOT create enrich-logos-brands-mirror; plan was %', v_plan;
    end if;
  end if;
end
$verify$;
