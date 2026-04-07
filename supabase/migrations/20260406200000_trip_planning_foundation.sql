-- Trip Planning Foundation (Phase 1)
-- TREK-inspired collaborative trip planner with LGBTQ+ safety intelligence

-- Core trip container
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  start_date DATE,
  end_date DATE,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning','active','completed','archived')),
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Members with roles
CREATE TABLE public.trip_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor'
    CHECK (role IN ('owner','editor','viewer')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(trip_id, user_id)
);

-- Day containers
CREATE TABLE public.trip_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  title TEXT,
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE(trip_id, date)
);

-- Places / itinerary items — linked to existing queer.guide entities
CREATE TABLE public.trip_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
  day_id UUID REFERENCES public.trip_days(id) ON DELETE SET NULL,
  -- Link to existing entities (at most one)
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE SET NULL,
  -- Custom place (when not linking to an entity)
  custom_name TEXT,
  custom_address TEXT,
  -- Geo + location
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL,
  -- Scheduling
  start_time TIME,
  end_time TIME,
  duration_minutes INT,
  -- Metadata
  notes TEXT,
  category TEXT, -- dining, nightlife, sightseeing, transport, accommodation, activity
  sort_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Share tokens for read-only/selective access
CREATE TABLE public.trip_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  permissions JSONB NOT NULL DEFAULT '{"itinerary":true,"budget":false,"notes":false,"packing":false}',
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_trips_owner ON public.trips(owner_id);
CREATE INDEX idx_trip_members_user ON public.trip_members(user_id);
CREATE INDEX idx_trip_members_trip ON public.trip_members(trip_id);
CREATE INDEX idx_trip_days_trip_date ON public.trip_days(trip_id, date);
CREATE INDEX idx_trip_places_trip ON public.trip_places(trip_id);
CREATE INDEX idx_trip_places_day ON public.trip_places(day_id);
CREATE INDEX idx_trip_places_venue ON public.trip_places(venue_id) WHERE venue_id IS NOT NULL;
CREATE INDEX idx_trip_places_event ON public.trip_places(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_trip_places_hotel ON public.trip_places(hotel_id) WHERE hotel_id IS NOT NULL;
CREATE INDEX idx_trip_shares_token ON public.trip_shares(token);

-- ============================================================
-- Auto-add owner as trip_member on insert
-- ============================================================
CREATE OR REPLACE FUNCTION public.trip_auto_add_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.trip_members (trip_id, user_id, role, accepted_at)
  VALUES (NEW.id, NEW.owner_id, 'owner', now())
  ON CONFLICT (trip_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_trip_auto_add_owner
  AFTER INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trip_auto_add_owner();

-- ============================================================
-- Auto-generate trip_days when start/end dates are set
-- ============================================================
CREATE OR REPLACE FUNCTION public.trip_auto_generate_days()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL
     AND NEW.start_date <= NEW.end_date
     AND (OLD IS NULL OR OLD.start_date IS DISTINCT FROM NEW.start_date OR OLD.end_date IS DISTINCT FROM NEW.end_date)
  THEN
    -- Remove days outside the new range
    DELETE FROM public.trip_days
    WHERE trip_id = NEW.id
      AND date NOT BETWEEN NEW.start_date AND NEW.end_date;

    -- Insert missing days
    INSERT INTO public.trip_days (trip_id, date, sort_order)
    SELECT NEW.id, d::date, (ROW_NUMBER() OVER (ORDER BY d))::int - 1
    FROM generate_series(NEW.start_date, NEW.end_date, '1 day'::interval) AS d
    ON CONFLICT (trip_id, date) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_trip_auto_generate_days
  AFTER INSERT OR UPDATE OF start_date, end_date ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trip_auto_generate_days();

-- ============================================================
-- updated_at trigger for trips
-- ============================================================
CREATE OR REPLACE FUNCTION public.trip_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trip_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trip_update_timestamp();

-- ============================================================
-- Helper: check if a user is a member of a trip
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = p_trip_id AND user_id = p_user_id AND accepted_at IS NOT NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if a user can edit a trip
CREATE OR REPLACE FUNCTION public.can_edit_trip(p_trip_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = p_trip_id AND user_id = p_user_id
      AND role IN ('owner', 'editor') AND accepted_at IS NOT NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_shares ENABLE ROW LEVEL SECURITY;

-- trips: members can read, public trips readable by all
CREATE POLICY trips_select ON public.trips FOR SELECT USING (
  is_public = true
  OR public.is_trip_member(id, auth.uid())
);
CREATE POLICY trips_insert ON public.trips FOR INSERT WITH CHECK (
  auth.uid() = owner_id
);
CREATE POLICY trips_update ON public.trips FOR UPDATE USING (
  public.can_edit_trip(id, auth.uid())
);
CREATE POLICY trips_delete ON public.trips FOR DELETE USING (
  owner_id = auth.uid()
);

-- trip_members: members can see co-members, editors+ can manage
CREATE POLICY trip_members_select ON public.trip_members FOR SELECT USING (
  public.is_trip_member(trip_id, auth.uid())
);
CREATE POLICY trip_members_insert ON public.trip_members FOR INSERT WITH CHECK (
  public.can_edit_trip(trip_id, auth.uid())
);
CREATE POLICY trip_members_update ON public.trip_members FOR UPDATE USING (
  -- owners can change roles, users can accept their own invite
  EXISTS (
    SELECT 1 FROM public.trip_members m
    WHERE m.trip_id = trip_members.trip_id AND m.user_id = auth.uid() AND m.role = 'owner'
  )
  OR (user_id = auth.uid() AND accepted_at IS NULL)
);
CREATE POLICY trip_members_delete ON public.trip_members FOR DELETE USING (
  -- owner can remove members, users can leave
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.trip_members m
    WHERE m.trip_id = trip_members.trip_id AND m.user_id = auth.uid() AND m.role = 'owner'
  )
);

-- trip_days: members can read, editors can write
CREATE POLICY trip_days_select ON public.trip_days FOR SELECT USING (
  public.is_trip_member(trip_id, auth.uid())
  OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.is_public)
);
CREATE POLICY trip_days_insert ON public.trip_days FOR INSERT WITH CHECK (
  public.can_edit_trip(trip_id, auth.uid())
);
CREATE POLICY trip_days_update ON public.trip_days FOR UPDATE USING (
  public.can_edit_trip(trip_id, auth.uid())
);
CREATE POLICY trip_days_delete ON public.trip_days FOR DELETE USING (
  public.can_edit_trip(trip_id, auth.uid())
);

-- trip_places: members can read, editors can write
CREATE POLICY trip_places_select ON public.trip_places FOR SELECT USING (
  public.is_trip_member(trip_id, auth.uid())
  OR EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.is_public)
);
CREATE POLICY trip_places_insert ON public.trip_places FOR INSERT WITH CHECK (
  public.can_edit_trip(trip_id, auth.uid())
);
CREATE POLICY trip_places_update ON public.trip_places FOR UPDATE USING (
  public.can_edit_trip(trip_id, auth.uid())
);
CREATE POLICY trip_places_delete ON public.trip_places FOR DELETE USING (
  public.can_edit_trip(trip_id, auth.uid())
);

-- trip_shares: only trip editors can manage shares
CREATE POLICY trip_shares_select ON public.trip_shares FOR SELECT USING (
  public.can_edit_trip(trip_id, auth.uid())
);
CREATE POLICY trip_shares_insert ON public.trip_shares FOR INSERT WITH CHECK (
  public.can_edit_trip(trip_id, auth.uid())
);
CREATE POLICY trip_shares_delete ON public.trip_shares FOR DELETE USING (
  public.can_edit_trip(trip_id, auth.uid())
);

-- ============================================================
-- Shared trip access via token (DB function bypasses RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_shared_trip(p_token TEXT)
RETURNS TABLE (
  trip_id UUID,
  title TEXT,
  description TEXT,
  start_date DATE,
  end_date DATE,
  currency TEXT,
  permissions JSONB
) AS $$
  SELECT
    t.id AS trip_id, t.title, t.description,
    t.start_date, t.end_date, t.currency,
    s.permissions
  FROM public.trip_shares s
  JOIN public.trips t ON t.id = s.trip_id
  WHERE s.token = p_token
    AND (s.expires_at IS NULL OR s.expires_at > now());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Enable Realtime for collaborative tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_days;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_places;
