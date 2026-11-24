import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom, untypedRpc } from '@/integrations/supabase/untyped';
import { useAuth } from '@/hooks/useAuth';
import type { IntimateProfile, IntimateDiscoveryCard } from '@/lib/intimate/types';
import type { TablesInsert } from '@/integrations/supabase/types';

const SELECT =
  'id, opted_in_at, consent_18plus_at, genitalia, genital_pictogram_key, size_cm, erection_angle_deg, body_pictogram_key, body_type, height_cm, age_band, role, into_tags, safer_sex_prefs, discovery_city_id, discovery_active_until, moderation_status, last_active_at, dating_prefs';

export function useMyIntimateProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['intimate-profile', 'me', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<IntimateProfile | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('intimate_profiles')
        .select(SELECT)
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as IntimateProfile | null;
    },
  });
}

export function useIntimateProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['intimate-profile', userId],
    enabled: !!userId,
    queryFn: async (): Promise<IntimateProfile | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('intimate_profiles')
        .select(SELECT)
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as IntimateProfile | null;
    },
  });
}

export interface DiscoveryFilters {
  cityId?: string | null;
  roles?: string[];
  intoTags?: string[];
  ageBands?: string[];
  bodyTypes?: string[];
  kinkItemSlugs?: string[];
  /** Not in the discovery view; filtered here against intimate_profiles, which
   *  opted-in members can already read (the detail page shows it). */
  genitalia?: string[];
  /** Wanted hanky colours (variant id → pocket). Matched against members'
   *  'members_adult' signals; a 'both' on either side matches any pocket. */
  hanky?: Record<string, 'left' | 'right' | 'both'>;
}

/** Attaches each card's worn hanky colours, then keeps only cards wearing a
 *  wanted colour in a matching pocket ('both' on either side matches). */
async function withHanky(
  cards: IntimateDiscoveryCard[],
  wanted: DiscoveryFilters['hanky'],
): Promise<IntimateDiscoveryCard[]> {
  if (!cards.length) return cards;
  const { data, error } = await untypedFrom('user_hanky_signals')
    .select('user_id, variant_id, side')
    .in(
      'user_id',
      cards.map((c) => c.user_id),
    )
    .is('revoked_at', null);
  if (error) throw error;
  const byUser = new Map<string, Record<string, 'left' | 'right' | 'both'>>();
  for (const r of data ?? []) {
    const m = byUser.get(r.user_id as string) ?? {};
    m[r.variant_id as string] = r.side as 'left' | 'right' | 'both';
    byUser.set(r.user_id as string, m);
  }
  const withSignals = cards.map((c) => ({ ...c, hanky: byUser.get(c.user_id) }));
  const entries = Object.entries(wanted ?? {});
  if (!entries.length) return withSignals;
  const matches = (side: string, want: string) =>
    side === want || side === 'both' || want === 'both';
  return withSignals.filter((c) =>
    entries.some(([variant, want]) => c.hanky?.[variant] && matches(c.hanky[variant], want)),
  );
}

async function keepGenitalia(
  cards: IntimateDiscoveryCard[],
  genitalia: string[] | undefined,
): Promise<IntimateDiscoveryCard[]> {
  if (!genitalia?.length || !cards.length) return cards;
  const { data, error } = await supabase
    .from('intimate_profiles')
    .select('id, genitalia')
    .in(
      'id',
      cards.map((c) => c.user_id),
    );
  if (error) throw error;
  const keep = new Set(
    (data ?? []).filter((r) => r.genitalia && genitalia.includes(r.genitalia)).map((r) => r.id),
  );
  return cards.filter((c) => keep.has(c.user_id));
}

export function useIntimateDiscovery(filters: DiscoveryFilters) {
  return useQuery({
    queryKey: ['intimate-discovery', filters],
    queryFn: async (): Promise<IntimateDiscoveryCard[]> =>
      keepGenitalia(
        await withHanky(await fetchDiscovery(filters), filters.hanky),
        filters.genitalia,
      ),
  });
}

