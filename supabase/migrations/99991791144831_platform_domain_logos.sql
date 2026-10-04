-- Venues, events and organizations were publishing OTHER COMPANIES' logos.
--
-- `enrich-logos` probes logo.dev with the registrable domain of the row's
-- `website`. Nothing ever asked whether that website is the venue's OWN site.
-- Thousands of rows in this corpus carry a social profile, a shortened link, a
-- free site-builder subdomain or a directory listing as their "website", so
-- logo.dev was asked for facebook.com / tinyurl.com / blogspot.com — and
-- answered correctly, with those companies' marks.
--
-- Measured on prod before this migration, and the evidence is the SHARING, not
-- an inference from the domain: ONE image is attached to 558 venues (fetched
-- and read: Facebook's blue "f"), another to 381 (TinyURL's wordmark), another
-- to 320 (display-magazin.ch), another to 311 (misterb&b). On `events` it is
-- worse — 4,169 of 4,306 events with a logo carry GayCities' mark, across 76
-- `*.gaycities.com` subdomains, because that is the scrape source's own site.
--
--   venues         1,777 rows  (social 721 · aggregator 649 · shortener 407)
--                  + ~128 more on site-builder and parked domains
--   events         4,169 rows  (GayCities)
--   organizations     52 rows  (per-row COPIES of the same Facebook mark, in
--                               Supabase storage rather than the R2 mirror, so
--                               the shared-url detector is blind to them —
--                               which is why the host, not the url, is the key)
--
-- THE VOCABULARY IS A TABLE, NOT A CONSTANT, and that is the load-bearing
-- choice. Three readers need this rule — the `enrich-logos` producer (Deno),
-- this repair (SQL) and the sentinel (SQL). A TS copy beside a SQL copy is the
-- drift this repo has repaired repeatedly (venueCategories, death_penalty_risk,
-- the accessibility vocabulary). A table has one definition by construction,
-- and a newly-discovered platform is one INSERT — no migration, no deploy.
--
-- TWO MATCH MODES, both earned by the data rather than chosen for symmetry:
--   `label`  — any dot-separated label of the host equals the value. This is
--              what handles Blogger, which appears here under SIX TLDs
--              (blogspot.com/.de/.gr/.it/.co.uk/.com.ar) and Webnode under
--              three (.cz/.page/.com.br). A suffix list could not express it
--              without enumerating TLDs forever. It is also tight: the label
--              must match WHOLE, so `facebooks.com` (a real typosquat in this
--              corpus) and a bar at `instagram-bar.com` do not match.
--   `suffix` — host equals the value or ends with `.`+value. For hosts whose
--              label is an ordinary word and would over-match: `business.site`,
--              `sites.google.com`, `free.fr`, `t.co`, `bit.ly`.
--
-- WHAT IS DELIBERATELY NOT IN THE LIST. Several hosts look like this defect and
-- are genuine chains sharing one real logo across branches — `axelhotels.com`
-- (4), `merivale.com` (4), `passporthealthusa.com` (8), `fitnesssf.com` (8),
-- `hamburgermarys.com` (5), `brunos.de` (5), `flexspas.com` (5),
-- `steamworksbaths.com` + `steamworksonline.com` (5 across two domains),
-- `arenadisco.com` + `grupoarena.com` + `safaridiscoclub.com` (8 across three).
-- A name-corroborates-the-domain test was built and MEASURED on these, and it
-- is NOT good enough to delete on: it clears Passport Health (the host carries
-- a "usa" suffix the names lack), Merivale and Axel Hotels, all three of which
-- are correct. So this migration clears only what a platform host PROVES, and
-- the residue is reported by the sentinel rather than guessed at.
--
-- `logo_fetched_at` is deliberately LEFT STAMPED. Clearing it would put every
-- repaired row back into the producer's work list, and a venue whose website is
-- a Facebook page has no logo to find — re-probing it forever is the treadmill
-- this repo has removed from three other queues. The prior value is preserved
-- in `enrichment_status.logo.cleared` so the repair is reversible.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The vocabulary.

create table if not exists public.logo_platform_domains (
  value       text primary key,
  match_mode  text not null check (match_mode in ('label', 'suffix')),
  class       text not null check (class in ('social', 'shortener', 'builder', 'aggregator', 'parking')),
  note        text,
  added_at    timestamptz not null default now()
);

