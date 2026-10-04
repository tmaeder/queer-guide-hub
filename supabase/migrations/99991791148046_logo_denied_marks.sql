-- The second layer: the DOMAIN is the venue's own, and the IMAGE is still junk.
--
-- `99991791144831` closed the case where the website is a platform — a Facebook
-- page, a shortener, a builder subdomain. Its advisory sentinel arm then
-- reported what that rule structurally cannot reach, and all eighteen groups it
-- surfaced were read by hand. Every one is junk, and every one arrived from a
-- domain that genuinely belongs to the venue:
--
--   50 venues / 46 domains  WordPress's "W"        (self-hosted WordPress)
--   30 / 20                 a default house icon   (a theme's stock favicon)
--   20 / 19                 HugeDomains "Buy"      (the domain is FOR SALE)
--   18 / 14                 a blank white square
--   13 / 13                 a grey 3-D cube        (a stock server placeholder)
--   12 / 11                 green circular arrows  (a redirect service)
--   12 / 11                 a blank white square   (a second encoding)
--   11 / 11                 a "4 Ever I" gear mark (a web agency)
--    9 /  9                 GoDaddy's heart        (parked)
--    8 /  8                 a blue layout wireframe
--    8 /  8                 Facebook's "f"         (the venue's own domain redirects there)
--    8 /  7                 WIX's wordmark         (Wix on a custom domain)
--    7 /  7                 a blue/violet "E" disc
--    6 /  6                 a blue "S"
--    6 /  6                 a bare rainbow flag    (not a logo — a decoration)
--    4 /  4                 sedo.com "Buy. Park. Sell."
--    4 /  4                 GoDaddy's heart again
--    4 /  4                 Facebook's "f" again
--                           ─────
--                           230 venues
--
-- NO DOMAIN RULE CAN EVER CATCH THESE. `alibi-sauna.de` is Alibi Sauna's real
-- website; it runs WordPress, and logo.dev answered with WordPress's logo.
-- Adding `alibi-sauna.de` to `logo_platform_domains` would be false — it is not
-- a platform — and enumerating every site that runs a CMS is not a finite task.
-- The thing that is wrong here is the ANSWER, not the question.
--
-- SO THE KEY IS THE IMAGE, AND THE IMAGE ALREADY HAS A STABLE IDENTITY. Logos
-- are mirrored into R2 content-addressed by SHA-256, so the hash in the url IS
-- the identity of the bytes — two venues showing the same picture necessarily
-- share it. That is what made the original defect provable (one file on 558
-- venues) and it is what makes this layer cheap: a denied mark is one row, and
-- it blocks that picture for every entity, present and future, whatever domain
-- produced it.
--
-- WHY THIS IS A SECOND TABLE AND NOT A COLUMN ON THE FIRST. The two layers
-- answer different questions and fail differently. `logo_platform_domains` is
-- consulted BEFORE the probe and saves the request; this is consulted AFTER the
-- bytes come back, because the hash does not exist until then. Folding them
-- together would force one of the two into the wrong half of the pipeline.
--
-- SCOPE: `venues` and `events`. `organizations` store logos per-UUID in Supabase
-- storage rather than content-addressed in R2 (2 of 786 are hashed), so the
-- bytes there have no shared identity to key on. That is a real gap and it is
-- NAMED rather than papered over: the domain layer already cleared the 53
-- organizations it could prove, and anything left there needs the storage path
-- migrated to R2 before this rule can reach it.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The vocabulary.

create table if not exists public.logo_denied_marks (
  sha256     text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  label      text not null,
  note       text,
  added_at   timestamptz not null default now()
);

comment on table public.logo_denied_marks is
  'Images that are never a logo — a CMS mark, a domain-parking badge, a site-builder '
  'wordmark, a stock placeholder, a blank square. Keyed on the SHA-256 R2 already uses '
  'as the filename, so a denied mark is blocked for every entity whatever domain '
  'produced it. Add a row to block a newly-found junk image: no migration, no deploy. '
  'Found by logo_platform_signals().unknown_platform_groups, which is exactly what that '
  'advisory arm exists to surface.';

alter table public.logo_denied_marks enable row level security;

drop policy if exists "logo_denied_marks admin read" on public.logo_denied_marks;
create policy "logo_denied_marks admin read"
  on public.logo_denied_marks for select
  using (public.has_role_jwt('admin'));

revoke all on public.logo_denied_marks from anon;
grant select on public.logo_denied_marks to authenticated, service_role;
grant insert, update, delete on public.logo_denied_marks to service_role;

