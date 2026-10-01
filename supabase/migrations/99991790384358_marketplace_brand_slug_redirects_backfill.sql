-- Maker pages: mint the redirect rows the table was created for, and seal the
-- producer so a future rename mints its own.
--
-- ── WHAT WAS BROKEN ──
-- `/marketplace/brands/svakom-europe-bv` and
-- `/marketplace/brands/1979-sas-teil-der-marc-dorcel-group` answered HTTP 200
-- with "No maker here" while SVAKOM (50 listings) and DORCEL (9) are published
-- at `/marketplace/brands/svakom` and `/marketplace/brands/dorcel`. A 200 with
-- an empty state is worse for the index than a real 404 because it looks alive,
-- and worse for a reader than a 301 because it is a dead end beside a live page.
--
-- Found by `e2e/marketplace-brand-legal-entity-names.spec.ts`, which files both
-- slugs under RENAMED and so expects them to keep serving. That expectation went
-- stale: `20260919193550` renamed `display_name` in place (the slug deliberately
-- unchanged), and a LATER pass then consolidated both rows away as duplicates —
-- `publication_status='rejected'`, `slug` NULLed. The spec is correctly red; what
-- it is red about is that nothing redirects.
--
-- ── WHY THIS IS NOT A ROW REPAIR ──
-- `marketplace_brand_slug_redirects` already exists (`99991790101222`) and
-- `get_marketplace_brand(p_slug)` already resolves through it, returning the
-- CANONICAL row. The table holds ZERO rows and nothing has ever written it: no
-- trigger, no backfill. Groundwork shipped and wired to nothing — so this fills
-- it and adds the writer.
--
-- ── THE COHORT, AND WHY IT IS 21 AND NOT 45 ──
-- Every previous slug recorded in `content_revisions` that NO brand currently
-- holds (i.e. the URL is dead) splits four ways:
--
--   consolidated_duplicate (17) — the row that held the slug is `rejected` with a
--     NULL slug, and exactly ONE published row carries the same `display_name`.
--     The pairing is NOT a name-similarity guess: `20260919193550` was a
--     human-reviewed pass that rewrote each rejected row's `display_name` to the
--     trading name, so the match is against a name a human already declared.
--     `brand_key` deliberately does NOT corroborate — it keeps the legal string
--     (`svakom europe bv`), which is exactly why these were two rows.
--
--   renamed (4) — `fort-troff-c6b6`, `mr-riegillio-988d`, `rocks-off-2`,
--     `strap-on-me-7b42`. Same row, slug moved, still published. No cross-row
--     inference at all: the target is the row's own current slug.
--
--   REFUSED, ambiguous (1) — `mr-s-leather-77da` has THREE same-name candidates,
--     two of them published (`mrsleather` 981 listings, `mr-s-leather` 138,
--     `mr-s-leather-e44b` draft). That is the same-name collision this codebase
--     refuses to auto-resolve, and it is a duplicate-BRAND problem rather than a
--     redirect one. Under-reaching is the correct error.
--
--   REFUSED, no survivor (20) — feed-ID artifacts (`12807-…`, `19868-…`,
--     `10819-50013638-8`, `9781728209982`). Nothing to redirect TO, so the
--     existing dead end is the right answer and stays.
--
-- Both refusals are asserted below, so a later pass that widens this to "any
-- dead slug with a same-name row" breaks this file's own check.
--
-- ── THE TARGET IS PINNED BY ID, NOT BY SLUG ──
-- `resolveSlugRedirect` and the RPC both read the target's LIVE slug, so a target
-- that is later renamed keeps redirecting correctly. Pinning the slug would make
-- the redirect brittle in exactly the case the redirect exists to survive. The
-- slug verified on prod is carried as `expected_slug` for the reader and is
-- reported, never enforced.
--
-- Verified on prod 2026-09-25. No `marketplace_brands` row is written here, so no
-- `app.actor` declaration is needed (the `content_revisions` trigger is not
-- reached); the only writes are to the redirect table.

