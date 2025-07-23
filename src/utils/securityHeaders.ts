/**
 * Security headers configuration for deployment and edge functions
 */

import { getCSPPolicy, generateCSPString } from './cspBuilder';

export const SECURITY_HEADERS = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Prevent clickjacking - deny all framing
  'X-Frame-Options': 'DENY',
  
  // Enable XSS protection (legacy but still useful)
  'X-XSS-Protection': '1; mode=block',
  
  // Force HTTPS and enable HSTS with preload
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  
  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Permission policy to restrict dangerous features
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=()',
  
  // Cross-Origin Resource Policy
  'Cross-Origin-Resource-Policy': 'same-origin',
  
  // Cross-Origin Embedder Policy
  'Cross-Origin-Embedder-Policy': 'credentialless',
  
  // Cross-Origin Opener Policy
  'Cross-Origin-Opener-Policy': 'same-origin',
};

export function applySecurityHeaders(response: Response, isDev: boolean = false): Response {
  const headers = new Headers(response.headers);
  
  // Apply all security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  // Apply environment-appropriate CSP
  const cspPolicy = getCSPPolicy(isDev);
  headers.set('Content-Security-Policy', generateCSPString(cspPolicy));
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// For use in edge functions
export function createSecureResponse(
  body: string | ArrayBuffer | Uint8Array | ReadableStream,
  init?: ResponseInit,
  isDev: boolean = false
): Response {
  const response = new Response(body, init);
  return applySecurityHeaders(response, isDev);
}