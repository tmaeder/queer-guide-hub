import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import type { AvatarConfig } from '@/components/profile/avatarConfig';

// One attempt per user per page load, however many components mount this.
const attempted = new Set<string>();

async function svgToWebp(svg: string, size: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d')!.drawImage(img, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.9));
    if (!blob) throw new Error('canvas.toBlob returned null');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A built avatar lives only in `avatar_config` (set at signup by
 * handle_new_user, or by the builder), but nearly every surface renders
 * `avatar_url` alone. When the signed-in user has a config and no URL, render
 * the config to an image once and store it, so their avatar shows everywhere.
 */
export function useEnsureAvatarImage() {
  const { profile, updateProfile } = useProfile();
  const userId = profile?.user_id;
  const config = profile?.avatar_config as AvatarConfig | null | undefined;
  const needsImage = !!userId && !!config && !profile?.avatar_url;

  useEffect(() => {
    if (!needsImage || !userId || attempted.has(userId)) return;
    attempted.add(userId);
    void (async () => {
      try {
        const { avatarConfigToSvg } = await import('@/lib/avatarImage');
        const blob = await svgToWebp(avatarConfigToSvg(config!), 256);
        // First folder = owner id, as the bucket's INSERT policy requires.
        const path = `${userId}/built-${Date.now()}.webp`;
        const { error } = await supabase.storage
          .from('avatars')
          .upload(path, blob, { contentType: 'image/webp', upsert: true });
        if (error) throw error;
        const { data } = supabase.storage.from('avatars').getPublicUrl(path);
        await updateProfile({ avatar_url: data.publicUrl });
      } catch (err) {
        // Non-fatal: the letter fallback stays until the next page load.
        console.warn('[avatar] could not store built avatar image', err);
      }
    })();
  }, [needsImage, userId, config, updateProfile]);
}
