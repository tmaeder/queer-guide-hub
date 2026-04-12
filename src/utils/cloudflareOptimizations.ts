// Cloudflare-specific optimizations and utilities

/**
 * Optimize image URLs for Cloudflare Images
 */
export const optimizeImageForCloudflare = (
  src: string,
  width?: number,
  height?: number,
  format: 'auto' | 'webp' | 'avif' | 'jpg' | 'png' = 'auto',
  quality = 85
) => {
  // If using Cloudflare Images, add transformation parameters
  if (src.includes('imagedelivery.net') || src.includes('cf-images.com')) {
    const params = [];
    if (width) params.push(`w=${width}`);
    if (height) params.push(`h=${height}`);
    params.push(`f=${format}`);
    params.push(`q=${quality}`);

    return `${src}${src.includes('?') ? '&' : '?'}${params.join('&')}`;
  }

  return src;
};

/**
 * Optimize fetch requests for Cloudflare edge caching
 */
export const cloudflareOptimizedFetch = async (
  url: string,
  options: RequestInit = {},
  cacheTime = 300 // 5 minutes default
) => {
  const optimizedOptions: RequestInit = {
    ...options,
    headers: {
      ...options.headers,
      'CF-Cache-TTL': cacheTime.toString(),
    },
  };

  return fetch(url, optimizedOptions);
};

/**
 * Get visitor's geolocation from Cloudflare headers (when available)
 */
export const getCloudflareGeoData = () => {
  if (typeof window !== 'undefined') {
    return {
      country: (window as unknown as Record<string, Record<string, string>>).CF?.country || 'US',
      region: (window as unknown as Record<string, Record<string, string>>).CF?.region || 'CA',
      city: (window as unknown as Record<string, Record<string, string>>).CF?.city || 'San Francisco',
      timezone: (window as unknown as Record<string, Record<string, string>>).CF?.timezone || 'America/Los_Angeles',
      latitude: (window as unknown as Record<string, Record<string, string>>).CF?.latitude || '37.7749',
      longitude: (window as unknown as Record<string, Record<string, string>>).CF?.longitude || '-122.4194'
    };
  }

  // Fallback for development
  return {
    country: 'US',
    region: 'CA',
    city: 'San Francisco',
    timezone: 'America/Los_Angeles',
    latitude: '37.7749',
    longitude: '-122.4194'
  };
};

/**
 * Initialize Cloudflare-specific performance optimizations
 */
export const initCloudflareOptimizations = () => {
  // Add dns-prefetch for external domains used by the app
  const domains = ['supabase.co'];
  domains.forEach(domain => {
    if (!document.querySelector(`link[rel="dns-prefetch"][href="https://${domain}"]`)) {
      const link = document.createElement('link');
      link.rel = 'dns-prefetch';
      link.href = `https://${domain}`;
      document.head.appendChild(link);
    }
  });

  // Service worker registration is handled by PWAProvider
};
