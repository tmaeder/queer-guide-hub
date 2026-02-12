import React from 'react';

export interface ResponsiveImageProps {
  src: string; // Base filename without extension (e.g., "hero")
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'sync' | 'auto';
  priority?: boolean; // If true, will not use lazy loading (for LCP images)
  sizes?: string; // Custom sizes attribute
  fallbackFormat?: 'jpg' | 'png';
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  style?: React.CSSProperties;
}

const defaultSizes = "(max-width: 320px) 280px, (max-width: 640px) 600px, (max-width: 768px) 728px, (max-width: 1024px) 984px, (max-width: 1280px) 1240px, (max-width: 1440px) 1400px, 1880px";

const breakpoints = [320, 640, 768, 1024, 1280, 1440, 1920];

export function ResponsiveImage({
  src,
  alt,
  width = 1440,
  height = 960,
  loading = 'lazy',
  decoding = 'async',
  priority = false,
  sizes = defaultSizes,
  fallbackFormat = 'jpg',
  objectFit = 'cover',
  style,
}: ResponsiveImageProps) {
  // Override loading for priority images (LCP)
  const actualLoading = priority ? 'eager' : loading;

  // Generate srcset for each format
  const generateSrcSet = (format: string) => {
    return breakpoints
      .map(size => `/images/optimized/${src}-${size}.${format} ${size}w`)
      .join(', ');
  };

  const fallbackSrc = `/images/optimized/${src}-${width}.${fallbackFormat}`;

  return (
    <picture style={{ display: 'block', ...style }}>
      {/* AVIF - Most modern and efficient */}
      <source
        type="image/avif"
        srcSet={generateSrcSet('avif')}
        sizes={sizes}
      />

      {/* WebP - Widely supported fallback */}
      <source
        type="image/webp"
        srcSet={generateSrcSet('webp')}
        sizes={sizes}
      />

      {/* JPEG/PNG - Universal fallback */}
      <img
        src={fallbackSrc}
        srcSet={generateSrcSet(fallbackFormat)}
        alt={alt}
        width={width}
        height={height}
        loading={actualLoading}
        decoding={decoding}
        sizes={sizes}
        style={{
          maxWidth: '100%',
          height: 'auto',
          objectFit,
          aspectRatio: `${width} / ${height}`,
        }}
      />
    </picture>
  );
}

// Convenience component for hero images (LCP - Largest Contentful Paint)
export function HeroImage(props: Omit<ResponsiveImageProps, 'priority' | 'loading'>) {
  return (
    <ResponsiveImage
      {...props}
      priority={true}
      loading="eager"
      style={{ width: '100%', height: 'auto', ...props.style }}
    />
  );
}

// Convenience component for card images
export function CardImage(props: ResponsiveImageProps) {
  return (
    <ResponsiveImage
      {...props}
      style={{ borderRadius: 8, ...props.style }}
      objectFit="cover"
    />
  );
}

// Component for avatars with circular cropping
export function AvatarImage(props: Omit<ResponsiveImageProps, 'objectFit'>) {
  return (
    <ResponsiveImage
      {...props}
      style={{ borderRadius: '50%', ...props.style }}
      objectFit="cover"
      width={props.width || 128}
      height={props.height || 128}
    />
  );
}

// Hook for programmatic image URL generation
export function useOptimizedImage(src: string, width: number = 1440, format: 'avif' | 'webp' | 'jpg' = 'webp') {
  return `/images/optimized/${src}-${width}.${format}`;
}

// Utility function to get all sizes for an image
export function getImageSrcSet(src: string, format: 'avif' | 'webp' | 'jpg' = 'webp') {
  return breakpoints
    .map(size => `/images/optimized/${src}-${size}.${format} ${size}w`)
    .join(', ');
}

// Preload function for critical images
export function preloadImage(src: string, sizes: string = defaultSizes) {
  if (typeof document === 'undefined') return;

  // Preload AVIF
  const linkAvif = document.createElement('link');
  linkAvif.rel = 'preload';
  linkAvif.as = 'image';
  linkAvif.type = 'image/avif';
  linkAvif.imageSrcset = generateSrcSet(src, 'avif');
  linkAvif.imageSizes = sizes;
  document.head.appendChild(linkAvif);

  // Preload WebP fallback
  const linkWebp = document.createElement('link');
  linkWebp.rel = 'preload';
  linkWebp.as = 'image';
  linkWebp.type = 'image/webp';
  linkWebp.imageSrcset = generateSrcSet(src, 'webp');
  linkWebp.imageSizes = sizes;
  document.head.appendChild(linkWebp);
}

function generateSrcSet(src: string, format: string) {
  return breakpoints
    .map(size => `/images/optimized/${src}-${size}.${format} ${size}w`)
    .join(', ');
}
