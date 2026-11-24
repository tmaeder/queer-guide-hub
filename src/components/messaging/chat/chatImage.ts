import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Message } from '@/hooks/useMessaging';

export interface ChatImageAttachment {
  /** Path in the private user-photos bucket (current messages). */
  path?: string;
  /** Direct URL (older shape). */
  url?: string;
  width?: number;
  height?: number;
}

/** Extract the first image attachment from a message, if any. */
export function imageAttachment(message: Message): ChatImageAttachment | null {
  const first = message.attachments?.[0];
  if (!first || typeof first !== 'object') return null;
  const a = first as { url?: unknown; path?: unknown; width?: unknown; height?: unknown };
  const path = typeof a.path === 'string' ? a.path : undefined;
  const url = typeof a.url === 'string' ? a.url : undefined;
  if (!path && !url) return null;
  return {
    path,
    url,
    width: typeof a.width === 'number' ? a.width : undefined,
    height: typeof a.height === 'number' ? a.height : undefined,
  };
}

/**
 * Viewable URL for a chat image. Private images are signed on demand (storage
 * RLS lets conversation participants read them); signed URLs last 1 h and are
 * cached for 50 min.
 */
export function useChatImageSrc(image: ChatImageAttachment): string | undefined {
  const { data } = useQuery({
    queryKey: ['chat-image-url', image.path],
    enabled: !!image.path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('user-photos')
        .createSignedUrl(image.path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  return image.path ? data : image.url;
}
