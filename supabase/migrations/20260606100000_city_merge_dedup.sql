-- City-level dedup: reversible duplicate-city merge (analogue of merge_venues).
--
-- The cities table accumulated name-variant duplicates of the same physical city
-- (Cologne/Köln, Prague/Praha, Antwerp/Antwerpen, Brussels/Bruxelles/Bruessel,
-- Copenhagen/København K/V, Florence/Firenze, Naples/Napoli, Ibiza/Eivissa, …)
-- sitting within ~1km of each other and splitting venues/events across two ids.
--
-- Merge is SOFT + REVERSIBLE, mirroring merge_venues:
--   * sets the dropped city's duplicate_of_id (already excluded from the public
--     city hooks via `.is('duplicate_of_id', null)`),
--   * reparents every child FK (venues/events/hotels/festivals/personalities/…)
--     to the canonical, plain for content tables and conflict-safe for the
--     user/junction tables that carry a city_id uniqueness constraint,
--   * rewrites the venues.city / events.city denormalized text to the canonical
--     name (the CityDetail page filters venues by name, not city_id),
--   * registers the dropped city's name as a city_alias of the canonical so
--     future ingestion resolves the variant straight to the survivor,
--   * audits the op so it can be undone.
--
-- NB: like merge_venues, the admin guard is an inline schema-qualified user_roles
-- check (public.is_admin() errors under its empty search_path). The guard only
-- fires for JWT callers; backend/service_role callers (auth.uid() null) bypass it,
-- and EXECUTE is revoked from anon/public.

create table if not exists public.city_merge_audit (
  id uuid primary key default gen_random_uuid(),
  keep_id uuid not null references public.cities(id) on delete cascade,
  drop_id uuid not null references public.cities(id) on delete cascade,
  actor uuid,
  reparented jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz
);
create index if not exists city_merge_audit_drop_idx on public.city_merge_audit(drop_id);

