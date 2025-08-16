/**
 * Image optimization utilities for working with responsive images
 */

export interface ImageMetadata {
  original: {
    width: number;
    height: number;
    format: string;
    size: number;
  };
  sizes: Array<{
    width: number;
    height: number;
    formats: string[];
  }>;
}

// Standard responsive breakpoints
export const BREAKPOINTS = [320, 640, 768, 1024, 1280, 1440, 1920] as const;

// Default sizes string for responsive images
export const DEFAULT_SIZES = "(max-width: 320px) 280px, (max-width: 640px) 600px, (max-width: 768px) 728px, (max-width: 1024px) 984px, (max-width: 1280px) 1240px, (max-width: 1440px) 1400px, 1880px";

/**
 * Generate srcset string for a given image and format
 */
export function generateSrcSet(imageName: string, format: 'avif' | 'webp' | 'jpg'): string {
  return BREAKPOINTS
    .map(width => `/images/optimized/${imageName}-${width}.${format} ${width}w`)
    .join(', ');
}

/**
 * Get the optimal image URL for a specific width and format
 */
export function getOptimizedImageUrl(
  imageName: string, 
  width: number = 1440, 
  format: 'avif' | 'webp' | 'jpg' = 'webp'
): string {
  // Find the closest available size
  const closestSize = BREAKPOINTS.find(size => size >= width) || BREAKPOINTS[BREAKPOINTS.length - 1];
  return `/images/optimized/${imageName}-${closestSize}.${format}`;
}

/**
 * Preload critical images for better LCP
 */
export function preloadCriticalImage(imageName: string, sizes: string = DEFAULT_SIZES): void {
  if (typeof document === 'undefined') return;

  // Preload AVIF for modern browsers
  const avifLink = document.createElement('link');
  avifLink.rel = 'preload';
  avifLink.as = 'image';
  avifLink.type = 'image/avif';
  avifLink.imageSrcset = generateSrcSet(imageName, 'avif');
  avifLink.imageSizes = sizes;
  document.head.appendChild(avifLink);

  // Preload WebP as fallback
  const webpLink = document.createElement('link');
  webpLink.rel = 'preload';
  webpLink.as = 'image';
  webpLink.type = 'image/webp';
  webpLink.imageSrcset = generateSrcSet(imageName, 'webp');
  webpLink.imageSizes = sizes;
  document.head.appendChild(webpLink);
}

/**
 * Check if a format is supported by the browser
 */
export async function supportsImageFormat(format: 'avif' | 'webp'): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const testImages = {
    avif: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAQAAAAEAAAAEGF1eEMAAAAASW1hdHIhAXEABAEKIcEtAAEAAT1kAAAQKAAhCAhgXYpK3gJUKfooKJMAAwABA===',
    webp: 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='
  };

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = testImages[format];
  });
}

/**
 * Get image metadata if available
 */
export async function getImageMetadata(imageName: string): Promise<ImageMetadata | null> {
  try {
    const response = await fetch(`/images/optimized/${imageName}.json`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Calculate optimal sizes string based on container constraints
 */
export function calculateSizes(options: {
  mobile?: number;      // Max width on mobile (default: 95vw)
  tablet?: number;      // Max width on tablet (default: 90vw)
  desktop?: number;     // Max width on desktop (default: 1200px)
  mobileBreakpoint?: number;   // Mobile breakpoint (default: 768px)
  tabletBreakpoint?: number;   // Tablet breakpoint (default: 1200px)
} = {}): string {
  const {
    mobile = 95,
    tablet = 90,
    desktop = 1200,
    mobileBreakpoint = 768,
    tabletBreakpoint = 1200
  } = options;

  return `(max-width: ${mobileBreakpoint}px) ${mobile}vw, (max-width: ${tabletBreakpoint}px) ${tablet}vw, ${desktop}px`;
}

/**
 * Image optimization configuration
 */
export const IMAGE_CONFIG = {
  formats: ['avif', 'webp', 'jpg'] as const,
  quality: {
    avif: 50,
    webp: 75,
    jpeg: 78
  },
  breakpoints: BREAKPOINTS,
  defaultSizes: DEFAULT_SIZES
} as const;

/**
 * Common image size presets
 */
export const SIZE_PRESETS = {
  hero: { width: 1920, height: 1080 },
  card: { width: 640, height: 360 },
  thumbnail: { width: 320, height: 180 },
  avatar: { width: 128, height: 128 },
  banner: { width: 1440, height: 400 },
  gallery: { width: 1024, height: 768 }
} as const;

export type SizePreset = keyof typeof SIZE_PRESETS;