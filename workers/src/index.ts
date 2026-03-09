/**
 * Queer Guide — Cloudflare Workers
 *
 * Replaces Supabase Edge Functions that don't need the database,
 * or that only need light REST API access to Supabase.
 */
import type { Env } from './types';
import { corsResponse, errorResponse } from './cors';

// Route handlers — stateless proxies
import { handleCloudflareApi } from './routes/cloudflare-api';
import { handleGetTurnstileConfig, handleVerifyTurnstile } from './routes/turnstile';
import { handleCacheGet, handleCacheSet, handleCacheDelete, handleCacheKeys } from './routes/kv-cache';
import { handleWeatherForecast } from './routes/weather';
import { handleCurrentWeather } from './routes/current-weather';
import { handleTravelDeals } from './routes/travel-deals';
import { handleGeocoding } from './routes/geocoding';
import { handlePexelsImages } from './routes/pexels-images';
import { handleRedirect } from './routes/redirect-handler';
import { handleRefugeRestrooms } from './routes/refuge-restrooms';

// Route handlers — with Supabase REST
import { handleOriginAirport } from './routes/origin-airport';
import { handleSitemap } from './routes/sitemap';
import { handleCalendarExport, handleCalendarToken, handleCalendarFeed } from './routes/calendar';
import { handleUmamiAnalytics } from './routes/umami';

type RouteHandler = (req: Request, env: Env) => Promise<Response>;

const routes: Record<string, RouteHandler> = {
  // Cloudflare API proxy (admin only)
  '/cloudflare-api': handleCloudflareApi,

  // Turnstile CAPTCHA
  '/get-turnstile-config': handleGetTurnstileConfig,
  '/verify-turnstile': handleVerifyTurnstile,

  // KV Cache (replaces Redis/Upstash)
  '/cache/get': handleCacheGet,
  '/cache/set': handleCacheSet,
  '/cache/delete': handleCacheDelete,
  '/cache/keys': handleCacheKeys,
  '/redis-get': handleCacheGet,
  '/redis-set': handleCacheSet,
  '/redis-delete': handleCacheDelete,
  '/redis-keys': handleCacheKeys,

  // Weather
  '/get-weather-forecast': handleWeatherForecast,
  '/get-current-weather': handleCurrentWeather,

  // Travel
  '/travel-deals': handleTravelDeals,

  // Geocoding
  '/mapbox-geocoding': handleGeocoding,

  // Image search
  '/get-pexels-images': handlePexelsImages,

  // Short URL redirect
  '/redirect-handler': handleRedirect,

  // Refuge Restrooms
  '/get-refuge-restrooms': handleRefugeRestrooms,

  // Airport resolver
  '/resolve-origin-airport': handleOriginAirport,

  // Sitemap
  '/generate-sitemap': handleSitemap,

  // Calendar
  '/calendar-export': handleCalendarExport,
  '/calendar-token': handleCalendarToken,
  '/calendar-feed': handleCalendarFeed,

  // Analytics
  '/umami-analytics': handleUmamiAnalytics,
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight for any path
    if (request.method === 'OPTIONS') {
      return corsResponse(request, env);
    }

    // Strip trailing slash
    const pathname = url.pathname.replace(/\/$/, '') || '/';

    // Match route
    const handler = routes[pathname];
    if (handler) {
      try {
        return await handler(request, env);
      } catch (err) {
        console.error(`Unhandled error on ${pathname}:`, err);
        return errorResponse('Internal server error', 500, request, env);
      }
    }

    // Health check
    if (pathname === '/' || pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'queer-guide-workers',
          routes: Object.keys(routes).filter((r) => !r.startsWith('/redis-')),
        }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  },
};
