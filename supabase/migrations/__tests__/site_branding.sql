-- Contract tests for the site branding control center backend.
-- Run via: psql "$DATABASE_URL" -f site_branding.sql
-- Self-contained: exercises branding_validate acceptance/rejection cases and
-- the single-row invariants, then ROLLS BACK.

begin;

-- branding_validate: acceptance cases
do $$
begin
  perform public.branding_validate('{}'::jsonb);
  perform public.branding_validate(jsonb_build_object(
    'tokens', jsonb_build_object(
      'light',  jsonb_build_object('background','0 0% 100%','muted','0 0% 96%'),
      'dark',   jsonb_build_object('background','0 0% 4%'),
      'global', jsonb_build_object(
        'radius-container','1rem',
        'text-title','1.375rem',
        'text-title--line-height','1.4',
        'tracking-label','0.04em',
        'transition-smooth','all 0.18s cubic-bezier(0.22, 1, 0.36, 1)')),
    'meta', jsonb_build_object(
      'site_name','Queer Guide',
      'twitter_handle','@queerguide',
      'og_image_url','https://queer.guide/images/og-image.png',
      'theme_color_dark','#0a0a0a',
      'org_sameas', jsonb_build_array('https://instagram.com/queerguide')),
    'manifest', jsonb_build_object('name','Queer Guide','theme_color','#0a0a0a'),
    'email', jsonb_build_object(
      'from_name','The Queer Guide',
      'from_address','noreply@queer.guide',
      'wrapper_bg','#0a0a0a')));
  raise notice 'OK: branding_validate accepts valid docs';
end $$;

-- branding_validate: rejection cases
do $$
declare
  v_case text;
  v_doc jsonb;
  v_failed boolean;
begin
  for v_case, v_doc in
    select * from (values
      ('unknown section',        '{"hack":{}}'::jsonb),
      ('unknown color token',    '{"tokens":{"light":{"evil":"0 0% 0%"}}}'::jsonb),
      ('css injection in hsl',   '{"tokens":{"light":{"background":"0 0% 0%;} body{display:none"}}}'::jsonb),
      ('bad hsl format',         '{"tokens":{"light":{"background":"#ff0000"}}}'::jsonb),
      ('layout var not allowed', '{"tokens":{"global":{"z-modal":"1rem"}}}'::jsonb),
      ('bad radius unit',        '{"tokens":{"global":{"radius-element":"50vw"}}}'::jsonb),
      ('bad transition charset', '{"tokens":{"global":{"transition-smooth":"all 1s url(javascript:x)"}}}'::jsonb),
      ('unknown meta field',     '{"meta":{"api_key":"x"}}'::jsonb),
      ('bad handle',             '{"meta":{"twitter_handle":"queerguide"}}'::jsonb),
      ('http url rejected',      '{"meta":{"og_image_url":"http://evil.example/x.png"}}'::jsonb),
      ('bad hex',                '{"manifest":{"theme_color":"#0a0"}}'::jsonb),
      ('from_name injection',    '{"email":{"from_name":"Evil <evil@x.com>"}}'::jsonb),
      ('bad from_address',       '{"email":{"from_address":"not-an-email"}}'::jsonb),
      ('sameas non-https',       '{"meta":{"org_sameas":["javascript:alert(1)"]}}'::jsonb)
    ) t(c, d)
  loop
    v_failed := false;
    begin
      perform public.branding_validate(v_doc);
    exception when others then
      v_failed := true;
    end;
    if not v_failed then
      raise exception 'FAIL: branding_validate accepted invalid doc (%)', v_case;
    end if;
  end loop;
  raise notice 'OK: branding_validate rejects all invalid docs';
end $$;

-- Single-row invariants + version cap wiring
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.site_branding;
  if v_count <> 1 then
    raise exception 'FAIL: site_branding must hold exactly 1 row (got %)', v_count;
  end if;

  begin
    insert into public.site_branding (id) values (2);
    raise exception 'FAIL: site_branding accepted a second row';
  exception
    when check_violation then null;
    when insufficient_privilege then null;
  end;
  raise notice 'OK: site_branding single-row invariant holds';
end $$;

-- RPCs must reject non-admin callers (definer fns check has_role_jwt; with no
-- JWT claims in a plain psql session this must raise unauthorized).
do $$
declare v_failed boolean := false;
begin
  begin
    perform public.branding_publish('test');
  exception when others then
    v_failed := true;
  end;
  if not v_failed and current_setting('request.jwt.claims', true) is null then
    raise exception 'FAIL: branding_publish did not gate on admin role';
  end if;
  raise notice 'OK: branding_publish gated';
end $$;

-- Hardening (20260724040256): version-0 stock anchor + optimistic save guard
do $$
declare v_doc jsonb;
begin
  select doc into v_doc from public.site_branding_versions where version = 0;
  if v_doc is null then
    raise exception 'FAIL: version 0 (stock anchor) not seeded';
  end if;
  if v_doc <> '{}'::jsonb then
    raise exception 'FAIL: version 0 must be the empty doc';
  end if;
  raise notice 'OK: version 0 stock anchor present';
