/**
 * Client-side crop + resize for avatar uploads. The original file never
 * leaves the device — only the 512px webp square is uploaded.
 */

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const AVATAR_SIZE = 512;
/** Pre-resize cap — reject absurd originals before decoding. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

/**
 * Crops `src` (an object URL) to `crop` (pixel coords from react-easy-crop)
 * and resizes to a 512×512 webp blob.
 */
export async function cropToAvatarBlob(src: string, crop: PixelCrop): Promise<Blob> {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      'image/webp',
      0.85,
    );
  });
}