-- Every label below was established by FETCHING the image and looking at it, not
-- by inferring from the domains that carried it.
insert into public.logo_denied_marks (sha256, label, note) values
  ('8bd7d2723083724e7e473263d5d3ea976e001ad3333b6c6cf2c02ae783b2bf02', 'WordPress',    '50 venues across 46 of their own domains'),
  ('57a24cde62255fff97786bb74056ff3725069fc6764c63d56f4f5b93ecd3b0a0', 'stock house icon', 'a theme default favicon'),
  ('b32861f915ceff23135281d3c663e29e3d17fe316053150f27839bbcb939de17', 'HugeDomains',  'the domain is parked and for sale'),
  ('6b4f32fbba3346e7dc55f245cd20fe8e0f81af97b4ac62b76235725bfc2b9163', 'blank',        'a uniformly white square'),
  ('a22ec141e846028193e8d02f6b084a5720f208cf7a4e6a38c1ca2cf7e153343f', 'stock cube',   'a grey 3-D box placeholder'),
  ('a93df7c4bf8299ce1dbde9f83b0a9aa2c3087b3e4ff6de27de005bd91c7fb1e9', 'redirect arrows', 'a URL-forwarding service mark'),
  ('b0ed7e72ed75ec31b8a9e19ea8972cf2d3cf2cc4e7ce722d6ee209efd9190358', 'blank',        'a second encoding of a white square'),
  ('7497c1ecaa03883e7c4c66098985b2cc2d4e4affd2fbfd34ed40607479f00323', 'web agency gears', 'the builder''s mark, not the venue''s'),
  ('bdc14183da65b17003a03e16463c4484be8991c9a9a139a662d1404d7ccffe95', 'GoDaddy',      'parked domain'),
  ('30eabb792a65d7ccb35e50ffcc89a288c895a8bf8e39f64aa286184e9a0263ff', 'layout wireframe', 'a stock site-builder placeholder'),
  ('a3611bee6d182cb736ab168df78b9c2a3559a60b350b3cfc0af8a6dc13ff8653', 'Facebook',     'reached from the venue''s OWN domain, which redirects to Facebook'),
  ('475a092f7f969a365778034744343c3942f79279e2c58ee65c41db9065a6bc94', 'Wix',          'Wix on a custom domain, so the domain rule cannot see it'),
  ('fbfca3a05ce74db4ad174326f2254a57c8d825d8332070cebc8890f33740c02c', 'generic E disc', NULL),
  ('5388b5b7533856d2e7fe46a004d3766e9465f7aa6e74e32c9ec954045f7af95a', 'generic S',    NULL),
  ('03bb306a0ca821d48b99cac728a80ab9c8b04353454228d05d4ce193355b87ea', 'bare rainbow flag', 'a decoration shared by six unrelated venues, not a mark'),
  ('b35d6b8246da05c8586ca6447eb677a478dad1bd0862122d3c344839e33c17e2', 'Sedo',         'domain parking'),
  ('2c8701e2e28c34db5382ef8dd42bdcb7666eda35e4861b0ad674abf4c4e7da66', 'GoDaddy',      'a second GoDaddy variant'),
  ('d2301ecaf7726d1e426b3ee63d327496b07c85408782185d5456fc0ddfadfc43', 'Facebook',     'a rounded Facebook variant')
on conflict (sha256) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The predicate.

create or replace function public.logo_mark_sha256(p_logo_url text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  -- Anchored on the mirror path, not on "any 64 hex characters anywhere in the
  -- string": a bare hex match would also fire on a query parameter or a token.
  select substring(coalesce(p_logo_url, '') from 'img\.queer\.guide/logos/([0-9a-f]{64})')
$$;

comment on function public.logo_mark_sha256(text) is
  'The content hash of a mirrored logo, or NULL when the url is not an R2 mirror url. '
  'R2 is content-addressed, so this is the identity of the BYTES: two rows sharing it '
  'are provably showing the same picture.';

create or replace function public.logo_mark_denied(p_logo_url text)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from public.logo_denied_marks d
    where d.sha256 = public.logo_mark_sha256(p_logo_url)
  )
$$;

