/**
 * Queer Guide — Cloudflare Workers API
 *
 * Full Supabase replacement using D1, R2, and KV.
 * Built with Hono for routing.
 */
import { Hono } from 'hono';
import type { Env } from './types';
import { corsMiddleware } from './middleware/cors';

// Route modules
import { auth } from './routes/auth';
import { crud } from './routes/crud';
import { rpc } from './routes/rpc';
import { storage } from './routes/storage';
import { kv } from './routes/kv';

// Legacy route handlers (stateless proxies — migrated from previous Workers)
import { handleCloudflareApi } from './routes/cloudflare-api';
import { handleGetTurnstileConfig, handleVerifyTurnstile } from './routes/turnstile';
import { handleWeatherForecast } from './routes/weather';
import { handleCurrentWeather } from './routes/current-weather';
import { handleTravelDeals } from './routes/travel-deals';
import { handleGeocoding } from './routes/geocoding';
import { handlePexelsImages } from './routes/pexels-images';
import { handleRedirect } from './routes/redirect-handler';
import { handleRefugeRestrooms } from './routes/refuge-restrooms';
import { handleOriginAirport } from './routes/origin-airport';
import { handleSitemap } from './routes/sitemap';
import { handleCalendarExport, handleCalendarToken, handleCalendarFeed } from './routes/calendar';
import { handleUmamiAnalytics } from './routes/umami';

const app = new Hono<{ Bindings: Env }>();

// Global CORS middleware
app.use('*', corsMiddleware);

// ── Auth routes ──
app.route('/auth', auth);

// ── CRUD (replaces supabase.from()) ──
app.route('/rest', crud);

// ── RPC (replaces supabase.rpc()) ──
app.route('/rpc', rpc);

// ── Storage (replaces supabase.storage) ──
app.route('/storage', storage);

// ── KV Cache (replaces Redis) ──
app.route('/cache', kv);
// Backward-compatible Redis paths
app.route('/redis-get', kv);
app.route('/redis-set', kv);
app.route('/redis-delete', kv);
app.route('/redis-keys', kv);

// ── Legacy proxy routes (wrapped for Hono) ──
function wrap(handler: (req: Request, env: Env) => Promise<Response>) {
  return (c: { req: { raw: Request }; env: Env }) => handler(c.req.raw, c.env);
}

app.all('/cloudflare-api', wrap(handleCloudflareApi));
app.all('/get-turnstile-config', wrap(handleGetTurnstileConfig));
app.all('/verify-turnstile', wrap(handleVerifyTurnstile));
app.all('/get-weather-forecast', wrap(handleWeatherForecast));
app.all('/get-current-weather', wrap(handleCurrentWeather));
app.all('/travel-deals', wrap(handleTravelDeals));
app.all('/mapbox-geocoding', wrap(handleGeocoding));
app.all('/get-pexels-images', wrap(handlePexelsImages));
app.all('/redirect-handler', wrap(handleRedirect));
app.all('/get-refuge-restrooms', wrap(handleRefugeRestrooms));
app.all('/resolve-origin-airport', wrap(handleOriginAirport));
app.all('/generate-sitemap', wrap(handleSitemap));
app.all('/calendar-export', wrap(handleCalendarExport));
app.all('/calendar-token', wrap(handleCalendarToken));
app.all('/calendar-feed', wrap(handleCalendarFeed));
app.all('/umami-analytics', wrap(handleUmamiAnalytics));

// ── Health check ──
app.get('/', (c) =>
  c.json({
    status: 'ok',
    service: 'queer-guide-workers',
    version: '2.0.0',
  }),
);

app.get('/health', (c) => c.json({ status: 'ok' }));

export default app;
