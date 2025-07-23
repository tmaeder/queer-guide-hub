/**
 * Build-time CSP hash generator for inline styles
 * This will help remove unsafe-inline from style-src
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Generate SHA-256 hash for inline styles
export function generateStyleHash(styleContent: string): string {
  const hash = crypto.createHash('sha256').update(styleContent, 'utf8').digest('base64');
  return `'sha256-${hash}'`;
}

// Development CSP with unsafe-inline for Tailwind compatibility
export const DEV_CSP_POLICY = {
  'default-src': ["'none'"],
  'script-src': [
    "'self'",
    "'unsafe-eval'", // Required for Vite dev mode
    'https://widget.getyourguide.com',
    'https://*.supabase.co',
    'https://xqeacpakadqfxjxjcewc.supabase.co'
  ],
  'connect-src': [
    "'self'",
    'ws://localhost:*',
    'ws://127.0.0.1:*',
    'ws://[::1]:*',
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
    "'unsafe-inline'", // Required for Vite dev and Tailwind
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
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
  'manifest-src': ["'self'"],
  'media-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'base-uri': ["'self'"],
  'form-action': [
    "'self'",
    'https://*.supabase.co'
  ],
  'upgrade-insecure-requests': []
};

// Production CSP without unsafe directives
export const PROD_CSP_POLICY = {
  'default-src': ["'none'"],
  'script-src': [
    "'self'",
    "'strict-dynamic'",
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
    // Style hashes will be added during build
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
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
  'manifest-src': ["'self'"],
  'media-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'base-uri': ["'self'"],
  'form-action': [
    "'self'",
    'https://*.supabase.co'
  ],
  'upgrade-insecure-requests': []
};

export function getCSPPolicy(isDev: boolean = false) {
  return isDev ? DEV_CSP_POLICY : PROD_CSP_POLICY;
}

export function generateCSPString(policy: typeof PROD_CSP_POLICY): string {
  return Object.entries(policy)
    .map(([directive, sources]) => {
      if (sources.length === 0) {
        return directive;
      }
      return `${directive} ${sources.join(' ')}`;
    })
    .join('; ');
}