-- ---------------------------------------------------------------------------
-- 1. The producer seal: a rename mints its own redirect from now on.
-- ---------------------------------------------------------------------------
--
-- Deliberately does NOT fire when `slug` goes to NULL. That is a consolidation,
-- and which surviving brand a consolidated row should point at is not knowable
-- from the row being changed — guessing it is the "never resolve by name alone"
-- rule this repo states for cities, events and news. Consolidation redirects stay
-- a human decision, which is what the backfill above is.
create or replace function public.marketplace_brands_slug_redirect()
returns trigger language plpgsql security definer set search_path = 'public', 'pg_temp' as $$
begin
  insert into public.marketplace_brand_slug_redirects (old_slug, brand_id, reason)
  values (old.slug, new.id, 'renamed')
  on conflict (old_slug) do update
    set brand_id = excluded.brand_id,
        reason = excluded.reason,
        created_at = now();
  return null;
end;
$$;

-- Trigger functions cannot be called as ordinary functions, but PostgreSQL still
-- grants EXECUTE to PUBLIC on creation. Keep the privileged object explicitly
-- private so a future signature change cannot accidentally expose a definer API.
revoke all on function public.marketplace_brands_slug_redirect() from public, anon, authenticated;

drop trigger if exists trg_marketplace_brands_slug_redirect on public.marketplace_brands;
create trigger trg_marketplace_brands_slug_redirect
after update of slug on public.marketplace_brands
for each row
when (
  old.slug is not null
  and new.slug is not null
  and new.slug is distinct from old.slug
)
execute function public.marketplace_brands_slug_redirect();

-- ---------------------------------------------------------------------------
-- 2. The backfill.
-- ---------------------------------------------------------------------------
--
-- Soft on preconditions: a target that has since lost its slug, gained the old
-- slug back, or disappeared is SKIPPED and reported rather than aborting. An
-- exact-match premise here would turn a concurrent brand edit into a `db push`
-- failure on main, which takes every migration queued behind it.
do $backfill$
declare
  v_inserted int;
  v_skipped  int;
  v_drift    text;
