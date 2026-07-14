import { supabase } from '@/integrations/supabase/client';

/**
 * Upload an image to Cloudflare R2 (served from img.queer.guide) via the
 * JWT-gated `upload-image-r2` edge function. The product hosts NO images on
 * Supabase Storage — every frontend upload path goes through here.
 *
 * `prefix` is the R2 key namespace and must be one the edge function allows
 * (e.g. 'tag-images', 'personalities', 'flyer-scans', 'feedback-screenshots').
 * Returns the public token-free URL.
 */
export async function uploadImageToR2(file: Blob, prefix: string): Promise<string> {
  const dataUrl = await blobToDataUrl(file);
  const { data, error } = await supabase.functions.invoke('upload-image-r2', {
    body: { dataUrl, prefix },
  });
  if (error) throw error;
  const url = (data as { url?: string } | null)?.url;
  if (!url) throw new Error('upload-image-r2 returned no url');
  return url;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}
