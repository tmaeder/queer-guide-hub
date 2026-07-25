import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ── Shared row shapes ──────────────────────────────────────────────────────────

export interface GeoNode {
  id: string;
  place_type: string;
  name: string;
  slug: string | null;
  safety_gated: boolean;
  duplicate_of_id: string | null;
  child_count: number;
  venue_count: number;
  event_count: number;
  hotel_count: number;
}

export interface GeoBreadcrumbEntry {
  type: string;
  id: string;
  name: string;
  slug: string | null;
}

export interface LandmarkListItem {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  image_url: string | null;
  geo_landmark_profiles: { landmark_kind: string } | null;
}

export interface PlaceDetailRow {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  image_url: string | null;
  latitude: number | null;
  longitude: number | null;
  safety_gated: boolean;
  geo_landmark_profiles: {
    landmark_kind: string;
    address: string | null;
    website: string | null;
    accessibility_notes: string | null;
    tags: string[] | null;
  } | null;
}

export interface GeoIntegrityViolation {
  violation: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  expected_id: string;
  actual_id: string;
}

export interface LandmarkFormValues {
  name: string;
  landmark_kind: string;
  description: string;
  address: string;
  website: string;
  accessibility_notes: string;
}

// ── Public hooks ───────────────────────────────────────────────────────────────

/** Approved (non-review) landmarks in a city, for the public rail. */
export function useCityLandmarks(cityId: string | undefined) {
  return useQuery({
    queryKey: ['city-landmarks', cityId],
    enabled: !!cityId,
    queryFn: async (): Promise<LandmarkListItem[]> => {
      const { data, error } = await supabase
        .from('geo_places')
        .select('id, name, slug, description, image_url, geo_landmark_profiles!inner(landmark_kind)')
        .eq('place_type', 'landmark')
        .eq('city_id', cityId!)
        .eq('geo_landmark_profiles.needs_review', false)
        .is('duplicate_of_id', null)
        .order('name');
      if (error) throw error;
      return (data ?? []) as unknown as LandmarkListItem[];
    },
  });
}

/** One landmark by public slug (RLS hides safety-gated rows from anon). */
export function usePlaceDetail(slug: string | undefined) {
  return useQuery({
    queryKey: ['place-detail', slug],
    enabled: !!slug,
    queryFn: async (): Promise<PlaceDetailRow | null> => {
      const { data, error } = await supabase
        .from('geo_places')
        .select(
          'id, name, slug, description, image_url, latitude, longitude, safety_gated, geo_landmark_profiles!inner(landmark_kind, address, website, accessibility_notes, tags)',
        )
        .eq('place_type', 'landmark')
        .eq('slug', slug!)
        .is('duplicate_of_id', null)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PlaceDetailRow | null;
    },
  });
}

/** Ancestor chain (root first) for any geo node. */
export function useGeoBreadcrumbs(placeId: string | undefined) {
  return useQuery({
    queryKey: ['geo-breadcrumbs', placeId],
    enabled: !!placeId,
    queryFn: async (): Promise<GeoBreadcrumbEntry[]> => {
      const { data, error } = await supabase.rpc('get_geo_breadcrumbs', { p_id: placeId! });
      if (error) throw error;
      return (data ?? []) as unknown as GeoBreadcrumbEntry[];
    },
  });
}

// ── Admin hooks (/admin/geography) ────────────────────────────────────────────

/** Children of a tree node (roots when null) with geo/entity counts. */
export function useGeoChildren(parentId: string | null) {
  return useQuery({
    queryKey: ['geo-children', parentId],
    queryFn: async (): Promise<GeoNode[]> => {
      const { data, error } = await supabase.rpc('get_geo_children', {
        p_parent_id: parentId ?? undefined,
      });
      if (error) throw error;
      return (data ?? []) as GeoNode[];
    },
  });
}

