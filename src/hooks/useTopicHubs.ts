import { useQuery } from '@tanstack/react-query';
import {
  type LucideIcon,
  Heart,
  Stethoscope,
  Plane,
  Scale,
  Brain,
  Users,
  Megaphone,
  HeartHandshake,
} from 'lucide-react';
import { untypedFrom } from '@/integrations/supabase/untyped';

export interface TopicHubRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  icon_name: string;
  tag_cluster: string[];
  cms_parent_slug: string;
  adult: boolean;
  sort_order: number;
}

const TOPIC_ICON_MAP: Record<string, LucideIcon> = {
  Heart,
  Stethoscope,
  Plane,
  Scale,
  Brain,
  Users,
  Megaphone,
  HeartHandshake,
};

export function topicIcon(name: string): LucideIcon {
  return TOPIC_ICON_MAP[name] ?? Heart;
}

export function useTopicHubs() {
  return useQuery({
    queryKey: ['topic-hubs'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TopicHubRow[]> => {
      const { data, error } = await untypedFrom('topic_hubs')
        .select('id, slug, title, description, icon_name, tag_cluster, cms_parent_slug, adult, sort_order')
        .eq('is_published', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as TopicHubRow[];
    },
  });
}