alter table public.city_merge_audit enable row level security;
drop policy if exists city_merge_audit_admin_read on public.city_merge_audit;
create policy city_merge_audit_admin_read on public.city_merge_audit
  for select using (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'));

-- ── merge ───────────────────────────────────────────────────────────────────
create or replace function public.merge_cities(p_keep_id uuid, p_drop_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_keep_name text; v_keep_dup uuid;
  v_drop_name text; v_drop_dup uuid;
  v_counts jsonb := '{}'::jsonb; v_audit_id uuid; n int;
begin
  if v_actor is not null
     and not exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  if p_keep_id = p_drop_id then raise exception 'keep and drop must differ'; end if;

  select name, duplicate_of_id into v_keep_name, v_keep_dup from public.cities where id = p_keep_id;
  if not found then raise exception 'keep city % not found', p_keep_id; end if;
  if v_keep_dup is not null then raise exception 'keep city is itself a duplicate'; end if;

  select name, duplicate_of_id into v_drop_name, v_drop_dup from public.cities where id = p_drop_id;
  if not found then raise exception 'drop city % not found', p_drop_id; end if;
  if v_drop_dup is not null then raise exception 'drop city already merged'; end if;

  -- denormalized city text on the high-value content tables → canonical name,
  -- scoped to the dropped city's rows (keeps the search trigger churn minimal).
  update public.venues set city = v_keep_name where city_id = p_drop_id and city is distinct from v_keep_name;
  update public.events set city = v_keep_name where city_id = p_drop_id and city is distinct from v_keep_name;

  -- content children with no city-scoped unique: straight reparent
  update public.venues            set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('venues', n);
  update public.events            set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('events', n);
  update public.festivals         set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('festivals', n);
  update public.hotels            set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('hotels', n);
  update public.queer_villages    set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('queer_villages', n);
  update public.trip_places       set city_id = p_keep_id where city_id = p_drop_id;
  update public.trips             set primary_city_id = p_keep_id where primary_city_id = p_drop_id;
  update public.event_guides      set city_id = p_keep_id where city_id = p_drop_id;
  update public.venue_guides      set city_id = p_keep_id where city_id = p_drop_id;
  update public.marketplace_guides set city_id = p_keep_id where city_id = p_drop_id;
  update public.geo_sources       set city_id = p_keep_id where city_id = p_drop_id;
  update public.reservations      set city_id = p_keep_id where city_id = p_drop_id;
  update public.intimate_cruising_mode set city_id = p_keep_id where city_id = p_drop_id;
  update public.intimate_profiles set discovery_city_id = p_keep_id where discovery_city_id = p_drop_id;
  update public.user_travel_preferences set home_city_id = p_keep_id where home_city_id = p_drop_id;
  update public.ingestion_events  set city_id = p_keep_id where city_id = p_drop_id;
  update public.flyer_scans       set matched_city_id = p_keep_id where matched_city_id = p_drop_id;
  update public.trip_geo_review_queue set resolved_city_id = p_keep_id where resolved_city_id = p_drop_id;
  update public.venue_coord_fixes set city_id = p_keep_id where city_id = p_drop_id;
  update public.venue_event_staging set city_id = p_keep_id where city_id = p_drop_id;
  update public.user_place_marks  set city_id = p_keep_id where city_id = p_drop_id;
  update public.personalities     set city_id = p_keep_id where city_id = p_drop_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('personalities', n);
  update public.personalities     set death_city_id = p_keep_id where death_city_id = p_drop_id;

  -- junction/user tables with a city-scoped unique: reparent only where it won't
  -- collide with an existing canonical row; leftover conflicts stay on the dup.
  update public.news_article_cities a set city_id = p_keep_id where a.city_id = p_drop_id
    and not exists (select 1 from public.news_article_cities k where k.city_id = p_keep_id and k.article_id = a.article_id);
  update public.city_favorites f set city_id = p_keep_id where f.city_id = p_drop_id
    and not exists (select 1 from public.city_favorites k where k.city_id = p_keep_id and k.user_id = f.user_id);
  update public.source_coverage_targets s set city_id = p_keep_id where s.city_id = p_drop_id
    and not exists (select 1 from public.source_coverage_targets k where k.city_id = p_keep_id
                    and k.source_slug = s.source_slug and k.entity_type = s.entity_type
                    and k.accommodation_type is not distinct from s.accommodation_type);
  update public.event_coverage_gaps g set city_id = p_keep_id where g.city_id = p_drop_id
    and not exists (select 1 from public.event_coverage_gaps k where k.city_id = p_keep_id);

  -- carry the dropped city's aliases over, then register its own name as an alias
  update public.city_aliases al set city_id = p_keep_id where al.city_id = p_drop_id
    and not exists (select 1 from public.city_aliases k where k.city_id = p_keep_id and k.alias_key = al.alias_key);
  if v_drop_name is not null and v_drop_name <> v_keep_name then
    insert into public.city_aliases (city_id, alias)
    values (p_keep_id, v_drop_name)
    on conflict (city_id, alias_key) do nothing;
  end if;

  update public.cities set duplicate_of_id = p_keep_id, updated_at = now() where id = p_drop_id;

  insert into public.city_merge_audit (keep_id, drop_id, actor, reparented)
    values (p_keep_id, p_drop_id, v_actor, v_counts) returning id into v_audit_id;

  return jsonb_build_object('audit_id', v_audit_id, 'keep_id', p_keep_id, 'drop_id', p_drop_id, 'reparented', v_counts);
end; $$;

-- ── undo ────────────────────────────────────────────────────────────────────
-- v1: un-hide the duplicate. Reparented children remain on the canonical (a full
-- row-split is deferred); the duplicate reappears, which restores visibility.
create or replace function public.unmerge_cities(p_audit_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.city_merge_audit;
begin
  if auth.uid() is not null
     and not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') then
    raise exception 'forbidden: admin only';
  end if;
  select * into a from public.city_merge_audit where id = p_audit_id;
  if not found then raise exception 'audit % not found', p_audit_id; end if;
  if a.undone_at is not null then raise exception 'merge already undone'; end if;

  update public.cities set duplicate_of_id = null, updated_at = now()
    where id = a.drop_id and duplicate_of_id = a.keep_id;
  delete from public.city_aliases where city_id = a.keep_id
    and alias_key = lower((select name from public.cities where id = a.drop_id));
  update public.city_merge_audit set undone_at = now() where id = p_audit_id;

  return jsonb_build_object('unmerged', a.drop_id, 'keep_id', a.keep_id);
end; $$;

revoke all on function public.merge_cities(uuid, uuid) from public, anon;
revoke all on function public.unmerge_cities(uuid) from public, anon;
grant execute on function public.merge_cities(uuid, uuid) to authenticated, service_role;
grant execute on function public.unmerge_cities(uuid) to authenticated, service_role;

-- NB: two survivors keep a native/accented label (Casteddu/Cagliari, Québec)
-- because a unique index on (lower(name), country_id) is still held by the
-- soft-hidden duplicate ("Cagliari", "Quebec City"). merge_cities registers the
-- English form as a city_alias of the survivor, so name lookups still resolve.

-- ── run the verified merge set (keep_id, drop_id) ───────────────────────────
do $$
declare
  pairs uuid[][] := array[
    -- keep (canonical, English/most-used)        drop (name variant)
    array['0c6a2c25-ac66-4015-a7a8-ddcc2e5e8a58','c125346c-2b96-45fb-8063-e4f6a85ad8ea'], -- Brighton ← Brighton & Hove
    array['89018aff-db7c-423b-a136-9112424bdb25','4fa35a67-e109-4454-ba8a-0d69e3518391'], -- Gran Canaria ← Grancanaria
    array['177c7ab4-9bcd-4752-a57e-fba6f0d84c30','c41a3ac5-2b29-42cb-8283-051555bfccc7'], -- Hanoi ← Thành phố Hà Nội
    array['a0d496c5-6762-47f1-9b0c-ec28268cc8d7','fe79f1bf-75f1-4d84-9b4b-3b549bfb7e0c'], -- Hospitalet de Llobregat ← L'Hospitalet…
    array['57bcbfac-4457-4ed9-9dfd-b65951f3013c','c1fd116b-4eb2-4d8c-a0c0-d737f1fdd6be'], -- Santa Cruz ← Santa Cruz de la Sierra
    array['e1418a71-9dd6-49fe-99b1-234df6a62304','4b695173-cb60-4d2e-bd38-dcfae1680b3c'], -- Alicante ← Alacant / Alicante
    array['30d15c18-5b9e-498a-8b76-08cb78b4647f','addc2151-dfed-4611-b705-2b3b7b10ac7a'], -- Antwerp ← Antwerpen
    array['0f896119-7a90-41e3-baf2-51b4ce36068c','96b4b586-b462-4ba9-a01f-b24f470b6b0f'], -- Copenhagen ← København V
    array['0f896119-7a90-41e3-baf2-51b4ce36068c','6da173a4-2597-4c14-b508-8630d49a20d2'], -- Copenhagen ← København K
    array['0f896119-7a90-41e3-baf2-51b4ce36068c','726688fb-9706-48be-a330-60c5adaab2c7'], -- Copenhagen ← Kopenhagen
    array['22d1b802-1459-488f-951c-a5e5cf1d829b','cff93156-42b8-4db9-8d94-f6f6dd4587d9'], -- Rochester ← City of Rochester
    array['5de0bcdc-186b-4c67-9a1d-f8dc22e5255d','14f5c3b5-1519-43cc-b2ef-5aa38883bd20'], -- Silom ← Si Lom Subdistrict
    array['dc893e2f-2ba5-4647-9dc0-a7005f667be6','e0f2654a-a8e6-4058-b73a-87ab773dedf4'], -- Cagliari ← Cagliari (tmp)
    array['3ace7275-9350-4204-8e7a-c0acf8821c23','602d5e7d-a5e5-4d8f-9b5c-bf0ebf85be43'], -- Melbourne ← Melbourne City Centre
    array['c7198e4f-01d5-4b07-adb0-df41041c2f41','30f96ab6-53f9-423d-bb06-d6197445a95c'], -- Cologne ← Köln
    array['afbe310b-7a97-462b-8f60-4badda106416','c95bd7e6-e439-469e-9a9d-dc68ea0cd531'], -- Ibiza ← Eivissa
    array['12e9af28-e270-4230-bfd8-b449b17af398','ff5be66a-1d42-47c6-bb07-bbee7cbb6a8e'], -- Quebec City ← Quebec City (dup)
    array['0a2afd47-93f2-424c-b616-63d2567900cf','a451b6f4-300d-45b7-b87b-00703a6a16bd'], -- Brussels ← Bruessel
    array['9c3672a7-7297-408b-aaa3-897f1eef7cc2','0301ea38-03e4-439c-94a4-07383c630ed7'], -- Nicosia ← Λευκωσία
    array['a65855a1-dbcf-455a-ac42-d3a2859085d2','1c9a389b-d5ec-441c-b15e-022579c244d7'], -- Pelt 3910 ← Neerpelt 3910
    array['277b54ab-a504-49bd-8262-9e05f3cdb58e','6c93cb77-8edf-451f-abee-a58f3ac82587'], -- Florence ← Firenze
    array['7f78b3a4-a2e5-44f5-a694-c2a55cd4bec1','60549579-16c5-452d-935b-e320aacac4e9'], -- St. Petersburg ← Saint Petersburg
    array['0a2afd47-93f2-424c-b616-63d2567900cf','02310a2b-2fa5-4f4e-844b-102636761a97'], -- Brussels ← Bruxelles - Brussel
    array['8578392e-01b7-4f38-a6e5-6ff9c25a29fe','328565c0-17f7-41aa-b4ef-9ab0481bbe4c'], -- Xalapa ← Xalapa de Enríquez
    array['126745e0-080e-40d5-b4f9-02f8fe806ff4','650979e2-ab8f-4a79-a01d-bad8fb4bc202'], -- Pachuca ← Pachuca de Soto
    array['7a236f72-9fd6-4e12-9785-352e4a8c87aa','552c130f-c90a-4a58-9d88-e1a4509fa05a'], -- Prague ← Praha
    array['d11f464f-237b-4bfe-aef1-3761be31df2d','d0f9d56d-2f1c-4f87-bbc2-f4daecae6516']  -- Naples ← Napoli
  ];
  i int;
begin
  for i in 1 .. array_length(pairs, 1) loop
    perform public.merge_cities(pairs[i][1], pairs[i][2]);
  end loop;
end $$;
