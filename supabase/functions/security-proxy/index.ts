import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const targetUrl = url.searchParams.get('url')
    
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate URL
    try {
      new URL(targetUrl)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch the resource
    const response = await fetch(targetUrl)
    const content = await response.text()

    // Security headers
    const securityHeaders = {
      // Content Security Policy
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://api.mapbox.com https://js.stripe.com",
        "style-src 'self' 'unsafe-inline' https://api.mapbox.com https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com https://api.mapbox.com",
        "img-src 'self' data: blob: https: http:",
        "connect-src 'self' https://api.mapbox.com https://events.mapbox.com wss://events.mapbox.com https://*.supabase.co wss://*.supabase.co",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "frame-src 'self' https://js.stripe.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests"
      ].join('; '),
      
      // Strict Transport Security
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
      
      // X-Content-Type-Options
      'X-Content-Type-Options': 'nosniff',
      
      // X-Frame-Options
      'X-Frame-Options': 'DENY',
      
      // X-XSS-Protection
      'X-XSS-Protection': '1; mode=block',
      
      // Referrer Policy
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      
      // Permissions Policy
      'Permissions-Policy': [
        'camera=()',
        'microphone=()',
        'geolocation=(self)',
        'payment=(self)',
        'usb=()',
        'magnetometer=()',
        'accelerometer=()',
        'gyroscope=()',
        'battery=()'
      ].join(', '),

      ...corsHeaders,
      'Content-Type': response.headers.get('content-type') || 'text/plain'
    }

    return new Response(content, {
      status: response.status,
      headers: securityHeaders
    })

  } catch (error) {
    console.error('Security proxy error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})