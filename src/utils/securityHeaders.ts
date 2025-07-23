/**
 * Security headers configuration for deployment and edge functions
 */

export const SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Prevent clickjacking
  'X-Frame-Options': 'SAMEORIGIN',
  
  // Enable XSS protection (legacy but still useful)
  'X-XSS-Protection': '1; mode=block',
  
  // Force HTTPS and enable HSTS
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  
  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Permission policy to restrict dangerous features
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self), payment=(), usb=()',
  
  // Cross-Origin Resource Policy
  'Cross-Origin-Resource-Policy': 'cross-origin',
  
  // Cross-Origin Embedder Policy
  'Cross-Origin-Embedder-Policy': 'credentialless',
  
  // Cross-Origin Opener Policy
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

export const CSP_POLICY = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    'https://widget.getyourguide.com',
    'https://*.supabase.co',
    'https://xqeacpakadqfxjxjcewc.supabase.co'
  ],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    'https://xqeacpakadqfxjxjcewc.supabase.co',
    'wss://*.supabase.co',
    'wss://xqeacpakadqfxjxjcewc.supabase.co',
    'https://api.mapbox.com',
    'https://events.mapbox.com',
    'https://widget.getyourguide.com',
    'https://api.openweathermap.org',
    'https://newsapi.org'
  ],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.supabase.co',
    'https://xqeacpakadqfxjxjcewc.supabase.co',
    'https://api.mapbox.com',
    'https://static.getyourguide.com',
    'https://images.unsplash.com',
    'https://api.pexels.com'
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for Tailwind CSS and dynamic styles
    'https://fonts.googleapis.com',
    'https://api.mapbox.com'
  ],
  'font-src': [
    "'self'",
    'https://fonts.gstatic.com'
  ],
  'frame-src': [
    "'self'",
    'https://widget.getyourguide.com'
  ],
  'frame-ancestors': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': [
    "'self'",
    'https://*.supabase.co'
  ],
  'upgrade-insecure-requests': []
};

export function generateCSPString(policy: typeof CSP_POLICY): string {
  return Object.entries(policy)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive;
      }
      return `${directive} ${sources.join(' ')}`;
    })
    .join('; ');
}

export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  
  // Apply all security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  // Apply CSP
  headers.set('Content-Security-Policy', generateCSPString(CSP_POLICY));
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// For use in edge functions
export function createSecureResponse(
  body: string | ArrayBuffer | Uint8Array | ReadableStream,
  init?: ResponseInit
): Response {
  const response = new Response(body, init);
  return applySecurityHeaders(response);
}