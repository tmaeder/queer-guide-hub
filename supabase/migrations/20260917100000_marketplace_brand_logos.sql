-- Marketplace brand logos: the work-list that feeds `enrich-logos`.
--
-- `marketplace_brands.logo_url` has existed since the maker pages shipped and
-- was non-null on ZERO of 5,142 rows, so every plate on /marketplace/brands,
-- every maker masthead and the weekly brand spotlight rendered a monogram.
-- Nothing had ever written the column: the logo machine (`enrich-logos` →
-- logo.dev probe → R2 mirror, 1,340 venues deep) is keyed on a `website`, and
-- only 23 of the 885 live brands have one.
--
-- The domain has to come from the listings instead, and THAT is the whole
-- difficulty. A brand's `merchant_domain` is the shop that sells it, not the
-- brand: Oxballs sells through six retailers and owns none of those domains,
-- and the brand literally named "Custom" (799 listings) sells only on
-- automicgold.com. Publishing Automic Gold's mark under the word "Custom" is
-- exactly the same defect class as the same-name city collisions —
-- `20260802090844` — so the rule here is the same one: never resolve an entity
-- by a single unverified signal, require corroboration, and BLOCK rather than
-- guess. Corroboration is the brand's own name matching the domain label
-- (`dedup_despace` on both sides), in three arms:
--
--   1  cherrykitten            = cherrykitten.com          exact
--   2  d.franklin              ⊂ dfranklincreation.com     domain extends brand
--   3  nothosaur toy           ⊃ nothosaur.com             brand extends domain
--
-- Measured over the live catalogue: 110 of 885 brands resolve, covering 33,312
-- of 48,832 listings — the directory is ordered by listing count, so those are
-- the plates a reader actually meets. All 38 rows the widened arms 2 and 3 add
-- were read by hand and all 38 are the brand's own shop (Mister B's six
-- sub-lines → misterb.com, FETCH → fetchshop.co.uk, Prowler → prowlerred.com).
-- Both arms require ≥4 characters on the shorter side so a two-letter brand
-- cannot swallow a retailer.
--
-- The remaining 775 brands sell only through third-party shops and have no
-- defensible domain. They keep their monograms, which is the honest render, and
-- they are stamped attempted so the batch terminates instead of re-offering the
-- same unresolvable head of the queue forever.

alter table public.marketplace_brands
  add column if not exists logo_fetched_at timestamptz,
  add column if not exists logo_source text;

comment on column public.marketplace_brands.logo_fetched_at is
  'Last logo resolution attempt. Set even when nothing was found, so the batch terminates; null means never tried or a transient mirror failure worth retrying.';
comment on column public.marketplace_brands.logo_source is
  'Provenance of logo_url: logodev:<domain> | site:<kind>:<domain> | no_domain | not_found.';

-- Batch work-list. Returns the top unresolved brands by listing count WITH the
-- domain when one corroborates and NULL when none does — the caller stamps both
-- shapes, which is what lets the sweep drain.
create or replace function public.marketplace_brand_logo_candidates(p_limit int default 50)
returns table (
  id uuid,
  brand_key text,
  display_name text,
  domain text,
  evidence text
)
language sql
stable
security definer
set search_path to 'public', 'extensions', 'pg_catalog'
as $$
  with todo as materialized (
    select b.id, b.brand_key, b.display_name, b.website, b.product_count
    from public.marketplace_brands b
    where b.status = 'approved'
      and coalesce(b.product_count, 0) > 0
      and b.logo_url is null
      and b.logo_fetched_at is null
    order by b.product_count desc nulls last
    limit greatest(coalesce(p_limit, 50), 1)
  ),
  dom as materialized (
    select lower(btrim(l.brand)) as bk, l.merchant_domain as md
    from public.marketplace_listings l
    join todo t on t.brand_key = lower(btrim(l.brand))
    where l.merchant_domain is not null
      and l.status = 'active'
    group by 1, 2
  ),
  ranked as (
    select t.id, d.md, r.rank
    from todo t
    join dom d on d.bk = t.brand_key
    cross join lateral (
      select public.dedup_despace(t.brand_key) as bkd,
             public.dedup_despace(split_part(regexp_replace(d.md, '^www\.', ''), '.', 1)) as lbl
    ) k
    cross join lateral (
      select case
        when k.lbl = k.bkd then 1
        when length(k.bkd) >= 4 and k.lbl like k.bkd || '%' then 2
        when length(k.lbl) >= 4 and k.bkd like k.lbl || '%' then 3
        else null
      end as rank
    ) r
    where r.rank is not null
  ),
  best as (
    select distinct on (id) id, md, rank
    from ranked
    order by id, rank, md
  )
  select t.id,
         t.brand_key,
         t.display_name,
         coalesce(nullif(btrim(t.website), ''), b.md) as domain,
         case
           when nullif(btrim(t.website), '') is not null then 'website'
           when b.md is not null then 'merchant_domain_rank' || b.rank
           else null
         end as evidence
  from todo t
  left join best b on b.id = t.id
  order by t.product_count desc nulls last;
$$;

comment on function public.marketplace_brand_logo_candidates(int) is
  'Work-list for enrich-logos table=marketplace_brands. domain is null when no merchant domain corroborates the brand name — the caller stamps those attempted rather than guessing a retailer''s logo.';

-- New functions inherit anon/authenticated EXECUTE from this project's default
-- privileges, and this one reads across the whole catalogue. Service role only.
revoke all on function public.marketplace_brand_logo_candidates(int) from public, anon, authenticated;
grant execute on function public.marketplace_brand_logo_candidates(int) to service_role;