revoke all on function public.logo_mark_denied(text) from public, anon;
grant execute on function public.logo_mark_denied(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The repair.

do $repair$
declare
  v_table   text;
  v_batch   int;
  v_total   int := 0;
  v_n       int;
  v_before  int;
begin
  select count(*) into v_before from venues where public.logo_mark_denied(logo_url);
  raise notice 'venues on a denied mark before: %', v_before;

  foreach v_table in array array['venues', 'events'] loop
    loop
      -- Batched for the same reason as the first layer: the search-document
      -- trigger fires per row on these tables.
      execute format($f$
        with target as (
          select id from %I where public.logo_mark_denied(logo_url) limit 300
        )
        update %I t
        set logo_url = null,
            %s
            enrichment_status = coalesce(t.enrichment_status, '{}'::jsonb)
              || jsonb_build_object('logo', coalesce(t.enrichment_status -> 'logo', '{}'::jsonb)
                   || jsonb_build_object('cleared', jsonb_build_object(
                        'url', t.logo_url,
                        'reason', 'denied_mark',
                        'mark', public.logo_mark_sha256(t.logo_url),
                        'by', 'migration:99991791148046',
                        'at', now()
                      )))
        from target
        where t.id = target.id
      $f$, v_table, v_table,
        case when v_table = 'venues' then 'logo_on_ink = false,' else '' end);
      get diagnostics v_batch = row_count;
      exit when v_batch = 0;
      v_total := v_total + v_batch;
    end loop;
  end loop;

  raise notice 'denied marks cleared: % rows', v_total;

  -- Postconditions assert the REACHED state, never "rows I updated": a
  -- concurrent repair that got there first is a better outcome, not a `db push`
  -- abort that blocks every migration queued behind this one.
  foreach v_table in array array['venues', 'events'] loop
    execute format('select count(*) from %I where public.logo_mark_denied(logo_url)', v_table) into v_n;
    if v_n <> 0 then
      raise exception '% still publishes % denied marks after the repair', v_table, v_n;
    end if;
  end loop;

  -- The mirror assertion. "No denied marks remain" is equally satisfied by
  -- clearing every logo in the corpus; this is the half that notices.
  select count(*) into v_n from venues where logo_url is not null;
  if v_n < 5000 then
    raise exception 'the repair took legitimate venue logos with it: only % left', v_n;
  end if;
  raise notice 'surviving venue logos: %', v_n;
end
$repair$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The sentinel gains a second zero-invariant.
--
-- Restated in full rather than patched, because `create or replace function` is
-- the only way to add a key and a partial restatement is not a thing. The
-- advisory arm is unchanged and still reports one image across >=4 registrable
-- domains — after this repair it should be empty, and anything it reports later
-- is a NEW junk mark to read and deny.

create or replace function public.logo_platform_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_vocab int;
  v_denied_vocab int;
  v_rows jsonb;
  v_denied jsonb;
  v_shared jsonb;
begin
  select count(*) into v_vocab from public.logo_platform_domains;
  select count(*) into v_denied_vocab from public.logo_denied_marks;

  select jsonb_object_agg(t, n) into v_rows from (
    select 'venues' t, count(*) n from venues
      where logo_url is not null and public.platform_website_class(website) is not null
    union all
    select 'events', count(*) from events
      where logo_url is not null and public.platform_website_class(website) is not null
    union all
    select 'organizations', count(*) from organizations
      where logo_url is not null and public.platform_website_class(website) is not null
  ) s;

  select jsonb_object_agg(t, n) into v_denied from (
    select 'venues' t, count(*) n from venues where public.logo_mark_denied(logo_url)
    union all
    select 'events', count(*) from events where public.logo_mark_denied(logo_url)
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'venues', n, 'domains', regdoms, 'example_host', ex, 'mark', mark) order by n desc), '[]'::jsonb)
    into v_shared
  from (
    select count(*) n,
           count(distinct (string_to_array(host, '.'))[array_length(string_to_array(host, '.'), 1) - 1]
                 || '.' || (string_to_array(host, '.'))[array_length(string_to_array(host, '.'), 1)]) regdoms,
           min(host) ex,
           -- The hash is reported so the fix is mechanical: look at the image,
           -- then insert this value into logo_denied_marks.
           min(public.logo_mark_sha256(logo_url)) mark
    from (
      select logo_url, public.website_host(website) host
      from venues
      where duplicate_of_id is null and logo_url is not null and website is not null
        and public.platform_website_class(website) is null
    ) v
    group by logo_url
    having count(distinct (string_to_array(host, '.'))[array_length(string_to_array(host, '.'), 1) - 1]
                || '.' || (string_to_array(host, '.'))[array_length(string_to_array(host, '.'), 1)]) >= 4
  ) g;

  return jsonb_build_object(
    'probe_ok', true,
    'vocabulary_size', v_vocab,
    'denied_mark_vocabulary_size', v_denied_vocab,
    'platform_logo_rows', coalesce(v_rows, '{}'::jsonb),
    'denied_mark_rows', coalesce(v_denied, '{}'::jsonb),
    'unknown_platform_groups', v_shared
  );
end
$$;

comment on function public.logo_platform_signals() is
  'Logo provenance health, two layers. `platform_logo_rows` (the website is a platform) '
  'and `denied_mark_rows` (the image is a known non-logo) are both ZERO-INVARIANTS — the '
  'producer refuses both, so non-zero means a writer bypassed a guard. '
  '`unknown_platform_groups` is ADVISORY: one image across >=4 registrable domains is junk '
  'the vocabulary has not learned yet, and it now carries the `mark` hash so the remedy is '
  'one INSERT into logo_denied_marks. Both vocabulary sizes are reported so an empty table '
  'cannot read as a clean corpus.';

revoke all on function public.logo_platform_signals() from public, anon, authenticated;
grant execute on function public.logo_platform_signals() to service_role;
