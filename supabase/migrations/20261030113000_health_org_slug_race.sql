-- `commit_health_service_org` loses a race on the slug when two same-named
-- branches commit at once.
--
-- MEASURED, NOT THEORISED. The first live aids.ch import committed 188 of 201
-- and lost 13 to:
--
--     duplicate key value violates unique constraint "organizations_slug_key"
--
-- every one of them a name the feed carries more than once — "SIPE
-- Beratungszentrum" (×2), "Fondation PROFA, Consultation de santé sexuelle"
-- (×2), "EOC, Consultori di salute sessuale" (×3), "Fachstelle Beziehungsfragen
-- Kanton Solothurn" (×2), and three more. These are genuinely different places:
-- branches of one organisation in different towns, each with its own address
-- and coordinates. They SHOULD get `-1`/`-2` slugs, which the existing loop
-- already knows how to produce.
--
-- WHY THE LOOP DOES NOT DO IT. It is a check-then-insert:
--
--     while exists (select 1 from organizations where slug = v_slug) loop
--       v_slug := v_base || '-' || v_try;
--     end loop;
--     insert into organizations (...) values (v_slug, ...);
--
-- The SELECT takes no lock, so with `source-aids-ch` running six workers, two
-- of them holding two branches of the same name both see the slug free, and the
-- second INSERT is the one that raises. Nothing was corrupted — the row simply
-- did not commit — but "did not commit" for a clinic is a clinic missing from
-- the directory, and a re-run reproduces it because the race is in the shape of
-- the code, not in the timing.
--
-- THE FIX IS TO LET THE UNIQUE INDEX BE THE ARBITER, which is the only thing
-- that can be. The pre-check loop stays — it resolves the common case without
-- ever raising — and the INSERT is now wrapped so a lost race bumps the suffix
-- and retries instead of failing the record.
--
-- IT RETRIES ONLY ON THE SLUG CONSTRAINT. `GET STACKED DIAGNOSTICS
-- CONSTRAINT_NAME` is checked, because a blanket `when unique_violation`
-- would silently swallow a collision on some other index and spin 50 times
-- before reporting a misleading "could not find a free slug". Anything else
-- re-raises immediately with its original message.
--
-- Advisory locking on the base slug was the other candidate and is worse here:
-- it serialises every commit that shares a name prefix for the whole
-- transaction, and this function is deliberately called concurrently.

