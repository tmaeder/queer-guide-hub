/**
 * autoFileError — fire-and-forget client → feedback-board error filing.
 *
 * Pipes uncaught errors, unhandled rejections, ErrorBoundary crashes and SPA
 * 404s into the existing `upsert_api_error` RPC (community_submissions, content_type
 * 'api_error'). The RPC dedups by fingerprint + bumps occurrence_count, and an
 * INSERT trigger LLM-triages each *new* fingerprint. So the fingerprint MUST be
 * the route TEMPLATE (`/:locale/venues/:slug`), never the literal path — otherwise
 * every bot-hit slug becomes a new row + a new LLM call.
 *
 * Never throws. No-ops in DEV. One network call per distinct fingerprint per tab.
 */

import { supabase } from '@/integrations/supabase/client';
import { captureContext } from '@/utils/feedbackContext';

export type AutoFileKind =
  | 'error_boundary'
  | 'window_error'
  | 'unhandled_rejection'
  | 'not_found';

// 2-letter locale prefixes we strip to a placeholder so e.g. /de/x and /fr/x
// collapse to one fingerprint. Mirrors the app's supported set (super-set is fine).
const LOCALE_RE = /^(en|es|fr|de|pt|it|ru|zh|ja|ko|ar|he|ur)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reduce a pathname to a low-cardinality template. Dynamic segments (slugs,
 * ids, numbers) become placeholders; short static words (guides, settings…)
 * are kept so distinct app routes stay distinguishable.
 */
export function routeTemplate(pathname: string): string {
  const segments = pathname.split('?')[0].split('#')[0].split('/').filter(Boolean);
  const out = segments.map((seg, i) => {
    if (i === 0 && LOCALE_RE.test(seg)) return ':locale';
    if (UUID_RE.test(seg)) return ':id';
    if (/^\d+$/.test(seg)) return ':id';
    // slug-like: hyphenated, long, or contains a digit → dynamic value.
    if (seg.includes('-') || seg.length >= 12 || /\d/.test(seg)) return ':slug';
    return seg.toLowerCase();
  });
  return '/' + out.join('/');
}

/** Strip volatile tokens (numbers, uuids, urls, quoted strings) so the same
 * class of error collapses to one fingerprint. */
function normalizeMessage(msg: string): string {
  return msg
    .slice(0, 300)
    .replace(/https?:\/\/\S+/gi, 'URL')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
    .replace(/\d+/g, 'N')
    .replace(/["'`].*?["'`]/g, 'STR')
    .trim();
}

/** Tiny stable string hash (FNV-1a, 32-bit) — no async crypto needed. */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

interface FileErrorArgs {
  kind: AutoFileKind;
  error?: { name?: string; message?: string } | null;
  routePath: string;
  extra?: Record<string, unknown>;
}

// Our own e2e/CI browsers and crawlers file the bulk of board noise; their
// crashes are either self-inflicted (no WebGL/canvas in headless) or stale-chunk
// bot re-reports. Real-user environments never match these.
const NON_HUMAN_UA_RE = /HeadlessChrome|Playwright|Lighthouse|PhantomJS|Electron|bot|spider|crawl|slurp|bingpreview|facebookexternalhit/i;

// Stale-chunk failures self-heal via lazyRetry's one-time reload for real
// users; only bots (no sessionStorage persistence) keep re-reporting them.
const BENIGN_MESSAGE_RE = /stale\/partial chunk|Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|'text\/html' is not a valid JavaScript MIME type/i;

/** Fire-and-forget. Safe to call from any error path — never throws. */
export function fileError({ kind, error, routePath, extra }: FileErrorArgs): void {
  try {
    // Don't pollute the board from local dev / preview builds.
    if (import.meta.env.DEV) return;
    if (typeof window === 'undefined') return;
    // Skip non-production origins (vite preview, e2e webServer, tunnels).
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return;
    // Skip automated browsers/crawlers — they dominate board noise.
    if (NON_HUMAN_UA_RE.test(navigator.userAgent) || navigator.webdriver) return;
    // Skip known-benign, self-healing chunk-staleness errors (Sentry still sees them).
    if (kind !== 'not_found' && BENIGN_MESSAGE_RE.test(error?.message || '')) return;

    const template = routeTemplate(routePath || '/');
    const errName = error?.name || (kind === 'not_found' ? 'NotFound' : 'Error');
    const errMsg = normalizeMessage(error?.message || '');

    const fingerprint = `${kind}:${hash(`${kind}|${errName}|${template}|${errMsg}`)}`;

    // One network call per fingerprint per tab — bounds anon abuse and
    // render-loop refires. Server still dedups across sessions.
    const throttleKey = `qg_err_filed_${fingerprint}`;
    try {
      if (sessionStorage.getItem(throttleKey)) return;
      sessionStorage.setItem(throttleKey, '1');
    } catch {
      /* private mode — fall through, server dedup still protects us */
    }

    const title =
      kind === 'not_found'
        ? `[404] ${template}`
        : `[${kind === 'error_boundary' ? 'crash' : 'error'}] ${errName} @ ${template}`;
    const description = error?.message?.slice(0, 500) || `${errName} on ${template}`;

    const payload = {
      ...captureContext(),
      title,
      description,
      kind,
      route_template: template,
      model: 'auto',
      ...(extra ? { extra } : {}),
    };

    void supabase
      .rpc('upsert_api_error', {
        p_fingerprint: fingerprint,
        p_data: payload,
        p_source: kind,
      })
      .then(undefined, () => {
        /* best-effort — never surface filing failures to the user */
      });
  } catch {
    /* never throw from the error path */
  }
}