async function fetchDiscovery(filters: DiscoveryFilters): Promise<IntimateDiscoveryCard[]> {
  if (filters.kinkItemSlugs?.length) {
    const { data, error } = await untypedRpc<IntimateDiscoveryCard[]>('intimate_discover', {
      p_city_id: filters.cityId || null,
      p_roles: filters.roles?.length ? filters.roles : null,
      p_kink_item_slugs: filters.kinkItemSlugs,
      p_age_bands: filters.ageBands?.length ? filters.ageBands : null,
      p_body_types: filters.bodyTypes?.length ? filters.bodyTypes : null,
      p_limit: 200,
    });
    if (error) throw error;
    return data ?? [];
  }
  let q = supabase.from('intimate_discovery_v').select('*').limit(200);
  if (filters.cityId) q = q.eq('discovery_city_id', filters.cityId);
  if (filters.roles?.length) q = q.overlaps('role', filters.roles);
  if (filters.intoTags?.length) q = q.overlaps('into_tags', filters.intoTags);
  if (filters.ageBands?.length) q = q.in('age_band', filters.ageBands);
  if (filters.bodyTypes?.length) q = q.in('body_type', filters.bodyTypes);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as IntimateDiscoveryCard[];
}

export function useUpsertIntimateProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<IntimateProfile>) => {
      if (!user) throw new Error('not signed in');
      const { data, error } = await supabase
        .from('intimate_profiles')
        // dating_prefs is jsonb (`Json` in the generated types); our shape is a
        // narrower object, so widen it for the client.
        .upsert({ id: user.id, ...patch } as TablesInsert<'intimate_profiles'>, {
          onConflict: 'id',
        })
        .select(SELECT)
        .single();
      if (error) throw error;
      return data as IntimateProfile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimate-profile', 'me'] });
    },
  });
}

export function useOptOutIntimateProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (opts: { hardDelete?: boolean } = {}) => {
      if (!user) throw new Error('not signed in');
      if (opts.hardDelete) {
        const { error } = await supabase.from('intimate_profiles').delete().eq('id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('intimate_profiles')
          .update({ opted_in_at: null })
          .eq('id', user.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimate-profile'] });
    },
  });
}

export function useIntimateKinkTags() {
  return useQuery({
    queryKey: ['intimate-kink-tags'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unified_tags')
        .select('slug, name')
        .eq('category', 'intimate_kink')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return (data ?? []) as { slug: string; name: string }[];
    },
  });
}

export function useMyIntimateText() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['intimate-text', 'me', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('intimate_get_my_text');
      if (error) throw error;
      const row = (data ?? [])[0] as
        { about_intimate: string | null; looking_for: string | null } | undefined;
      return row ?? { about_intimate: null, looking_for: null };
    },
  });
}

export function useSetIntimateText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { aboutIntimate: string | null; lookingFor: string | null }) => {
      const { error } = await supabase.rpc('intimate_set_text', {
        p_about: args.aboutIntimate,
        p_looking: args.lookingFor,
      });
      if (error) throw error;

      // Fire-and-forget moderation scan. Failures shouldn't block the user.
      const combined = [args.aboutIntimate, args.lookingFor].filter(Boolean).join('\n');
      if (combined.trim()) {
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          supabase.functions
            .invoke('intimate-moderation', {
              body: {
                user_id: u.user.id,
                about_intimate: args.aboutIntimate ?? '',
                looking_for: args.lookingFor ?? '',
              },
            })
            .catch(() => undefined);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['intimate-text'] });
    },
  });
}

export function useReportIntimateProfile() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (args: { targetId: string; reason: string; details?: string }) => {
      if (!user) throw new Error('not signed in');
      const { error } = await supabase.from('intimate_reports').insert({
        reporter_id: user.id,
        target_id: args.targetId,
        reason: args.reason,
        details: args.details ?? null,
      });
      if (error) throw error;
    },
  });
}
