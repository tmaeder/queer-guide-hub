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

// ── Legacy proxy routes (wrapped for Hono) ──
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

// ── Backward-compatible function-name routes ──
// Maps old edge function names (used by api.functions.invoke())
// to the new grouped route modules via proxy.
// TODO: Migrate frontend callers to use grouped paths directly, then remove these.

function proxy(targetPath: string) {
  return async (c: { req: { raw: Request }; env: Env }) => {
    const url = new URL(c.req.raw.url);
    url.pathname = targetPath;
    const newReq = new Request(url.toString(), c.req.raw);
    return app.fetch(newReq, c.env);
  };
}

// Admin
app.all('/admin-create-user', proxy('/admin/create-user'));
app.all('/secure-passkey-operations', proxy('/admin/passkey'));

// Automation
app.all('/content-automation', proxy('/automation/content'));
app.all('/categorize-tags', proxy('/automation/categorize-tags'));
app.all('/auto-tag-content', proxy('/automation/auto-tag-content'));
app.all('/workflow-dispatcher', proxy('/automation/workflow'));

// Enrichment
app.all('/enrich-venue', proxy('/enrichment/venue'));
app.all('/fetch-wikipedia-data', proxy('/enrichment/fetch-wikipedia'));
app.all('/fetch-personality-data', proxy('/enrichment/fetch-personality'));
app.all('/fetch-and-store-city-images', proxy('/enrichment/fetch-city-images'));
app.all('/fetch-news', proxy('/enrichment/fetch-news'));
app.all('/geo-link-content', proxy('/enrichment/geo-link'));
app.all('/link-locations', proxy('/enrichment/link-locations'));
app.all('/resolve-or-create-city', proxy('/enrichment/resolve-city'));
app.all('/populate-optimization-status', proxy('/enrichment/populate-optimization-status'));

// Imports
app.all('/import-venues-csv', proxy('/imports/csv'));
app.all('/import-events-csv', proxy('/imports/csv'));
app.all('/import-tags-csv', proxy('/imports/csv'));
app.all('/import-personalities-csv', proxy('/imports/csv'));
app.all('/import-adult-models-csv', proxy('/imports/csv'));
app.all('/import-city-data', proxy('/imports/cities'));
app.all('/import-country-data', proxy('/imports/countries'));
app.all('/import-foursquare-venues', proxy('/imports/foursquare-venues'));
app.all('/import-google-places-venues', proxy('/imports/google-places-venues'));
app.all('/import-tripadvisor-venues', proxy('/imports/tripadvisor-venues'));
app.all('/import-tomtom-venues', proxy('/imports/tomtom-venues'));
app.all('/import-eventbrite-events', proxy('/imports/eventbrite-events'));
app.all('/import-ticketmaster-events', proxy('/imports/ticketmaster-events'));
app.all('/import-ilga-data', proxy('/imports/ilga-data'));
app.all('/import-awin-products', proxy('/imports/awin-products'));
app.all('/background-import-manager', proxy('/imports/background'));
app.all('/bulk-create-personalities', proxy('/imports/bulk-personalities'));
app.all('/bulk-create-ai-tags', proxy('/imports/bulk-ai-tags'));
app.all('/bulk-scrape-events', proxy('/imports/bulk-scrape-events'));

// Ingestion
app.all('/ingestion-pipeline', proxy('/ingestion/pipeline'));
app.all('/ingestion-review-api', proxy('/ingestion/review'));

// Scraping
app.all('/scrape-web-sources', proxy('/scraping/web-sources'));
app.all('/scrape-gaycities-events', proxy('/scraping/gaycities-events'));
app.all('/scrape-spartacus', proxy('/scraping/spartacus'));
app.all('/scan-links', proxy('/scraping/scan-links'));
app.all('/validate-links', proxy('/scraping/validate-links'));
app.all('/scan-project-images', proxy('/scraping/scan-project-images'));

// Media
app.all('/analyze-flyer', proxy('/media/analyze-flyer'));
app.all('/optimize-images-batch', proxy('/media/optimize-images'));
app.all('/process-audio', proxy('/media/process-audio'));
app.all('/process-video', proxy('/media/process-video'));
app.all('/store-tag-images', proxy('/media/store-tag-images'));
app.all('/reimport-personality-images', proxy('/media/reimport-personality-images'));

// Email
app.all('/send-mailbox-email', proxy('/email/send-mailbox'));
app.all('/send-templated-email', proxy('/email/send-templated'));
app.all('/send-group-notifications', proxy('/email/send-group-notification'));

// API Keys
app.all('/manage-api-keys', proxy('/api-keys/manage'));

// Misc function aliases
app.all('/clean-merge-all-duplicates', proxy('/automation/clean-merge-duplicates'));
app.all('/create-moderation-flag', proxy('/automation/create-moderation-flag'));
app.all('/sync-content-links', proxy('/automation/sync-content-links'));
app.all('/get-wikipedia-info', proxy('/enrichment/fetch-wikipedia'));

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
