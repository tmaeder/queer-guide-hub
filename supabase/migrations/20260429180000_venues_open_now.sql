-- venues "open now" support
--
-- Adds two RPCs that interpret venues.hours (existing freeform JSONB):
--   is_venue_open_at(venue_id, at_time)  -> true | false | null
--   venues_open_now()                    -> rows for venues open right now
--
-- The hours column is freeform today, so the RPC handles the most common
-- shape — a Schema.org OpeningHoursSpecification-like array of
-- { dayOfWeek, opens, closes } entries — and returns NULL when the data
-- doesn't match (caller treats as "unknown", not "closed").
--
-- Timezone: derived from the venue's city (cities.timezone). Falls back to
-- UTC when missing.
--
-- Pure SELECT, no schema changes. Future PRs can normalise hours into a
-- strict shape via a trigger and replace the parser; the RPC contract
-- (true / false / null) stays stable.

create or replace function public.is_venue_open_at(
  p_venue_id uuid,
  p_at       timestamptz default now()
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hours       jsonb;
  v_tz          text;
  v_local_ts    timestamptz;
  v_local_dow   int;
  v_local_time  time;
  v_dow_label   text[];
  v_entry       jsonb;
  v_day_field   text;
  v_open_t      time;
  v_close_t     time;
  v_matched     boolean := false;
  v_open        boolean := false;
begin
  -- Pull hours + timezone-via-city
  select v.hours, c.timezone
    into v_hours, v_tz
    from public.venues v
    left join public.cities c on c.id = v.city_id
   where v.id = p_venue_id;
  if not found then return null; end if;

  -- "alwaysOpen" sentinel
  if jsonb_typeof(v_hours) = 'object' and (v_hours ? 'alwaysOpen')
     and (v_hours->>'alwaysOpen')::boolean then
    return true;
  end if;
  if jsonb_typeof(v_hours) = 'string' and lower(v_hours::text) in ('"24/7"','"always"') then
    return true;
  end if;

  if v_tz is null or v_tz = '' then v_tz := 'UTC'; end if;

  -- Compute the venue's local time and ISO day-of-week (1=Mon..7=Sun)
  v_local_ts   := p_at at time zone v_tz;
  v_local_dow  := extract(isodow from v_local_ts)::int;
  v_local_time := v_local_ts::time;

  -- Each slot in our internal label set covers one ISO weekday.
  v_dow_label := array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  v_day_field := v_dow_label[v_local_dow];

  -- Shape A: OpeningHoursSpecification-ish array
  --   [{ "dayOfWeek": "Monday" | ["Monday","Tuesday"], "opens": "09:00", "closes": "23:00" }, ...]
  if jsonb_typeof(v_hours) = 'array' then
    for v_entry in select * from jsonb_array_elements(v_hours)
    loop
      if jsonb_typeof(v_entry->'dayOfWeek') = 'array' then
        if not exists (
          select 1 from jsonb_array_elements_text(v_entry->'dayOfWeek') d
          where lower(d) = v_day_field
        ) then continue; end if;
      elsif (v_entry->>'dayOfWeek') is null
            or lower(v_entry->>'dayOfWeek') <> v_day_field then
        continue;
      end if;
      v_matched := true;
      begin
        v_open_t  := (v_entry->>'opens')::time;
        v_close_t := (v_entry->>'closes')::time;
      exception when others then continue;
      end;
      if v_close_t > v_open_t then
        if v_local_time >= v_open_t and v_local_time < v_close_t then
          v_open := true; exit;
        end if;
      else
        -- crosses midnight (open 22:00, closes 02:00): open if past open OR before close
        if v_local_time >= v_open_t or v_local_time < v_close_t then
          v_open := true; exit;
        end if;
      end if;
    end loop;
  -- Shape B: per-day map
  --   { "monday": [{"open":"09:00","close":"22:00"}, ...], "tuesday": [...] }
  elsif jsonb_typeof(v_hours) = 'object' and (v_hours ? v_day_field) then
    if jsonb_typeof(v_hours->v_day_field) = 'array' then
      for v_entry in select * from jsonb_array_elements(v_hours->v_day_field)
      loop
        v_matched := true;
        begin
          v_open_t  := (v_entry->>'open')::time;
          v_close_t := (v_entry->>'close')::time;
        exception when others then continue;
        end;
        if v_close_t > v_open_t then
          if v_local_time >= v_open_t and v_local_time < v_close_t then
            v_open := true; exit;
          end if;
        else
          if v_local_time >= v_open_t or v_local_time < v_close_t then
            v_open := true; exit;
          end if;
        end if;
      end loop;
    end if;
  end if;

  -- No matching slots seen: hours data didn't cover this day in a recognisable
  -- shape. Returning NULL signals "unknown" so the UI can show "hours
  -- unavailable" rather than implying "closed".
  if not v_matched then return null; end if;
  return v_open;
end $$;

-- ── venues_open_now ─────────────────────────────────────────────────────────
-- Convenience: returns ids of venues whose is_venue_open_at(now()) = true.
-- Useful for "show me places open right now in city X" lists.
create or replace function public.venues_open_now(
  p_city_id uuid default null,
  p_limit   int default 200
) returns table (venue_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select v.id
    from public.venues v
   where (p_city_id is null or v.city_id = p_city_id)
     and v.hours is not null
     and public.is_venue_open_at(v.id, now()) = true
   limit greatest(p_limit, 1);
$$;

revoke all on function public.is_venue_open_at(uuid, timestamptz) from public;
revoke all on function public.venues_open_now(uuid, int) from public;
grant execute on function public.is_venue_open_at(uuid, timestamptz)
  to anon, authenticated, service_role;
grant execute on function public.venues_open_now(uuid, int)
  to anon, authenticated, service_role;

comment on function public.is_venue_open_at(uuid, timestamptz) is
  'Returns true / false / null for whether a venue is open at the given instant. Uses cities.timezone, falls back to UTC. NULL when hours data doesn''t match a recognised shape.';
comment on function public.venues_open_now(uuid, int) is
  'IDs of venues whose is_venue_open_at(now()) is true. Optional city filter.';
