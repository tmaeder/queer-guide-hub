import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/untyped';
import type { UnifiedMediaItem, EntityLink, MediaDetailData } from '@/components/cms/MediaLibrary/types';

async function fetchMediaDetail(id: string): Promise<MediaDetailData> {
  const { data: item, error } = await untypedFrom('admin_media_unified')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;

  const unified = item as UnifiedMediaItem;
  let entityLinks: EntityLink[] = [];

  if (unified.source_type === 'image_asset') {
    const { data: links } = await untypedFrom('image_asset_links')
      .select('entity_type, entity_id, role, sort_order')
      .eq('asset_id', id);

    if (links) {
      entityLinks = await resolveEntityNames(links as EntityLink[]);
    }
  } else {
    const { data: contentLinks } = await untypedFrom('cms_content_media')
      .select('content_id, cms_content(title)')
      .eq('media_id', id);

    if (contentLinks) {
      entityLinks = (contentLinks as Array<{ content_id: string; cms_content: { title: string } | null }>).map(l => ({
        entity_type: 'cms_content',
        entity_id: l.content_id,
        role: 'content',
        sort_order: null,
        entity_name: l.cms_content?.title || 'Untitled',
      }));
    }

    const { data: attachLinks } = await untypedFrom('cms_media_attachments')
      .select('source_table, source_id, media_role, sort_order')
      .eq('media_id', id);

    if (attachLinks) {
      const mapped = (attachLinks as Array<{ source_table: string; source_id: string; media_role: string; sort_order: number | null }>).map(l => ({
        entity_type: l.source_table,
        entity_id: l.source_id,
        role: l.media_role,
        sort_order: l.sort_order,
      }));
      const resolved = await resolveEntityNames(mapped);
      entityLinks = [...entityLinks, ...resolved];
    }
  }

  return { ...unified, entity_links: entityLinks };
}

const ENTITY_TABLE_MAP: Record<string, { table: string; nameCol: string }> = {
  venue: { table: 'venues', nameCol: 'name' },
  event: { table: 'events', nameCol: 'title' },
  news_article: { table: 'news_articles', nameCol: 'title' },
  personality: { table: 'personalities', nameCol: 'name' },
  marketplace_listing: { table: 'marketplace_listings', nameCol: 'title' },
  city: { table: 'cities', nameCol: 'name' },
  country: { table: 'countries', nameCol: 'name' },
  queer_village: { table: 'queer_villages', nameCol: 'name' },
};

async function resolveEntityNames(links: EntityLink[]): Promise<EntityLink[]> {
  const grouped = new Map<string, EntityLink[]>();
  for (const link of links) {
    const key = link.entity_type;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(link);
  }

  const results: EntityLink[] = [];

  for (const [entityType, group] of grouped) {
    const config = ENTITY_TABLE_MAP[entityType];
    if (!config) {
      results.push(...group);
      continue;
    }

    const ids = group.map(l => l.entity_id);
    const { data } = await untypedFrom(config.table)
      .select(`id, ${config.nameCol}`)
      .in('id', ids);

    const nameMap = new Map<string, string>();
    if (data) {
      for (const row of data as Array<Record<string, unknown>>) {
        nameMap.set(row.id as string, row[config.nameCol] as string);
      }
    }

    for (const link of group) {
      results.push({
        ...link,
        entity_name: nameMap.get(link.entity_id) || link.entity_id.slice(0, 8),
      });
    }
  }

  return results;
}

export function useMediaDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['media-detail', id],
    queryFn: () => fetchMediaDetail(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}
