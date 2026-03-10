/**
 * Queer Guide — Cloudflare Workers API
 *
 * Full Supabase replacement using D1, R2, and KV.
 * Built with Hono for routing.
 */
import { Hono } from 'hono';
import type { Env } from './types';
import { corsMiddleware } from './middleware/cors';

// Core route modules
import { auth } from './routes/auth';
import { crud } from './routes/crud';
import { rpc } from './routes/rpc';
import { storage } from './routes/storage';
import { kv } from './routes/kv';

// Feature route modules (migrated from Supabase edge functions)
import { admin } from './routes/admin';
import { automation } from './routes/automation';
import { imports } from './routes/imports';
import { ingestion } from './routes/ingestion';
import { enrichment } from './routes/enrichment';
import { scraping } from './routes/scraping';
import { media } from './routes/media';
import { email } from './routes/email';
import { apiKeys } from './routes/api-keys';
import { functionMonitor } from './routes/function-monitor';
import { chatgptOauth } from './routes/chatgpt-oauth';
import { umamiDashboard } from './routes/umami-dashboard';

// Legacy route handlers (stateless proxies — migrated from previous Workers)
import { handleCloudflareApi } from './routes/cloudflare-api';
import { handleGetTurnstileConfig } from './routes/turnstile';
import { handleWeatherForecast } from './routes/weather';
import { handleTravelDeals } from './routes/travel-deals';
import { handleGeocoding } from './routes/geocoding';
import { handlePexelsImages } from './routes/pexels-images';
import { handleRedirect } from './routes/redirect-handler';
import { handleRefugeRestrooms } from './routes/refuge-restrooms';
import { handleOriginAirport } from './routes/origin-airport';
import { handleCalendarExport, handleCalendarToken } from './routes/calendar';
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

// ── KV Cache ──
app.route('/cache', kv);

// ── Feature modules (migrated from Supabase edge functions) ──
app.route('/admin', admin);
app.route('/automation', automation);
app.route('/imports', imports);
app.route('/ingestion', ingestion);
app.route('/enrichment', enrichment);
app.route('/scraping', scraping);
app.route('/media', media);
app.route('/email', email);
app.route('/api-keys', apiKeys);
app.route('/function-monitor', functionMonitor);
app.route('/chatgpt-oauth', chatgptOauth);
app.route('/umami-dashboard', umamiDashboard);

// ── Stateless route handlers (wrapped for Hono) ──
function wrap(handler: (req: Request, env: Env) => Promise<Response>) {
  return (c: { req: { raw: Request }; env: Env }) => handler(c.req.raw, c.env);
}

app.all('/cloudflare-api', wrap(handleCloudflareApi));
app.all('/get-turnstile-config', wrap(handleGetTurnstileConfig));
app.all('/get-weather-forecast', wrap(handleWeatherForecast));
app.all('/travel-deals', wrap(handleTravelDeals));
app.all('/mapbox-geocoding', wrap(handleGeocoding));
app.all('/get-pexels-images', wrap(handlePexelsImages));
app.all('/redirect-handler', wrap(handleRedirect));
app.all('/get-refuge-restrooms', wrap(handleRefugeRestrooms));
app.all('/resolve-origin-airport', wrap(handleOriginAirport));
app.all('/calendar-export', wrap(handleCalendarExport));
app.all('/calendar-token', wrap(handleCalendarToken));
app.all('/umami-analytics', wrap(handleUmamiAnalytics));

// Stub handlers for credential/config endpoints
app.all('/get-stripe-publishable-key', async (c) => {
  return c.json({ key: c.env.STRIPE_PUBLISHABLE_KEY || '' });
});

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