comment on table public.logo_platform_domains is
  'Hosts that are a PLATFORM rather than an entity''s own website. A logo probed '
  'from one of these returns the platform''s mark, not the venue''s. Single source '
  'of truth for enrich-logos, the repair, and logo_platform_signals(). Add a row '
  'to block a newly-discovered platform — no migration or deploy required.';

alter table public.logo_platform_domains enable row level security;

-- Readable by the producer (service_role) and by admins maintaining it; never
-- by anon, which has no reason to enumerate it.
drop policy if exists "logo_platform_domains admin read" on public.logo_platform_domains;
create policy "logo_platform_domains admin read"
  on public.logo_platform_domains for select
  using (public.has_role_jwt('admin'));

revoke all on public.logo_platform_domains from anon;
grant select on public.logo_platform_domains to authenticated, service_role;
grant insert, update, delete on public.logo_platform_domains to service_role;

insert into public.logo_platform_domains (value, match_mode, class, note) values
  -- social: the profile IS the venue's web presence for much of this corpus
  ('facebook',   'label',  'social',     '565 venues; the blue "f" was on 558 of them'),
  ('fb.com',     'suffix', 'social',     'facebook short domain'),
  ('instagram',  'label',  'social',     '138 venues'),
  ('twitter',    'label',  'social',     NULL),
  ('x.com',      'suffix', 'social',     'label "x" is far too generic to match'),
  ('vk',         'label',  'social',     '8 venues'),
  ('tiktok',     'label',  'social',     NULL),
  ('youtube',    'label',  'social',     NULL),
  ('youtu.be',   'suffix', 'social',     NULL),
  ('linkedin',   'label',  'social',     NULL),
  ('pinterest',  'label',  'social',     NULL),
  ('tumblr',     'label',  'social',     NULL),
  ('threads.net','suffix', 'social',     NULL),
  ('snapchat',   'label',  'social',     NULL),
  ('reddit',     'label',  'social',     NULL),
  ('flickr',     'label',  'social',     NULL),
  ('t.me',       'suffix', 'social',     'telegram'),
  ('wa.me',      'suffix', 'social',     'whatsapp'),
  -- shorteners: resolve to nothing a logo can be taken from
  ('tinyurl',    'label',  'shortener',  '381 venues, all one image'),
  ('bit.ly',     'suffix', 'shortener',  '22 venues'),
  ('bitly',      'label',  'shortener',  NULL),
  ('goo.gl',     'suffix', 'shortener',  NULL),
  ('t.co',       'suffix', 'shortener',  NULL),
  ('ow.ly',      'suffix', 'shortener',  NULL),
  ('linktr.ee',  'suffix', 'shortener',  NULL),
  ('linktree',   'label',  'shortener',  NULL),
  ('beacons.ai', 'suffix', 'shortener',  NULL),
  ('lnk.bio',    'suffix', 'shortener',  NULL),
  ('rb.gy',      'suffix', 'shortener',  NULL),
  ('is.gd',      'suffix', 'shortener',  NULL),
  ('buff.ly',    'suffix', 'shortener',  NULL),
  ('cutt.ly',    'suffix', 'shortener',  NULL),
  ('shorturl.at','suffix', 'shortener',  NULL),
  ('tiny.cc',    'suffix', 'shortener',  NULL),
  ('rebrand.ly', 'suffix', 'shortener',  NULL),
  -- builders / free hosts: the subdomain is the venue, the logo is the builder's
  ('blogspot',   'label',  'builder',    '28 venues across SIX TLDs — why label mode exists'),
  ('business.site','suffix','builder',   'Google Business sites; 30 venues with negocio.site'),
  ('negocio.site','suffix','builder',    'Google Business sites, Spanish'),
  ('sites.google.com','suffix','builder',NULL),
  ('business.google.com','suffix','builder', NULL),
  ('wix',        'label',  'builder',    NULL),
  ('wixsite',    'label',  'builder',    NULL),
  ('webnode',    'label',  'builder',    'three TLDs in this corpus'),
  ('webs',       'label',  'builder',    'webs.com / freewebs.com'),
  ('freewebs',   'label',  'builder',    NULL),
  ('vpweb',      'label',  'builder',    NULL),
  ('jimdo',      'label',  'builder',    NULL),
  ('jimdosite',  'label',  'builder',    NULL),
  ('weebly',     'label',  'builder',    NULL),
  ('wordpress',  'label',  'builder',    NULL),
  ('over-blog',  'label',  'builder',    NULL),
  ('e-monsite',  'label',  'builder',    NULL),
  ('altervista', 'label',  'builder',    NULL),
  ('ucoz',       'label',  'builder',    NULL),
  ('narod.ru',   'suffix', 'builder',    NULL),
  ('free.fr',    'suffix', 'builder',    'label "free" would over-match badly'),
  ('github.io',  'suffix', 'builder',    NULL),
  ('pages.dev',  'suffix', 'builder',    NULL),
  ('tripod',     'label',  'builder',    NULL),
  ('angelfire',  'label',  'builder',    NULL),
  -- aggregators: a directory that lists the venue, not the venue
  ('gaycities',  'label',  'aggregator', '4,169 EVENTS across 76 subdomains'),
  ('misterbandb','label',  'aggregator', '311 venues'),
  ('display-magazin.ch','suffix','aggregator','320 venues; a Swiss magazine''s venue directory'),
  ('yumbocentrum.com','suffix','aggregator','10 venues; the shopping centre they are tenants of'),
  ('tripadvisor','label',  'aggregator', NULL),
  ('yelp',       'label',  'aggregator', NULL),
  ('booking.com','suffix', 'aggregator', NULL),
  ('airbnb',     'label',  'aggregator', NULL),
  ('eventbrite', 'label',  'aggregator', NULL),
  ('foursquare', 'label',  'aggregator', NULL),
  ('meetup.com', 'suffix', 'aggregator', NULL),
  ('opentable',  'label',  'aggregator', NULL),
  ('worldbank.org','suffix','aggregator','128 junk rows, already archived'),
  -- parking / registrar holding pages
  ('godaddy',    'label',  'parking',    NULL),
  ('sedo',       'label',  'parking',    NULL),
  ('afternic',   'label',  'parking',    NULL),
  ('hugedomains','label',  'parking',    NULL),
  ('namecheap',  'label',  'parking',    NULL)
