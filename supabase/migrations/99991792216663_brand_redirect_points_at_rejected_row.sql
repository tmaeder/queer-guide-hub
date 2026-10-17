-- One brand redirect points at a REJECTED, slug-less row, so the URL serves a
-- 200 for a brand nobody approved instead of redirecting to the live one.
--
-- `/marketplace/brands/mr-s-leather-77da` answers 200 with the title
-- "MR S LEATHER — Marketplace | Queer Guide". It resolves through
-- `marketplace_brand_slug_redirects` (row created 2026-09-29) onto brand
-- 9ff3a4bc, and that row is `status='rejected'` with `slug IS NULL` and 36
-- products. `get_marketplace_brand()` resolves a redirect regardless of the
-- target's status, so a rejected row is published at a URL a reader can reach.
--
-- MEASURED SCOPE — this is a ONE-OFF, not a class, which is why there is no
-- sentinel here: of 43 rows in `marketplace_brand_slug_redirects`, exactly ONE
-- points at a brand that is both slug-less and unapproved, and ZERO point at a
-- missing brand. Re-measure before treating a second instance as this bug.
--
-- There are FOUR rows for this one brand, and the approved one is unambiguous:
--
--   brand_key       display_name   slug                status     products
--   mrsleather      mrsleather     mrsleather          approved       1083
--   mr s leather    MR S LEATHER   NULL                rejected         36
--   mr-s-leather    Mr-S-Leather   NULL                rejected          4
--   mr. s leather   Mr. S Leather  mr-s-leather-e44b   pending           1
--
-- So the redirect is repointed at `mrsleather` (1083 products, approved, and
-- already the target of the `mr-s-leather` redirect created 2026-10-04). After
-- this, `/mr-s-leather-77da` 301s to `/marketplace/brands/mrsleather` and the
-- rejected row is no longer reachable.
--
-- DELIBERATELY NOT DONE, and reported rather than fixed quietly: the approved
-- row's `display_name` is the literal string "mrsleather" — a raw merchant slug
-- published as a brand name on 1083 products, where the rejected row carries
-- the properly cased "MR S LEATHER". Renaming it is an editorial decision about
-- which spelling this brand publishes under, not a redirect repair, and it
-- would change a live page title. The e2e spec is updated to the factual
-- current state rather than to a preferred one.
--
-- Soft on preconditions: guarded on the exact wrong target, so a row someone
-- has already repointed is skipped rather than clobbered.

begin;

update marketplace_brand_slug_redirects
set brand_id = 'db3f617e-43b3-4d90-be70-5cdd0bbd8bab'::uuid
where old_slug = 'mr-s-leather-77da'
  and brand_id = '9ff3a4bc-7d18-4fa8-a9b8-028a64ef1f0a'::uuid;

do $verify$
declare
  v_bad int;
  v_target uuid;
begin
  -- P1. The repaired row points at the approved, slugged brand.
  select brand_id into v_target
  from marketplace_brand_slug_redirects
  where old_slug = 'mr-s-leather-77da';
  if v_target is distinct from 'db3f617e-43b3-4d90-be70-5cdd0bbd8bab'::uuid then
    raise exception 'P1: mr-s-leather-77da points at % rather than the approved brand', v_target;
  end if;

  -- P2. THE INVARIANT, over the whole table rather than this one slug: no
  -- redirect may resolve to a brand that is missing, slug-less or unapproved.
  -- Stated corpus-wide because the one-off is only known to be a one-off by
  -- having counted, and a second instance should fail here rather than wait for
  -- someone to notice a 200 on a rejected row.
  select count(*) into v_bad
  from marketplace_brand_slug_redirects r
  left join marketplace_brands b on b.id = r.brand_id
  where b.id is null or b.slug is null or b.status <> 'approved';
  if v_bad <> 0 then
    raise exception 'P2: % redirect(s) resolve to a missing, slug-less or unapproved brand', v_bad;
  end if;

  raise notice 'ok: mr-s-leather-77da repointed at mrsleather; 0 redirects resolve to an unpublishable brand';
end
$verify$;

commit;