/** Candidate parents for a move, restricted to the legal parent types. */
export function useGeoMoveCandidates(legalTypes: string[], search: string, enabled: boolean) {
  return useQuery({
    queryKey: ['geo-move-candidates', legalTypes.join(','), search],
    enabled: enabled && search.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geo_places')
        .select('id, name, slug, place_type')
        .in('place_type', legalTypes)
        .ilike('name', `%${search}%`)
        .is('duplicate_of_id', null)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface GeoMoveResult {
  moved: string;
  type: string;
  new_parent: string;
  repaired?: Record<string, number>;
}

export function useGeoMoveNode(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newParentId: string): Promise<GeoMoveResult> => {
      const { data, error } = await supabase.rpc('geo_move_node', {
        p_id: nodeId,
        p_new_parent_id: newParentId,
      });
      if (error) throw error;
      return data as unknown as GeoMoveResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geo-children'] });
    },
  });
}

/** Full landmark profile row (admin edit dialog). */
export function useLandmarkProfile(placeId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['landmark-profile', placeId],
    enabled: enabled && !!placeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geo_landmark_profiles')
        .select('*')
        .eq('place_id', placeId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/** Spine name/description for a landmark (admin edit dialog). */
export function useLandmarkSpine(placeId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['landmark-spine', placeId],
    enabled: enabled && !!placeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geo_places')
        .select('id, name, description')
        .eq('id', placeId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

function slugifyName(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Create (under a parent) or update (existing id) a landmark. */
export function useSaveLandmark(options: {
  landmarkId: string | null;
  parent: { id: string; name: string } | null;
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: LandmarkFormValues) => {
      if (!form.name.trim()) throw new Error('Name is required');
      if (options.landmarkId) {
        const { error: e1 } = await supabase
          .from('geo_places')
          .update({ name: form.name.trim(), description: form.description || null })
          .eq('id', options.landmarkId);
        if (e1) throw e1;
        const { error: e2 } = await supabase
          .from('geo_landmark_profiles')
          .update({
            landmark_kind: form.landmark_kind,
            address: form.address || null,
            website: form.website || null,
            accessibility_notes: form.accessibility_notes || null,
          })
          .eq('place_id', options.landmarkId);
        if (e2) throw e2;
        return options.landmarkId;
      }
      const slug = `${slugifyName(form.name)}-${slugifyName(options.parent!.name)}`;
      const { data: spine, error: e1 } = await supabase
        .from('geo_places')
        .insert({
          place_type: 'landmark',
          parent_id: options.parent!.id,
          name: form.name.trim(),
          slug,
          description: form.description || null,
        })
        .select('id')
        .single();
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('geo_landmark_profiles').insert({
        place_id: spine.id,
        landmark_kind: form.landmark_kind,
        address: form.address || null,
        website: form.website || null,
        accessibility_notes: form.accessibility_notes || null,
        needs_review: false,
      });
      if (e2) throw e2;
      return spine.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geo-children'] });
      queryClient.invalidateQueries({ queryKey: ['landmark-profile'] });
      queryClient.invalidateQueries({ queryKey: ['landmark-spine'] });
    },
  });
}

/** Review state of a landmark + approve action (needs_review → false). */
export function useLandmarkReview(placeId: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const state = useQuery({
    queryKey: ['landmark-review-state', placeId],
    enabled: enabled && !!placeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('geo_landmark_profiles')
        .select('needs_review, landmark_kind')
        .eq('place_id', placeId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const approve = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('geo_landmark_profiles')
        .update({ needs_review: false })
        .eq('place_id', placeId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['landmark-review-state', placeId] });
    },
  });
  return { state, approve };
}

export function useDeleteLandmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (placeId: string) => {
      const { error } = await supabase.from('geo_places').delete().eq('id', placeId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['geo-children'] });
    },
  });
}

export function useGeoIntegrityViolations() {
  return useQuery({
    queryKey: ['geo-integrity'],
    queryFn: async (): Promise<GeoIntegrityViolation[]> => {
      const { data, error } = await supabase
        .from('geo_integrity_violations')
        .select('*')
        .limit(200);
      if (error) throw error;
      return (data ?? []) as GeoIntegrityViolation[];
    },
  });
}
