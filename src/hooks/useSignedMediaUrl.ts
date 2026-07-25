import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isPrivateMedia } from '@/lib/mediaAccess';
import type { UnifiedMediaItem } from '@/components/cms/MediaLibrary/types';

/**
 * Resolves a viewable URL for a media item. Public assets return their stored URL directly;
 * private (dam-private) cms_media rows are signed on demand (staff-gated by storage RLS).
 * Signed URLs are cached ~50 min (they last 1 h) and only fetched when the item is private.
 */
export function useSignedMediaUrl(item: UnifiedMediaItem | null | undefined) {
  const priv = !!item && isPrivateMedia(item);

  const query = useQuery({
    queryKey: ['signed-media-url', item?.id, item?.storage_path],
    enabled: priv,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(item!.bucket_name || 'dam-private')
        .createSignedUrl(item!.storage_path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  if (!item) return { url: null, isLoading: false };
  if (!priv) return { url: item.url, isLoading: false };
  return { url: query.data ?? null, isLoading: query.isLoading };
}
