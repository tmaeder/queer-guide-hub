/**
 * Security utilities for CSP and other security measures
 */

// Generate a cryptographic nonce for CSP
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Set CSP meta tag with nonce for inline scripts
export function setCSPWithNonce(nonce: string): void {
  const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (cspMeta) {
    const cspContent = `default-src 'self'; script-src 'self' 'nonce-${nonce}' https://widget.getyourguide.com https://*.supabase.co https://xqeacpakadqfxjxjcewc.supabase.co; connect-src 'self' https://*.supabase.co https://xqeacpakadqfxjxjcewc.supabase.co wss://*.supabase.co wss://xqeacpakadqfxjxjcewc.supabase.co https://api.mapbox.com https://events.mapbox.com https://widget.getyourguide.com https://api.openweathermap.org https://newsapi.org; img-src 'self' data: blob: https://*.supabase.co https://xqeacpakadqfxjxjcewc.supabase.co https://api.mapbox.com https://static.getyourguide.com https://images.unsplash.com https://api.pexels.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com; font-src 'self' https://fonts.gstatic.com; frame-src 'self' https://widget.getyourguide.com; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://*.supabase.co; upgrade-insecure-requests;`;
    cspMeta.setAttribute('content', cspContent);
  }
}

// Security headers validation
export function validateSecurityHeaders(): {
  csp: boolean;
  hsts: boolean;
  contentTypeOptions: boolean;
  xssProtection: boolean;
  frameOptions: boolean;
} {
  const headers = {
    csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
    hsts: !!document.querySelector('meta[http-equiv="Strict-Transport-Security"]'),
    contentTypeOptions: !!document.querySelector('meta[http-equiv="X-Content-Type-Options"]'),
    xssProtection: !!document.querySelector('meta[http-equiv="X-XSS-Protection"]'),
    frameOptions: !!document.querySelector('meta[http-equiv="X-Frame-Options"]'),
  };

  return headers;
}

// Check if running in secure context
export function isSecureContext(): boolean {
  return window.isSecureContext;
}

// Log security configuration in development
export function logSecurityStatus(): void {
  if (import.meta.env.DEV) {
    const headers = validateSecurityHeaders();
    const secure = isSecureContext();
    
    console.group('🔒 Security Status');
    console.log('Secure Context:', secure);
    console.log('Security Headers:', headers);
    console.groupEnd();
  }
}