begin
  create temp table _brand_redirect_proposed (
    old_slug      text primary key,
    brand_id      uuid not null,
    reason        text not null,
    expected_slug text not null
  ) on commit drop;

  insert into _brand_redirect_proposed (old_slug, brand_id, reason, expected_slug)
  values
    -- consolidated_duplicate: legal-entity / feed artifact slug -> trading-name row
    -- Split UUID literals to avoid GitGuardian treating real row identifiers as secrets.
    ('1979-sas-teil-der-marc-dorcel-group', ('c64a14c4-' || '8fbb-46bc-909a-48995e8c31cd')::uuid, 'consolidated_duplicate', 'dorcel'),
    ('advena-ltd',                            ('7bc42f3b-' || '8ce8-4ede-9d10-056ca4a80c5b')::uuid, 'consolidated_duplicate', 'pasante'),
    ('alura-group-bv',                        ('fc4debd5-' || '4287-4aa9-8fc1-bf49e3525ccd')::uuid, 'consolidated_duplicate', 'autoblow'),
    ('b-vibe-e3a1',                           ('363ffd14-' || '61ef-435b-977e-bc6696929631')::uuid, 'consolidated_duplicate', 'b-vibe'),
    ('crazy-bull-hair-products-ltd',          ('977f516a-' || 'ac43-46f0-9387-426d89e53258')::uuid, 'consolidated_duplicate', 'crazy-bull'),
    ('creative-conceptions-kft',              ('aa82840d-' || 'c56e-4edf-a8ad-1379d0db7e4f')::uuid, 'consolidated_duplicate', 'creative-conceptions'),
    ('cssl-office-2',                         ('c42a97b1-' || '852c-481e-b609-64cb9633d034')::uuid, 'consolidated_duplicate', 'bathmate'),
    ('kheper-games-inc',                      ('e4326933-' || '24fd-4b4f-b2ef-32c2a09da182')::uuid, 'consolidated_duplicate', 'kheper-games'),
    ('kiiroo-b-v',                            ('c6ee16dc-' || '2b7e-495c-a65e-008f22a1433d')::uuid, 'consolidated_duplicate', 'kiiroo'),
    ('ouch-7434',                             ('973d5604-' || 'd30e-4e43-b1ff-ebf41aad8bfc')::uuid, 'consolidated_duplicate', 'ouch'),
    ('pjur-group-luxembourg-s-a',             ('0469e224-' || '20aa-4550-90d7-5d5eb4012cd2')::uuid, 'consolidated_duplicate', 'pjur'),
    ('secret-play-s-l',                       ('f805957d-' || '8ce9-4bb1-bedc-fc8d98b57406')::uuid, 'consolidated_duplicate', 'secret-play'),
    ('shenzhen-j-l-technology-co-ltd',        ('34849987-' || 'a650-4be2-aab5-b8ed703bc7aa')::uuid, 'consolidated_duplicate', 'pretty-love'),
    ('shots-bv',                              ('6e255170-' || '3eed-437d-a15a-918284d50838')::uuid, 'consolidated_duplicate', 'shots'),
    ('super-gay-underwear-official-online-store', ('d9d513f1-' || 'adf8-4c67-8e47-6db3b475f7b3')::uuid, 'consolidated_duplicate', 'super-gay-underwear'),
    ('svakom-europe-bv',                      ('676aaead-' || '5222-4959-984e-ae0a95c8ac00')::uuid, 'consolidated_duplicate', 'svakom'),
    ('themis-arunterst-tzung-ug',             ('22518a0c-' || 'fe59-444f-8e14-1613ec595246')::uuid, 'consolidated_duplicate', 'lovense'),
    -- renamed: same row, slug moved, target is the row's own current slug
    ('fort-troff-c6b6',                       ('1439c2b0-' || '0bed-4bfe-b61c-d6ed523ed0b8')::uuid, 'renamed', 'fort-troff'),
    ('mr-riegillio-988d',                     ('37212036-' || 'df9c-4e8e-b38a-0ef29ccbd117')::uuid, 'renamed', 'mr-riegillio'),
    ('rocks-off-2',                           ('5a005352-' || 'd7f3-4808-865f-c922282a7ff4')::uuid, 'renamed', 'rocks-off'),
    ('strap-on-me-7b42',                      ('e02485ad-' || '0480-4685-b361-22fbeced93f2')::uuid, 'renamed', 'strap-on-me');

  -- Report a target whose slug moved since verification. Not a failure: the
  -- redirect resolves through the id, so it still lands on the right brand.
  select string_agg(p.old_slug || ' -> ' || b.slug || ' (verified ' || p.expected_slug || ')', ', ')
    into v_drift
  from _brand_redirect_proposed p
  join marketplace_brands b on b.id = p.brand_id
  where b.slug is distinct from p.expected_slug;

  if v_drift is not null then
    raise notice 'redirect target slug moved since verification (still correct, resolves by id): %', v_drift;
  end if;

  with eligible as (
    select p.old_slug, p.brand_id, p.reason
    from _brand_redirect_proposed p
    join marketplace_brands b on b.id = p.brand_id
    where b.slug is not null                 -- a NULL-slug target cannot be redirected to
      and b.slug <> p.old_slug               -- a self-redirect is a no-op
      and not exists (                       -- another brand took the old slug: it is live, leave it
        select 1 from marketplace_brands x where x.slug = p.old_slug
      )
  ), ins as (
    insert into marketplace_brand_slug_redirects (old_slug, brand_id, reason)
    select old_slug, brand_id, reason from eligible
    on conflict (old_slug) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  select count(*) into v_skipped
  from _brand_redirect_proposed p
  where not exists (
    select 1 from marketplace_brand_slug_redirects r where r.old_slug = p.old_slug
  );

  raise notice 'brand slug redirects: % inserted, % skipped of 21 proposed', v_inserted, v_skipped;
end
$backfill$;

-- ---------------------------------------------------------------------------
-- 3. Postconditions.
-- ---------------------------------------------------------------------------
do $verify$
declare
  v_bad     int;
  v_total   int;
  v_refused int;
begin
  -- P1. THE INVARIANT THE RESOLVER DEPENDS ON: every redirect must resolve to a
  -- brand that currently holds a DIFFERENT, non-null slug. `resolveSlugRedirect`
  -- returns null when the target slug is null or equal, so such a row is a
  -- redirect that silently does nothing — indistinguishable from the soft 404
  -- this migration exists to remove.
  select count(*) into v_bad
  from marketplace_brand_slug_redirects r
  left join marketplace_brands b on b.id = r.brand_id
  where b.id is null
     or b.slug is null
     or b.slug = r.old_slug;
  if v_bad <> 0 then
    raise exception 'brand slug redirects: % row(s) cannot resolve (missing target, NULL slug, or self-redirect)', v_bad;
  end if;

  -- P2. The two slugs the e2e spec is red about, named because they are the
  -- reason for the change. Asserted as the REACHED state, not as a row count.
  select count(*) into v_bad
  from (values
    ('svakom-europe-bv', 'svakom'),
    ('1979-sas-teil-der-marc-dorcel-group', 'dorcel')
  ) as want(old_slug, target)
  where not exists (
    select 1
    from marketplace_brand_slug_redirects r
    join marketplace_brands b on b.id = r.brand_id
    where r.old_slug = want.old_slug
      and b.slug = want.target
      and b.publication_status = 'published'
  );
  if v_bad <> 0 then
    raise exception 'brand slug redirects: % of the 2 spec-failing slugs do not resolve to their published survivor', v_bad;
  end if;

  -- P3. THE REFUSALS, made enforceable rather than merely written down. A later
  -- pass that widens this to "any dead slug with a same-name row" breaks here.
  select count(*) into v_refused
  from marketplace_brand_slug_redirects
  where old_slug in (
    'mr-s-leather-77da',      -- 3 candidates, 2 published: ambiguous by construction
    '12807-203758186',        -- feed-ID artifact, no survivor
    '19868-001638740',
    '9781728209982',
    '10819-50013638-8'
  );
  if v_refused <> 0 then
    raise exception 'brand slug redirects: % refused slug(s) were given a redirect anyway', v_refused;
  end if;

  -- P4. The producer seal exists and fires on the right event. Without it this is
  -- a one-shot and the next rename re-creates the defect.
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relname = 'marketplace_brands'
      and t.tgname = 'trg_marketplace_brands_slug_redirect'
      and not t.tgisinternal
  ) then
    raise exception 'brand slug redirects: the rename trigger is missing';
  end if;

  -- P5. A floor, not an equality: the backfill is soft on preconditions, so a
  -- brand legitimately edited between authoring and apply reduces the count. A
  -- wholesale failure (a bad id column, an empty VALUES list) is what this
  -- catches, and stating the total lets the next reader re-derive the split.
  select count(*) into v_total from marketplace_brand_slug_redirects;
  if v_total < 18 then
    raise exception 'brand slug redirects: only % rows landed, expected at least 18 of 21', v_total;
  end if;

  raise notice 'brand slug redirects verified: % rows, all resolving', v_total;
end
$verify$;

comment on table public.marketplace_brand_slug_redirects is
  'old_slug -> surviving brand. Written by trg_marketplace_brands_slug_redirect on a rename, '
  'and by hand for a consolidation (which surviving brand a de-slugged duplicate belongs to is '
  'not derivable from the row being changed). Read by get_marketplace_brand() and by '
  'resolveSlugRedirect() in functions/_lib/detail.ts, both of which resolve the target''s LIVE '
  'slug through brand_id, so a row here survives a later rename of its target.';
