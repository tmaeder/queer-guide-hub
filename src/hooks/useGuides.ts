import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedFrom, untypedSupabase } from '@/integrations/supabase/untyped';
import {
  fetchPickEntities,
  type GuideEntityType,
  type PickEntityDisplay,
} from '@/lib/guidePickAdapters';

/**
 * Unified Guides data layer — one content family with format
 * 'guide' (tiered picks) | 'list' (curated entity rail) | 'quest'
 * (time-bounded community challenge). Replaces useVenueGuide /
 * useEventGuide / useMarketplaceGuide / useQuests.
 */

export type GuideFormat = 'guide' | 'list' | 'quest';
export type PickTier = 'top' | 'also_great' | 'upgrade' | 'budget' | 'avoid';

export interface QuestCriteria {
  entity_type?: string;
  target_count?: number;
  tags?: string[];
  region?: string;
  notes?: string;
}

export interface Guide {
  id: string;
  format: GuideFormat;
  slug: string;
  title: string;
  dek: string | null;
  intro_md: string | null;
  hero_image_path: string | null;
  category: string | null;
  primary_entity_type: GuideEntityType | null;
  city_id: string | null;
  audience_tags: string[];
  status: 'draft' | 'review' | 'published' | 'archived';
  starts_at: string | null;
  ends_at: string | null;
  criteria: QuestCriteria;
  recap_article_id: string | null;
  published_at: string | null;
  reading_time_min: number | null;
  pick_count: number;
  review_due_at: string | null;
  is_featured: boolean;
  safety_gated: boolean;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GuidePick {
  id: string;
  guide_id: string;
  entity_type: GuideEntityType;
  entity_id: string;
  tier: PickTier | null;
  rationale_md: string | null;
  pros: string[];
  cons: string[];
  position: number;
  is_orphaned: boolean;
}

export type HydratedPick = GuidePick & { entity: PickEntityDisplay | null };

export interface GuideSection {
  id: string;
  guide_id: string;
  position: number;
  kind: 'prose' | 'callout' | 'comparison';
  body_md: string | null;
}

export interface GuideDetail {
  guide: Guide;
  picks: HydratedPick[];
  sections: GuideSection[];
  /** True when the requested slug resolved through guide_slug_redirects. */
  redirectedFrom: string | null;
}

export type QuestPhase = 'scheduled' | 'active' | 'completed';

/** Quest lifecycle is derived from the publish window, not a status machine. */
export function questPhase(guide: Pick<Guide, 'format' | 'status' | 'starts_at' | 'ends_at'>): QuestPhase | null {
  if (guide.format !== 'quest' || guide.status !== 'published') return null;
  if (!guide.starts_at || !guide.ends_at) return null;
  const now = Date.now();
  if (now < new Date(guide.starts_at).getTime()) return 'scheduled';
  if (now > new Date(guide.ends_at).getTime()) return 'completed';
  return 'active';
}

const TIER_ORDER: Record<PickTier, number> = {
  top: 0,
  also_great: 1,
  upgrade: 2,
  budget: 3,
  avoid: 4,
};

export function sortPicks<T extends Pick<GuidePick, 'tier' | 'position'>>(picks: T[]): T[] {
  return picks
    .slice()
    .sort(
      (a, b) =>
        (a.tier ? TIER_ORDER[a.tier] : -1) - (b.tier ? TIER_ORDER[b.tier] : -1) ||
        a.position - b.position,
    );
}

export interface GuidesFilter {
  format?: GuideFormat;
  entityType?: GuideEntityType;
  cityId?: string;
  category?: string;
  featuredFirst?: boolean;
  limit?: number;
}

export function useGuides(filter: GuidesFilter = {}) {
  return useQuery({
    queryKey: ['guides', filter],
    queryFn: async (): Promise<Guide[]> => {
      let q = untypedFrom('guides').select('*').eq('status', 'published');
      if (filter.format) q = q.eq('format', filter.format);
      if (filter.entityType) q = q.eq('primary_entity_type', filter.entityType);
      if (filter.cityId) q = q.eq('city_id', filter.cityId);
      if (filter.category) q = q.eq('category', filter.category);
      if (filter.featuredFirst !== false) q = q.order('is_featured', { ascending: false });
      q = q.order('published_at', { ascending: false, nullsFirst: false });
      if (filter.limit) q = q.limit(filter.limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Guide[];
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useGuide(slug: string | undefined) {
  return useQuery({
    queryKey: ['guide', slug],
    enabled: !!slug,
    queryFn: async (): Promise<GuideDetail | null> => {
      if (!slug) return null;

      let redirectedFrom: string | null = null;

      const direct = await untypedFrom('guides')
        .select('*')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();
      if (direct.error) throw direct.error;
      let guide = (direct.data ?? null) as Guide | null;

      if (!guide) {
        const { data: resolved, error: rerr } = await untypedSupabase.rpc('resolve_guide_slug', {
          p_slug: slug,
        });
        if (rerr) throw rerr;
        const row = Array.isArray(resolved) ? resolved[0] : resolved;
        if (row?.guide_id && row.redirected) {
          const byId = await untypedFrom('guides')
            .select('*')
            .eq('id', row.guide_id)
            .eq('status', 'published')
            .maybeSingle();
          if (byId.error) throw byId.error;
          guide = (byId.data ?? null) as Guide | null;
          if (guide) redirectedFrom = slug;
        }
      }
      if (!guide) return null;

      const [picksRes, sectionsRes] = await Promise.all([
        untypedFrom('guide_picks')
          .select('*')
          .eq('guide_id', guide.id)
          .eq('is_orphaned', false),
        untypedFrom('guide_sections')
          .select('*')
          .eq('guide_id', guide.id)
          .order('position', { ascending: true }),
      ]);
      if (picksRes.error) throw picksRes.error;
      if (sectionsRes.error) throw sectionsRes.error;

      const rawPicks = sortPicks((picksRes.data ?? []) as unknown as GuidePick[]);
      const entities = await fetchPickEntities(rawPicks);
      const picks: HydratedPick[] = rawPicks.map((p) => ({
        ...p,
        entity: entities.get(`${p.entity_type}:${p.entity_id}`) ?? null,
      }));

      return {
        guide,
        picks,
        sections: (sectionsRes.data ?? []) as unknown as GuideSection[],
        redirectedFrom,
      };
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useActiveQuestGuide() {
  return useQuery({
    queryKey: ['guides', 'active-quest'],
    queryFn: async (): Promise<Guide | null> => {
      const { data, error } = await untypedSupabase.rpc('active_quest_guide');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as Guide | null;
    },
    staleTime: 60_000,
  });
}

/** Reverse lookup: published guides featuring a given entity. */
export function useGuideAppearances(
  entityType: GuideEntityType,
  entityId: string | undefined,
) {
  return useQuery({
    queryKey: ['guide-appearances', entityType, entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<Guide[]> => {
      const { data, error } = await untypedFrom('guide_picks')
        .select('guide:guides!inner(*)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .eq('is_orphaned', false)
        .eq('guide.status', 'published');
      if (error) throw error;
      const rows = (data ?? []) as unknown as { guide: Guide }[];
      const seen = new Set<string>();
      return rows
        .map((r) => r.guide)
        .filter((g) => g && !seen.has(g.id) && seen.add(g.id));
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// ── Quest participation ─────────────────────────────────────────────────────

export interface QuestProgress {
  accepted_count: number;
  pending_count: number;
  contributor_count: number;
  target_count: number;
}

export interface QuestContributor {
  user_id: string;
  display_name: string;
  accepted_count: number;
}

export function useQuestProgress(guideId: string | undefined) {
  return useQuery({
    queryKey: ['quest-progress', guideId],
    enabled: !!guideId,
    queryFn: async () => {
      const { data, error } = await untypedSupabase.rpc('quest_progress', {
        p_quest_id: guideId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (
        row ?? { accepted_count: 0, pending_count: 0, contributor_count: 0, target_count: 0 }
      ) as QuestProgress;
    },
  });
}

export function useQuestContributors(guideId: string | undefined) {
  return useQuery({
    queryKey: ['quest-contributors', guideId],
    enabled: !!guideId,
    queryFn: async () => {
      const { data, error } = await untypedSupabase.rpc('quest_public_contributors', {
        p_quest_id: guideId,
      });
      if (error) throw error;
      return (data ?? []) as unknown as QuestContributor[];
    },
  });
}

export function useMyQuestParticipation(guideId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ['quest-participation', guideId, userId],
    enabled: !!guideId && !!userId,
    queryFn: async () => {
      const { data, error } = await untypedFrom('guide_participations')
        .select('*')
        .eq('guide_id', guideId!)
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; opted_in_public: boolean; display_name: string | null } | null;
    },
  });
}

export function useJoinQuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      guide_id: string;
      user_id: string;
      opted_in_public: boolean;
      display_name?: string;
    }) => {
      const { data, error } = await untypedFrom('guide_participations')
        .upsert(args, { onConflict: 'user_id,guide_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['quest-participation', vars.guide_id] });
      qc.invalidateQueries({ queryKey: ['quest-contributors', vars.guide_id] });
    },
  });
}