on conflict (value) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The predicate. One implementation; three readers.

create or replace function public.website_host(p_url text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select nullif(
    lower(regexp_replace(
      split_part(regexp_replace(coalesce(p_url, ''), '^[a-z]+://', '', 'i'), '/', 1),
      '^www\.', '')),
    '')
$$;

comment on function public.website_host(text) is
  'Registrable-ish host of a website url: scheme and path stripped, www. removed, '
  'lowercased. NULL for an empty or pathless input.';

create or replace function public.platform_website_class(p_url text)
returns text
language sql
stable
set search_path to 'public'
as $$
  with h as (select public.website_host(p_url) as host)
  select d.class
  from h, public.logo_platform_domains d
  where h.host is not null
    and (
      -- label: the value must equal a WHOLE dot-separated label, so
      -- `facebooks.com` and `instagram-bar.com` do not match.
      (d.match_mode = 'label'  and d.value = any(string_to_array(h.host, '.')))
      -- suffix: the host itself, or a subdomain of it. Anchored on the dot so
      -- `notbit.ly` cannot pass as `bit.ly`.
      or (d.match_mode = 'suffix' and (h.host = d.value or h.host like '%.' || d.value))
    )
  order by d.match_mode, d.value
  limit 1
$$;

comment on function public.platform_website_class(text) is
  'The platform class of a website url (social|shortener|builder|aggregator|parking), '
  'or NULL when the url looks like the entity''s own site. A non-NULL answer means a '
  'logo probed from this url belongs to the PLATFORM, not to the entity.';

revoke all on function public.platform_website_class(text) from public, anon;
grant execute on function public.platform_website_class(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The repair.

do $repair$
declare
  v_table    text;
  v_cleared  int;
  v_total    int := 0;
  v_batch    int;
begin
  foreach v_table in array array['venues', 'events', 'organizations'] loop
    loop
      -- Batched because `trg_search_documents_*` fires on every UPDATE of these
      -- tables and the chain is per-row. 300 is the cap this repo uses for the
      -- same reason everywhere else; the whole repair is ~6,000 rows.
      execute format($f$
        with target as (
          -- `logo_url is not null` is the progress condition: the update nulls
          -- it, so a cleared row cannot be selected again and the loop
          -- terminates. No separate "already done" marker is needed, and a
          -- jsonb-path guard here would be worse than redundant — `#>` on an
          -- absent path yields NULL, `NULL ? 'url'` is NULL, and `not NULL`
          -- excludes every row, which is a repair that silently does nothing.
          select id from %I
          where logo_url is not null
            and public.platform_website_class(website) is not null
          limit 300
        )
        update %I t
        set logo_url = null,
            %s
            enrichment_status = coalesce(t.enrichment_status, '{}'::jsonb)
              || jsonb_build_object('logo', coalesce(t.enrichment_status -> 'logo', '{}'::jsonb)
                   || jsonb_build_object('cleared', jsonb_build_object(
                        'url', t.logo_url,
                        'reason', 'platform_website',
                        'class', public.platform_website_class(t.website),
                        'host', public.website_host(t.website),
                        'by', 'migration:99991791144831',
                        'at', now()
                      )))
        from target
        where t.id = target.id
      $f$,
        v_table, v_table,
        -- venues alone carry the polarity flag; it describes a logo that is going away.
        case when v_table = 'venues' then 'logo_on_ink = false,' else '' end
      );
      get diagnostics v_batch = row_count;
      exit when v_batch = 0;
      v_cleared := v_batch;
      v_total := v_total + v_batch;
    end loop;
    raise notice 'platform logos cleared from %', v_table;
  end loop;

  raise notice 'platform logos cleared: % rows', v_total;

  -- Postcondition. Asserts the REACHED state rather than counting rows this
  -- migration happened to touch: a concurrent repair that got there first is a
  -- better outcome, not a failure, and counting "rows I updated" turns that
  -- into a `db push` abort on main that blocks every queued migration.
  foreach v_table in array array['venues', 'events', 'organizations'] loop
    execute format(
      'select count(*) from %I where logo_url is not null and public.platform_website_class(website) is not null',
      v_table) into v_cleared;
    if v_cleared <> 0 then
      raise exception '% still publishes % platform logos after the repair', v_table, v_cleared;
    end if;
  end loop;

  -- The mirror assertion: a sweep that cleared EVERYTHING also satisfies the
  -- check above. Real logos on real own-site rows must survive.
  select count(*) into v_cleared from venues
   where logo_url is not null and public.platform_website_class(website) is null;
  if v_cleared < 3000 then
    raise exception 'the repair took legitimate venue logos with it: only % left', v_cleared;
  end if;
end
$repair$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. The sentinel.

create or replace function public.logo_platform_signals()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_vocab int;
  v_rows  jsonb;
  v_shared jsonb;
begin
  select count(*) into v_vocab from public.logo_platform_domains;

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

  -- The arm that finds a platform the vocabulary does not know yet. One image
  -- attached to venues on four or more DIFFERENT registrable domains is a
  -- platform mark by construction — a real chain shares one or two domains
  -- (measured: the widest legitimate group here is three — Grupo Arena, and the
  -- SF AIDS Foundation's three programme sites). Advisory, never a gate: the
  -- answer is a human reading the group and adding a vocabulary row.
  select coalesce(jsonb_agg(jsonb_build_object(
           'venues', n, 'domains', regdoms, 'example_host', ex) order by n desc), '[]'::jsonb)
    into v_shared
  from (
    select count(*) n,
           count(distinct (string_to_array(host, '.'))[array_length(string_to_array(host, '.'), 1) - 1]
                 || '.' || (string_to_array(host, '.'))[array_length(string_to_array(host, '.'), 1)]) regdoms,
           min(host) ex
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
    'platform_logo_rows', coalesce(v_rows, '{}'::jsonb),
    'unknown_platform_groups', v_shared
  );
end
$$;

comment on function public.logo_platform_signals() is
  'Logo provenance health. `platform_logo_rows` is a ZERO-INVARIANT — the producer '
  'refuses these, so any non-zero means a writer bypassed the guard. '
  '`unknown_platform_groups` is ADVISORY: one image across >=4 registrable domains is '
  'a platform mark the vocabulary has not learned yet; the fix is a vocabulary row, '
  'not a threshold change. `vocabulary_size` is reported so an empty table cannot '
  'read as a clean corpus.';

-- service_role only. A SECURITY DEFINER aggregate granted to `authenticated` is
-- granted to every signed-in member.
revoke all on function public.logo_platform_signals() from public, anon, authenticated;
grant execute on function public.logo_platform_signals() to service_role;
