import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { MAX_SOURCE_BYTES } from '@/lib/imageCrop';

/** Longest edge of the uploaded image; keeps chat photos light. */
const MAX_EDGE = 1600;

export interface ChatImage {
  /** Storage path in the private user-photos bucket; what the message stores. */
  path: string;
  /** Short-lived signed URL, for the composer preview only. */
  url: string;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

/**
 * Downscale to a max longest-edge webp blob. The original never leaves the
 * device — mirrors the avatar crop pipeline (src/lib/imageCrop.ts), just
 * aspect-preserving instead of a square crop.
 */
async function downscaleToWebp(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not encode image'))),
        'image/webp',
        0.85,
      );
    });
    return { blob, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Uploads a chat photo to the private `user-photos` bucket under
 * {uid}/chat-media/{conversationId}/{uuid}.webp. The first folder must be the
 * uploader (INSERT policy); conversation participants may read it (SELECT
 * policy), through signed URLs. Returns the path + intrinsic dimensions so the
 * bubble can reserve space and avoid layout shift.
 */
export function useChatImageUpload(conversationId: string) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (file: File): Promise<ChatImage | null> => {
      if (!user) return null;
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Unsupported file', description: 'Pick an image.', variant: 'destructive' });
        return null;
      }
      if (file.size > MAX_SOURCE_BYTES) {
        toast({ title: 'Image too large', description: 'Max 15 MB.', variant: 'destructive' });
        return null;
      }

      setUploading(true);
      try {
        const { blob, width, height } = await downscaleToWebp(file);
        const filePath = `${user.id}/chat-media/${conversationId}/${crypto.randomUUID()}.webp`;
        const { error: uploadError } = await supabase.storage
          .from('user-photos')
          .upload(filePath, blob, { contentType: 'image/webp' });
        if (uploadError) throw uploadError;

        const { data: signed, error: signError } = await supabase.storage
          .from('user-photos')
          .createSignedUrl(filePath, 60 * 60);
        if (signError) throw signError;

        return { path: filePath, url: signed.signedUrl, width, height };
      } catch (error) {
        console.error('Chat image upload failed:', error);
        toast({
          title: 'Upload failed',
          description: 'Could not send the image. Try again.',
          variant: 'destructive',
        });
        return null;
      } finally {
        setUploading(false);
      }
    },
    [conversationId, toast, user],
  );

  return { upload, uploading };
}