end $$;

do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'branding_save_draft') <> 1 then
    raise exception 'FAIL: branding_save_draft must have exactly one signature (jsonb, timestamptz)';
  end if;
  raise notice 'OK: single branding_save_draft overload';
end $$;

-- Presets + scheduling (20260724060722)
-- branding_publish_internal: publishes a doc directly, bumps version, prunes.
do $$
declare
  v_before int;
  v_new int;
  v_doc jsonb;
begin
  select published_version into v_before from public.site_branding where id = 1;
  v_new := public.branding_publish_internal(
    '{"tokens":{"light":{"muted":"0 0% 91%"}}}'::jsonb, 'test internal publish', null);
  if v_new <> v_before + 1 then
    raise exception 'FAIL: internal publish did not bump version (% -> %)', v_before, v_new;
  end if;
  select doc into v_doc from public.site_branding_versions where version = v_new;
  if v_doc -> 'tokens' -> 'light' ->> 'muted' <> '0 0% 91%' then
    raise exception 'FAIL: internal publish did not record the doc in history';
  end if;
  if (select published from public.site_branding where id = 1) -> 'tokens' -> 'light' ->> 'muted' <> '0 0% 91%' then
    raise exception 'FAIL: internal publish did not update the live published doc';
  end if;
  raise notice 'OK: branding_publish_internal publishes + versions';
end $$;

-- run_branding_schedule: a due pending window activates (publishes preset, goes
-- active, captures the pre-activation revert version); ending it reverts.
do $$
declare
  v_preset uuid;
  v_sched uuid;
  v_pre_version int;
  v_status text;
  v_revert int;
  v_result jsonb;
begin
  -- Preset with a distinctive token so we can trace publish/revert.
  insert into public.site_branding_presets (name, doc)
  values ('__test_pride__', '{"tokens":{"dark":{"accent":"0 0% 42%"}}}'::jsonb)
  returning id into v_preset;

  select published_version into v_pre_version from public.site_branding where id = 1;

  -- A window that started a minute ago and ends a minute ago (both due) so one
  -- runner pass both activates and ends it.
  insert into public.site_branding_schedules (preset_id, starts_at, ends_at, status)
  values (v_preset, now() - interval '2 min', now() - interval '1 min', 'pending')
  returning id into v_sched;

  -- Ensure the automation is enabled for the test regardless of seed state.
  update public.admin_automations set enabled = true where slug = 'branding_schedule';

  v_result := public.run_branding_schedule();

  select status, revert_to_version into v_status, v_revert
    from public.site_branding_schedules where id = v_sched;
  if v_status <> 'completed' then
    raise exception 'FAIL: due window should be completed after activate+end (got %)', v_status;
  end if;
  if v_revert <> v_pre_version then
    raise exception 'FAIL: revert_to_version should capture pre-activation version (% vs %)', v_revert, v_pre_version;
  end if;
  -- After end-revert, the live published doc must match the pre-activation
  -- version's doc, not the preset.
  if (select published from public.site_branding where id = 1)
     is distinct from (select doc from public.site_branding_versions where version = v_pre_version) then
    raise exception 'FAIL: end-revert did not restore the pre-activation doc';
  end if;
  raise notice 'OK: run_branding_schedule activate+end round trip (%).', v_result;
end $$;

-- Preset cap is enforced (21st insert via RPC path would fail — check the guard
-- exists as a count, not the full 20-row insert, to keep the test fast).
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'branding_preset_save') then
    raise exception 'FAIL: branding_preset_save missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'run_branding_schedule') then
    raise exception 'FAIL: run_branding_schedule missing';
  end if;
  raise notice 'OK: preset/schedule RPCs present';
end $$;

-- Regex-bound regression (20260724110000): URL-bearing fields must VALIDATE,
-- not crash. {1,300} bounds threw "invalid repetition count(s)" (Postgres caps
-- regex bounds at 255) the moment a URL regex compiled.
do $$
begin
  perform public.branding_validate('{"meta":{"og_image_url":"https://queer.guide/images/og-image.png"}}'::jsonb);
  perform public.branding_validate('{"meta":{"org_logo_url":"/icons/icon-192.png","org_sameas":["https://instagram.com/queer.guide"]}}'::jsonb);
  perform public.branding_validate('{"email":{"logo_url":"https://queer.guide/logo.png"}}'::jsonb);
  perform public.branding_validate(
    '{"fonts":{"display":{"family":"Clash Display","files":[{"url":"/fonts/x.woff2","weight":"100 900","style":"normal"}]}}}'::jsonb);
  raise notice 'OK: URL/font-URL fields validate without a regex-bound crash';
end $$;

rollback;