create or replace function public.commit_health_service_org(p jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_ext          text := nullif(trim(p->>'external_id'), '');
  v_name         text := nullif(trim(p->>'name'), '');
  v_website      text := nullif(trim(p->>'website'), '');
  -- The provenance tag. Required: it is what "who told us this" and every
  -- source-scoped promote/retire query key on, so a default would let a caller
  -- that forgot it file records under another directory's name.
  v_source       text := nullif(trim(p->'source'->>'name'), '');
  v_detail_key   text := coalesce(nullif(trim(p->>'enrichment_key'), ''), nullif(trim(p->'source'->>'name'), ''));
  v_slug_default text := coalesce(nullif(trim(p->>'slug_fallback'), ''), 'health-service');
  v_domain       text;
  v_id           uuid;
  v_matched_ext  boolean := false;
  v_slug         text;
  v_base         text;
  v_try          integer := 0;
  v_constraint   text;
  v_country_id   uuid;
  v_city_id      uuid;
  v_city_name    text := nullif(trim(p->>'city'), '');
  v_city_hits    integer := 0;
  v_city_note    text := null;
  v_tags         text[];
  v_groups       text[];
  v_lat          double precision;
  v_lng          double precision;
begin
  if v_ext is null or v_name is null then
    raise exception 'commit_health_service_org: external_id and name are both required (got %, %)', v_ext, v_name;
  end if;
  if v_source is null then
    raise exception 'commit_health_service_org: source.name is required (it is the provenance tag)';
  end if;

  v_domain := nullif(lower(regexp_replace(coalesce(v_website, ''), '^https?://(www\.)?([^/?#]+).*$', '\2')), '');

  v_lat := nullif(p->>'latitude', '')::double precision;
  v_lng := nullif(p->>'longitude', '')::double precision;
  -- Half a coordinate is not a location. The paired CHECK would reject it, but
  -- failing the whole record over it would lose an otherwise good clinic.
  if v_lat is null or v_lng is null or (v_lat = 0 and v_lng = 0) then
    v_lat := null; v_lng := null;
  end if;

  ------------------------------------------------------------------ geography
  select gp.id into v_country_id
    from public.geo_places gp
   where gp.place_type = 'country'
     and gp.duplicate_of_id is null
     and (
       (nullif(p->>'country_code','') is not null and upper(gp.code) = upper(p->>'country_code'))
       or (nullif(p->>'country','') is not null and lower(gp.name) = lower(p->>'country'))
     )
   order by (upper(gp.code) = upper(coalesce(p->>'country_code',''))) desc
   limit 1;

  -- Resolve the city ONLY within the resolved country, and BLOCK rather than
  -- guess when the name is ambiguous. `20260802090844` is the record of why:
  -- resolving by name alone attached 116 events to the wrong city (Portland ME
  -- -> Portland OR) and then stamped each with that city's centroid. A null
  -- city_id is recoverable; a wrong one is not, and here it would additionally
  -- mislabel which country's health system a clinic belongs to.
  if v_country_id is not null and v_city_name is not null then
    select count(*) into v_city_hits
      from public.geo_places gp
     where gp.place_type = 'city'
       and gp.duplicate_of_id is null
       and gp.country_id = v_country_id
       and lower(gp.name) = lower(v_city_name);

    if v_city_hits = 1 then
      select gp.id into v_city_id
        from public.geo_places gp
       where gp.place_type = 'city'
         and gp.duplicate_of_id is null
         and gp.country_id = v_country_id
         and lower(gp.name) = lower(v_city_name);
    elsif v_city_hits > 1 then
      v_city_note := format('ambiguous: %s cities named %L in this country', v_city_hits, v_city_name);
    else
      v_city_note := format('no city named %L in this country', v_city_name);
    end if;
  elsif v_country_id is null then
    v_city_note := 'country unresolved';
  end if;

  ------------------------------------------------------------------ vocabulary
  select array_agg(distinct a.slug) into v_tags
    from public.amenities a
   where a.is_active
     and a.slug in (select jsonb_array_elements_text(coalesce(p->'tags', '[]'::jsonb)));

  select array_agg(distinct tg.slug) into v_groups
    from public.target_groups tg
   where tg.is_active
     and exists (
       select 1
         from jsonb_array_elements_text(coalesce(p->'target_terms', '[]'::jsonb)) as t(term)
        where lower(tg.slug) = t.term
           or lower(tg.name) = t.term
           or t.term in (select lower(x) from unnest(coalesce(tg.aliases, '{}')) as x)
     );

  ------------------------------------------------- adopt-before-create ladder
  select o.id into v_id
    from public.organizations o
   where o.field_provenance->'source'->>'external_id' = v_ext
     and o.field_provenance->'source'->>'name' is not distinct from v_source
     and o.duplicate_of_id is null
   limit 1;
  v_matched_ext := v_id is not null;

  -- Domain adoption, but NEVER onto an org another directory entry already owns.
  --
  -- `website_domain` identifies a business; it does NOT identify a LOCATION,
  -- and these sources are full of multi-branch providers whose every branch
  -- publishes the same site. Measured on the testfinder corpus: 35 domains are
  -- shared by 124 centres. Without the external_id guard the first centre
  -- adopts (or mints) a row and every sibling adopts that SAME row, each
  -- overwriting its name, address, coordinates and provenance: 530 payloads
  -- collapsed to 441 rows.
  --
  -- So adopt only an org that no directory entry has claimed yet. Two
  -- directories that both list the same clinic therefore mint two rows on
  -- purpose; resolving that is the nightly dedup sweep's job, which merges
  -- reversibly and audits.
  if v_id is null and v_domain is not null then
    select o.id into v_id
      from public.organizations o
     where lower(o.website_domain) = v_domain
       and o.duplicate_of_id is null
       and o.field_provenance->'source'->>'external_id' is null
     limit 1;
  end if;

  ------------------------------------------------------------------- insert
  if v_id is null then
    v_base := left(regexp_replace(lower(unaccent(v_name)), '[^a-z0-9]+', '-', 'g'), 60);
    v_base := trim(both '-' from v_base);
    if v_base = '' then v_base := v_slug_default; end if;
    v_slug := v_base;

    -- Cheap pre-check: resolves the ordinary case without ever raising.
    while exists (select 1 from public.organizations where slug = v_slug) loop
      v_try := v_try + 1;
      if v_try > 50 then
        raise exception 'commit_health_service_org: could not find a free slug for %', v_name;
      end if;
      v_slug := v_base || '-' || v_try;
    end loop;

    -- The unique index is the arbiter. The SELECT above takes no lock, so two
    -- concurrent commits of two same-named branches can both see a slug free;
    -- the loser bumps its suffix and tries again rather than losing the record.
    loop
      begin
        insert into public.organizations (
          slug, name, description, roles, status, needs_attention,
          website, website_domain, email, phone,
          address, postal_code, city_id, country_id, latitude, longitude,
          tags, target_groups, field_provenance, enrichment_status
        ) values (
          v_slug, v_name, nullif(trim(p->>'description'), ''), array['support'], 'draft', true,
          v_website, v_domain, nullif(trim(p->>'email'), ''), nullif(trim(p->>'phone'), ''),
          nullif(trim(p->>'address'), ''), nullif(trim(p->>'postal_code'), ''),
          v_city_id, v_country_id, v_lat, v_lng,
          coalesce(v_tags, '{}') || array[v_source],
          coalesce(v_groups, '{}'),
          jsonb_build_object('source', coalesce(p->'source', '{}'::jsonb)),
          jsonb_build_object(
            v_detail_key, coalesce(p->'detail', '{}'::jsonb)
                          || jsonb_build_object('city_link_note', v_city_note))
        )
        returning id into v_id;
        exit;
      exception when unique_violation then
        -- ONLY the slug index retries. A blanket handler would swallow a
        -- collision on some other constraint and spin 50 times before
        -- reporting a misleading "could not find a free slug".
        -- CONSTRAINT_NAME, not PG_EXCEPTION_CONSTRAINT: the latter is the
        -- name in libpq's error fields and PL/pgSQL does not accept it
        -- (42601 unrecognized GET DIAGNOSTICS item).
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint is distinct from 'organizations_slug_key' then
          raise;
        end if;
        v_try := v_try + 1;
        if v_try > 50 then
          raise exception 'commit_health_service_org: could not find a free slug for % after % attempts', v_name, v_try;
        end if;
        v_slug := v_base || '-' || v_try;
      end;
    end loop;

  ------------------------------------------------------------------- update
  elsif v_matched_ext then
    -- Our own row: refresh source-owned facts, because a re-fetch is the only
    -- thing that keeps them current. `status` is never written — an admin may
    -- have promoted the row and a re-sync must not silently unpublish it.
    update public.organizations o set
      name           = v_name,
      description    = coalesce(nullif(trim(p->>'description'), ''), o.description),
      roles          = (select array_agg(distinct r) from unnest(o.roles || array['support']) r),
      website        = coalesce(v_website, o.website),
      website_domain = coalesce(v_domain, o.website_domain),
      email          = coalesce(nullif(trim(p->>'email'), ''), o.email),
      phone          = coalesce(nullif(trim(p->>'phone'), ''), o.phone),
      address        = coalesce(nullif(trim(p->>'address'), ''), o.address),
      postal_code    = coalesce(nullif(trim(p->>'postal_code'), ''), o.postal_code),
      city_id        = coalesce(v_city_id, o.city_id),
      country_id     = coalesce(v_country_id, o.country_id),
      latitude       = coalesce(v_lat, o.latitude),
      longitude      = coalesce(v_lng, o.longitude),
      -- coalesce the WHOLE aggregate: array_agg over an empty set returns
      -- NULL, and both columns are NOT NULL.
      tags           = coalesce((select array_agg(distinct t)
                          from unnest(o.tags || coalesce(v_tags, '{}') || array[v_source]) t), '{}'),
      target_groups  = coalesce((select array_agg(distinct g)
                          from unnest(o.target_groups || coalesce(v_groups, '{}')) g), '{}'),
      field_provenance = o.field_provenance || jsonb_build_object('source', coalesce(p->'source', '{}'::jsonb)),
      enrichment_status = o.enrichment_status || jsonb_build_object(
        v_detail_key, coalesce(p->'detail', '{}'::jsonb)
                      || jsonb_build_object('city_link_note', v_city_note)),
      updated_at = now()
    where o.id = v_id;

  else
    -- Adopted someone else's row: fill only what is empty, never clobber
    -- curated editorial. Same rule as commit_venue_staging_item's UPDATE branch.
    update public.organizations o set
      description    = coalesce(o.description, nullif(trim(p->>'description'), '')),
      roles          = (select array_agg(distinct r) from unnest(o.roles || array['support']) r),
      email          = coalesce(o.email, nullif(trim(p->>'email'), '')),
      phone          = coalesce(o.phone, nullif(trim(p->>'phone'), '')),
      address        = coalesce(o.address, nullif(trim(p->>'address'), '')),
      postal_code    = coalesce(o.postal_code, nullif(trim(p->>'postal_code'), '')),
      city_id        = coalesce(o.city_id, v_city_id),
      country_id     = coalesce(o.country_id, v_country_id),
      latitude       = coalesce(o.latitude, v_lat),
      longitude      = coalesce(o.longitude, v_lng),
      tags           = coalesce((select array_agg(distinct t)
                          from unnest(o.tags || coalesce(v_tags, '{}') || array[v_source]) t), '{}'),
      target_groups  = coalesce((select array_agg(distinct g)
                          from unnest(o.target_groups || coalesce(v_groups, '{}')) g), '{}'),
      field_provenance = o.field_provenance || jsonb_build_object('source', coalesce(p->'source', '{}'::jsonb)),
      enrichment_status = o.enrichment_status || jsonb_build_object(
        v_detail_key, coalesce(p->'detail', '{}'::jsonb)
                      || jsonb_build_object('city_link_note', v_city_note,
                                            'adopted_existing_org', true)),
      needs_attention = true,
      updated_at = now()
    where o.id = v_id;
  end if;

  return v_id;
end $$;

revoke all on function public.commit_health_service_org(jsonb) from public, anon, authenticated;
grant execute on function public.commit_health_service_org(jsonb) to service_role;

-- Prove the retry actually retries rather than merely compiling: two inserts of
-- the same name must produce two rows with different slugs. Rolled back by
-- raising out of a sub-block, so no synthetic clinic survives.
do $$
declare
  v_a uuid; v_b uuid; v_sa text; v_sb text;
begin
  begin
    v_a := public.commit_health_service_org(jsonb_build_object(
      'external_id', '__slugrace_a__', 'name', 'Slug Race Probe Clinic',
      'country_code', 'CH', 'source', jsonb_build_object('name', '__probe__')));
    v_b := public.commit_health_service_org(jsonb_build_object(
      'external_id', '__slugrace_b__', 'name', 'Slug Race Probe Clinic',
      'country_code', 'CH', 'source', jsonb_build_object('name', '__probe__')));

    select slug into v_sa from public.organizations where id = v_a;
    select slug into v_sb from public.organizations where id = v_b;

    if v_a = v_b then
      raise exception 'probe: two distinct external_ids collapsed onto one row';
    end if;
    if v_sa = v_sb then
      raise exception 'probe: two same-named branches got the same slug (%)', v_sa;
    end if;

    raise exception 'probe_ok';
  exception when others then
    if sqlerrm <> 'probe_ok' then raise; end if;
  end;
end $$;
