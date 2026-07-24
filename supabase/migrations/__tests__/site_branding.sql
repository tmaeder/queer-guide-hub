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

rollback;
