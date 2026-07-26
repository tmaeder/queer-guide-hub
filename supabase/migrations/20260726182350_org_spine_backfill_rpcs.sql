-- ============================================================
-- Business Spine Unification — Phase B2: backfill / link / decide RPCs
--
-- Adopt-before-create: auto-link on domain proof or name+city (>=0.90),
-- queue review-grade matches in org_link_suggestions, mint a new org only
-- when nothing matches. All runners are batched (p_limit) and idempotent
-- (WHERE organization_id IS NULL + open-suggestion unique index) — org
-- INSERTs/role UPDATEs fire the search_documents sync per row, so batches
-- stay small and no-op re-runs write nothing.
-- ============================================================

-- ── 0. mint helper (slug-collision loop; internal, definer-called) ─────────
create or replace function public.org_mint(
  p_name text, p_website text, p_city_id uuid, p_country_id uuid,
  p_logo text, p_role text, p_provenance jsonb default '{}'::jsonb,
  p_status text default 'active'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_base text;
  v_slug text;
  v_id uuid;
  i int := 1;
begin
  v_base := public.generate_slug(coalesce(
    nullif(btrim(p_name), ''),
    public.org_normalize_domain(p_website),
    'org'));
  v_slug := v_base;
  loop
    begin
      insert into public.organizations
        (slug, name, website, website_domain, city_id, country_id, logo_url,
         roles, field_provenance, status)
      values
        (v_slug, btrim(p_name),
         p_website,
         public.org_normalize_domain(p_website),
         p_city_id, p_country_id, p_logo,
         array[p_role], p_provenance, p_status)
      returning id into v_id;
      return v_id;
    exception when unique_violation then
      i := i + 1;
      if i > 20 then raise; end if;
      v_slug := v_base || '-' || i;
    end;
  end loop;
end; $$;

revoke execute on function public.org_mint(text,text,uuid,uuid,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.org_mint(text,text,uuid,uuid,text,text,jsonb,text) to service_role;

-- ── 1. link/unlink gain hotel / affiliate_partner / brand branches ─────────
create or replace function public.link_organization_entity(p_org_id uuid, p_entity_type text, p_entity_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_or_internal();
  if p_entity_type = 'venue' then
    update venues set organization_id = p_org_id where id = p_entity_id;
    update organizations set
      primary_venue_id = coalesce(primary_venue_id, p_entity_id),
      roles = (select array(select distinct unnest(roles || array['venue'])))
      where id = p_org_id and not ('venue' = any(roles) and primary_venue_id is not null);
  elsif p_entity_type = 'news_source' then
    update news_sources set organization_id = p_org_id where id = p_entity_id;
    update organizations set roles = (select array(select distinct unnest(roles || array['publisher'])))
      where id = p_org_id and not ('publisher' = any(roles));
  elsif p_entity_type = 'merchant' then
    update marketplace_merchants set organization_id = p_org_id where id = p_entity_id;
    update organizations set roles = (select array(select distinct unnest(roles || array['seller'])))
      where id = p_org_id and not ('seller' = any(roles));
  elsif p_entity_type = 'hotel' then
    update hotels set organization_id = p_org_id where id = p_entity_id;
    update organizations set roles = (select array(select distinct unnest(roles || array['hotel'])))
      where id = p_org_id and not ('hotel' = any(roles));
  elsif p_entity_type = 'affiliate_partner' then
    begin
      update affiliate_partners set organization_id = p_org_id where id = p_entity_id;
    exception when unique_violation then
      raise exception 'organization already has an affiliate partner config';
    end;
    update organizations set roles = (select array(select distinct unnest(roles || array['affiliate_partner'])))
      where id = p_org_id and not ('affiliate_partner' = any(roles));
  elsif p_entity_type = 'brand' then
    update marketplace_brands set organization_id = p_org_id where id = p_entity_id;
    update organizations set roles = (select array(select distinct unnest(roles || array['brand'])))
      where id = p_org_id and not ('brand' = any(roles));
  else
    raise exception 'unknown entity_type: %', p_entity_type;
  end if;
end; $$;

create or replace function public.unlink_organization_entity(p_org_id uuid, p_entity_type text, p_entity_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin_or_internal();
  if p_entity_type = 'venue' then
    update venues set organization_id = null where id = p_entity_id and organization_id = p_org_id;
    update organizations set primary_venue_id = null where id = p_org_id and primary_venue_id = p_entity_id;
  elsif p_entity_type = 'news_source' then
    update news_sources set organization_id = null where id = p_entity_id and organization_id = p_org_id;
  elsif p_entity_type = 'merchant' then
    update marketplace_merchants set organization_id = null where id = p_entity_id and organization_id = p_org_id;
  elsif p_entity_type = 'hotel' then
    update hotels set organization_id = null where id = p_entity_id and organization_id = p_org_id;
  elsif p_entity_type = 'affiliate_partner' then
    update affiliate_partners set organization_id = null where id = p_entity_id and organization_id = p_org_id;
  elsif p_entity_type = 'brand' then
    update marketplace_brands set organization_id = null where id = p_entity_id and organization_id = p_org_id;
  else
    raise exception 'unknown entity_type: %', p_entity_type;
  end if;
end; $$;

-- (grants for both already exist from 20260620082831; signatures unchanged)

-- ── 2. shared auto-link + queue pass ───────────────────────────────────────
-- Best candidate per entity: >=0.90 links immediately, review grade queues.
create or replace function public.org_adopt_pass(p_entity_type text, p_limit int default 500)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_linked int := 0;
  v_queued int := 0;
  v_cnt int;
  r record;
begin
  for r in
    select distinct on (entity_id) *
    from public.find_org_adoption_candidates(p_entity_type, p_limit)
    order by entity_id, confidence desc
  loop
    if r.confidence >= 0.90 then
      begin
        perform public.link_organization_entity(r.organization_id, r.entity_type, r.entity_id);
        v_linked := v_linked + 1;
        continue;
      exception when others then
        -- e.g. affiliate partner unique clash — fall through to review
        null;
      end;
    end if;
    insert into public.org_link_suggestions
      (entity_type, entity_id, organization_id, confidence, reason, payload)
    values
      (r.entity_type, r.entity_id, r.organization_id, least(r.confidence, 0.89), r.match_type,
       jsonb_build_object('entity', jsonb_build_object('name', r.entity_name),
                          'org', jsonb_build_object('id', r.organization_id, 'name', r.org_name)))
    on conflict (entity_type, entity_id) where status = 'open' do nothing;
    get diagnostics v_cnt = row_count;
    v_queued := v_queued + v_cnt;
  end loop;
  return jsonb_build_object('entity_type', p_entity_type, 'linked', v_linked, 'queued', v_queued);
end; $$;

revoke execute on function public.org_adopt_pass(text,int) from public, anon;
grant execute on function public.org_adopt_pass(text,int) to authenticated, service_role;

-- ── 3. per-source backfill runners (adopt, then mint the remainder) ────────

create or replace function public.run_backfill_orgs_from_merchants(p_limit int default 200)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_adopt jsonb;
  v_minted int := 0;
  r record;
begin
  perform public.assert_admin_or_internal();
  v_adopt := public.org_adopt_pass('merchant', p_limit);

  for r in
    select mm.id, mm.display_name, mm.shop_domain
    from marketplace_merchants mm
    where mm.organization_id is null and mm.is_enabled
      and not exists (select 1 from org_link_suggestions s
                      where s.entity_type = 'merchant' and s.entity_id = mm.id and s.status = 'open')
    order by mm.created_at
    limit p_limit
  loop
    perform public.link_organization_entity(
      public.org_mint(r.display_name, r.shop_domain, null, null, null, 'seller',
                      jsonb_build_object('name', jsonb_build_object('source', 'merchants_backfill'))),
      'merchant', r.id);
    v_minted := v_minted + 1;
  end loop;
  return v_adopt || jsonb_build_object('minted', v_minted);
end; $$;

create or replace function public.run_backfill_orgs_from_affiliate_partners(p_limit int default 50)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_adopt jsonb;
  v_minted int := 0;
  r record;
begin
  perform public.assert_admin_or_internal();
  v_adopt := public.org_adopt_pass('affiliate_partner', p_limit);

  -- never touch enabled / go_key / redirect_template — only organization_id
  for r in
    select ap.id, ap.partner_name, ap.domains
    from affiliate_partners ap
    where ap.organization_id is null
      and not exists (select 1 from org_link_suggestions s
                      where s.entity_type = 'affiliate_partner' and s.entity_id = ap.id and s.status = 'open')
    order by ap.created_at
    limit p_limit
  loop
    perform public.link_organization_entity(
      public.org_mint(r.partner_name,
                      case when array_length(r.domains, 1) >= 1 then 'https://' || public.org_normalize_domain(r.domains[1]) end,
                      null, null, null, 'affiliate_partner',
                      jsonb_build_object('name', jsonb_build_object('source', 'affiliate_partners_backfill'))),
      'affiliate_partner', r.id);
    v_minted := v_minted + 1;
  end loop;
  return v_adopt || jsonb_build_object('minted', v_minted);
end; $$;

create or replace function public.run_backfill_orgs_from_hotels(p_limit int default 200)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_adopt jsonb;
  v_minted int := 0;
  r record;
begin
  perform public.assert_admin_or_internal();
  v_adopt := public.org_adopt_pass('hotel', p_limit);

  -- Mint only for real lodging businesses: bnb/apartment rows are private
  -- host listings (misterb&b), not organizations — they stay unlinked unless
  -- an admin links or promotes them by hand. Vetted rows only: minted orgs
  -- DO enter search_documents.
  for r in
    select h.id, h.name, h.website, h.city_id, h.country_id,
           case when array_length(h.images, 1) >= 1 then h.images[1] end as logo
    from hotels h
    where h.organization_id is null and h.duplicate_of_id is null
      and h.hotel_type in ('hotel', 'resort')
      and (h.verified or h.lgbtq_friendly)
      and not exists (select 1 from org_link_suggestions s
                      where s.entity_type = 'hotel' and s.entity_id = h.id and s.status = 'open')
    order by h.created_at
    limit p_limit
  loop
    perform public.link_organization_entity(
      public.org_mint(r.name, r.website, r.city_id, r.country_id, r.logo, 'hotel',
                      jsonb_build_object('name', jsonb_build_object('source', 'hotels_backfill'))),
      'hotel', r.id);
    v_minted := v_minted + 1;
  end loop;
  return v_adopt || jsonb_build_object('minted', v_minted);
end; $$;

create or replace function public.run_backfill_orgs_from_venues(p_limit int default 200, p_min_quality int default 70)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_adopt jsonb;
  v_minted int := 0;
  r record;
begin
  perform public.assert_admin_or_internal();
  v_adopt := public.org_adopt_pass('venue', p_limit);

  -- biggest table: mint only for high-quality unlinked venues, small batches.
  for r in
    select v.id, v.name, v.website, v.city_id, v.country_id, v.logo_url
    from venues v
    where v.organization_id is null and v.duplicate_of_id is null
      and coalesce(v.quality_score, 0) >= p_min_quality
      and not exists (select 1 from org_link_suggestions s
                      where s.entity_type = 'venue' and s.entity_id = v.id and s.status = 'open')
    order by v.quality_score desc nulls last, v.created_at
    limit p_limit
  loop
    perform public.link_organization_entity(
      public.org_mint(r.name, r.website, r.city_id, r.country_id, r.logo_url, 'venue',
                      jsonb_build_object('name', jsonb_build_object('source', 'venues_backfill'))),
      'venue', r.id);
    v_minted := v_minted + 1;
  end loop;
  return v_adopt || jsonb_build_object('minted', v_minted);
end; $$;

-- Brands are queue-only: queer-owned approved brands get a suggestion
-- (link when a domain/name match exists, mint proposal otherwise); global
-- brands stay unlinked forever. No auto-create, no auto-link.
create or replace function public.run_queue_brand_org_suggestions(p_limit int default 200)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_queued int := 0;
  r record;
begin
  perform public.assert_admin_or_internal();

  for r in
    select b.id, b.display_name, b.website, c.organization_id, c.org_name, c.match_type, c.confidence
    from marketplace_brands b
    left join lateral (
      select f.organization_id, f.org_name, f.match_type, f.confidence
      from public.find_org_adoption_candidates('brand', 2000) f
      where f.entity_id = b.id
      order by f.confidence desc limit 1
    ) c on true
    where b.organization_id is null and b.status = 'approved' and b.ownership_tags <> '{}'
      and not exists (select 1 from org_link_suggestions s
                      where s.entity_type = 'brand' and s.entity_id = b.id and s.status <> 'superseded')
    limit p_limit
  loop
    insert into public.org_link_suggestions
      (entity_type, entity_id, organization_id, confidence, reason, payload)
    values
      ('brand', r.id, r.organization_id, coalesce(r.confidence, 0.50),
       coalesce(r.match_type, 'queer_brand_mint'),
       jsonb_build_object('entity', jsonb_build_object('name', r.display_name, 'website', r.website),
                          'org', case when r.organization_id is null then null
                                      else jsonb_build_object('id', r.organization_id, 'name', r.org_name) end))
    on conflict (entity_type, entity_id) where status = 'open' do nothing;
    v_queued := v_queued + 1;
  end loop;
  return jsonb_build_object('entity_type', 'brand', 'queued', v_queued);
end; $$;

-- ── 4. decide a suggestion ─────────────────────────────────────────────────
create or replace function public.decide_org_adoption(
  p_id uuid, p_approve boolean, p_org_id uuid default null, p_note text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  s record;
  v_org uuid;
begin
  perform public.assert_admin_or_internal();

  select * into s from org_link_suggestions where id = p_id and status = 'open' for update;
  if not found then
    raise exception 'suggestion % not open', p_id;
  end if;

  if not p_approve then
    update org_link_suggestions
       set status = 'rejected', reviewer_id = auth.uid(), reviewer_note = p_note, reviewed_at = now()
     where id = p_id;
    return jsonb_build_object('status', 'rejected');
  end if;

  v_org := coalesce(p_org_id, s.organization_id);
  if v_org is null then
    -- mint-on-approve (brand mint proposals): build the org from the payload
    v_org := public.org_mint(
      coalesce(s.payload->'entity'->>'name', 'org'),
      s.payload->'entity'->>'website',
      null, null, null,
      case s.entity_type when 'merchant' then 'seller' else s.entity_type end,
      jsonb_build_object('name', jsonb_build_object('source', 'org_adoption_approve')));
  end if;

  perform public.link_organization_entity(v_org, s.entity_type, s.entity_id);

  update org_link_suggestions
     set status = 'approved', organization_id = v_org,
         reviewer_id = auth.uid(), reviewer_note = p_note, reviewed_at = now()
   where id = p_id;
  return jsonb_build_object('status', 'approved', 'organization_id', v_org);
end; $$;

revoke execute on function public.decide_org_adoption(uuid,boolean,uuid,text) from public, anon;
grant execute on function public.decide_org_adoption(uuid,boolean,uuid,text) to authenticated, service_role;

-- ── 5. promote an entity to a business (admin one-click) ───────────────────
create or replace function public.promote_entity_to_organization(p_entity_type text, p_entity_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_org uuid;
  v_name text; v_website text; v_city uuid; v_country uuid; v_logo text;
  v_role text;
begin
  perform public.assert_admin_or_internal();

  if p_entity_type = 'venue' then
    select organization_id, name, website, city_id, country_id, logo_url
      into v_org, v_name, v_website, v_city, v_country, v_logo
      from venues where id = p_entity_id;
    v_role := 'venue';
  elsif p_entity_type = 'hotel' then
    select organization_id, name, website, city_id, country_id,
           case when array_length(images, 1) >= 1 then images[1] end
      into v_org, v_name, v_website, v_city, v_country, v_logo
      from hotels where id = p_entity_id;
    v_role := 'hotel';
  elsif p_entity_type = 'merchant' then
    select organization_id, display_name, shop_domain, null::uuid, null::uuid, null::text
      into v_org, v_name, v_website, v_city, v_country, v_logo
      from marketplace_merchants where id = p_entity_id;
    v_role := 'seller';
  elsif p_entity_type = 'affiliate_partner' then
    select organization_id, partner_name,
           case when array_length(domains, 1) >= 1 then 'https://' || public.org_normalize_domain(domains[1]) end,
           null::uuid, null::uuid, null::text
      into v_org, v_name, v_website, v_city, v_country, v_logo
      from affiliate_partners where id = p_entity_id;
    v_role := 'affiliate_partner';
  elsif p_entity_type = 'brand' then
    select organization_id, display_name, website, null::uuid, null::uuid, logo_url
      into v_org, v_name, v_website, v_city, v_country, v_logo
      from marketplace_brands where id = p_entity_id;
    v_role := 'brand';
  else
    raise exception 'unknown entity_type: %', p_entity_type;
  end if;

  if v_name is null and v_org is null then
    raise exception '% % not found', p_entity_type, p_entity_id;
  end if;
  if v_org is not null then
    return v_org;  -- already linked
  end if;

  v_org := public.org_mint(v_name, v_website, v_city, v_country, v_logo, v_role,
    jsonb_build_object('name', jsonb_build_object('source', 'promote_' || p_entity_type)));
  perform public.link_organization_entity(v_org, p_entity_type, p_entity_id);
  -- close any open suggestion for this entity
  update org_link_suggestions set status = 'superseded', reviewed_at = now()
   where entity_type = p_entity_type and entity_id = p_entity_id and status = 'open';
  return v_org;
end; $$;

revoke execute on function public.promote_entity_to_organization(text,uuid) from public, anon;
grant execute on function public.promote_entity_to_organization(text,uuid) to authenticated, service_role;

-- ── 6. nightly wrapper + drift counts ──────────────────────────────────────
create or replace function public.run_org_spine_backfill(p_limit int default 200)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare v jsonb := '[]'::jsonb;
begin
  perform public.assert_admin_or_internal();
  v := v || public.run_backfill_orgs_from_merchants(p_limit);
  v := v || public.run_backfill_orgs_from_affiliate_partners(50);
  v := v || public.run_backfill_orgs_from_hotels(p_limit);
  v := v || public.run_queue_brand_org_suggestions(p_limit);
  v := v || public.run_backfill_orgs_from_venues(p_limit);
  return v;
end; $$;

create or replace function public.org_spine_drift_counts()
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'hotels_unlinked', (select count(*) from hotels
                        where organization_id is null and duplicate_of_id is null
                          and hotel_type in ('hotel', 'resort')
                          and (verified or lgbtq_friendly)),
    'merchants_unlinked', (select count(*) from marketplace_merchants
                           where organization_id is null and is_enabled),
    'partners_unlinked', (select count(*) from affiliate_partners where organization_id is null),
    'brands_owned_unlinked', (select count(*) from marketplace_brands
                              where organization_id is null and status = 'approved'
                                and ownership_tags <> '{}'),
    'venues_unlinked_quality', (select count(*) from venues
                                where organization_id is null and duplicate_of_id is null
                                  and coalesce(quality_score, 0) >= 70),
    'suggestions_open', (select count(*) from org_link_suggestions where status = 'open'),
    'organizations_total', (select count(*) from organizations)
  );
$$;

revoke execute on function public.run_org_spine_backfill(int) from public, anon;
grant execute on function public.run_org_spine_backfill(int) to service_role;
revoke execute on function public.run_backfill_orgs_from_merchants(int) from public, anon;
grant execute on function public.run_backfill_orgs_from_merchants(int) to service_role;
revoke execute on function public.run_backfill_orgs_from_affiliate_partners(int) from public, anon;
grant execute on function public.run_backfill_orgs_from_affiliate_partners(int) to service_role;
revoke execute on function public.run_backfill_orgs_from_hotels(int) from public, anon;
grant execute on function public.run_backfill_orgs_from_hotels(int) to service_role;
revoke execute on function public.run_backfill_orgs_from_venues(int,int) from public, anon;
grant execute on function public.run_backfill_orgs_from_venues(int,int) to service_role;
revoke execute on function public.run_queue_brand_org_suggestions(int) from public, anon;
grant execute on function public.run_queue_brand_org_suggestions(int) to service_role;
revoke execute on function public.org_spine_drift_counts() from public, anon;
grant execute on function public.org_spine_drift_counts() to authenticated, service_role;
