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
 * Preload critical resources for Cloudflare's edge network
 */
export const preloadCriticalResources = () => {
  // Preload critical CSS and fonts that will be cached at Cloudflare edge
  const criticalResources = [
    { href: '/assets/css/index.css', as: 'style' },
    { href: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2', as: 'font', type: 'font/woff2', crossorigin: 'anonymous' },
  ];

  criticalResources.forEach(resource => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = resource.href;
    link.as = resource.as;
    if (resource.type) link.type = resource.type;
    if (resource.crossorigin) link.crossOrigin = resource.crossorigin;
    document.head.appendChild(link);
  });
};

/**
 * Initialize service worker for Cloudflare Workers compatibility
 */
export const initializeServiceWorker = async () => {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'imports'
      });
      
      console.log('Service Worker registered successfully:', registration);
      
      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content is available, notify user
              console.log('New content available. Refresh to update.');
            }
          });
        }
      });
    } catch (error) {
      console.log('Service Worker registration failed:', error);
    }
  }
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
      // Add Cloudflare-specific headers for better caching
      'CF-Cache-TTL': cacheTime.toString(),
      'CF-Edge-Cache': 'cache,platform=cf',
    },
  };

  return fetch(url, optimizedOptions);
};

/**
 * Get visitor's geolocation from Cloudflare headers (when available)
 */
export const getCloudflareGeoData = () => {
  // This would be available in Cloudflare Workers/Pages
  // For now, return mock data for development
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
  // Enable HTTP/2 push for critical resources
  if (window.performance && window.performance.mark) {
    window.performance.mark('cloudflare-optimizations-start');
  }

  // Preload critical resources
  preloadCriticalResources();

  // Initialize service worker
  initializeServiceWorker();

  // Add viewport meta for mobile optimization
  if (!document.querySelector('meta[name="viewport"]')) {
    const viewport = document.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    document.head.appendChild(viewport);
  }

  // Add dns-prefetch for external domains
  const domains = ['supabase.co', 'mapbox.com', 'stripe.com', 'googleapis.com'];
  domains.forEach(domain => {
    const link = document.createElement('link');
    link.rel = 'dns-prefetch';
    link.href = `https://${domain}`;
    document.head.appendChild(link);
  });

  if (window.performance && window.performance.mark) {
    window.performance.mark('cloudflare-optimizations-end');
    window.performance.measure(
      'cloudflare-optimizations',
      'cloudflare-optimizations-start',
      'cloudflare-optimizations-end'
    );
  }
};