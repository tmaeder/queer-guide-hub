#!/usr/bin/env node
/**
 * Static pre-renderer for queer.guide
 * Uses Playwright to snapshot public routes from the built SPA,
 * producing a fully static mirror in dist-static/.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, cp, readdir, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..');
const DIST_DIR = join(WEB_ROOT, 'dist');
const OUTPUT_DIR = join(WEB_ROOT, 'dist-static');
const PREVIEW_PORT = 4173;
const PREVIEW_ORIGIN = `http://localhost:${PREVIEW_PORT}`;

// Public routes to pre-render (no auth/admin routes)
const ROUTES = [
  '/',
  '/venues',
  '/events',
  '/marketplace',
  '/hotels',
  '/places',
  '/travel',
  '/map',
  '/users',
  '/personalities',
  '/resources',
  '/news',
  '/donate',
  '/sitemap',
  '/submit',
  '/feedback',
  '/help-hotlines',
  '/about-hub',
  '/about',
  '/contact',
  '/vision',
  '/values',
  '/press',
  '/blog',
  '/sustainability',
  '/legal',
  '/terms',
  '/privacy',
  '/cookies',
  '/dmca',
  '/accessibility',
];

// Patterns to strip from rendered HTML (sensitive keys)
const STRIP_PATTERNS = [
  /sb-[a-z0-9]+-auth-token[^"']*/g,
  /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWTs
];

/**
 * Start vite preview server and wait for it to be ready.
 */
function startPreviewServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], {
      cwd: WEB_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production' },
    });

    let started = false;
    const timeout = setTimeout(() => {
      if (!started) {
        proc.kill();
        reject(new Error('Preview server failed to start within 15s'));
      }
    }, 15000);

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Local:') || output.includes(String(PREVIEW_PORT))) {
        started = true;
        clearTimeout(timeout);
        // Give server a moment to fully initialize
        setTimeout(() => resolve(proc), 1000);
      }
    });

    proc.stderr.on('data', (data) => {
      console.error('[preview]', data.toString().trim());
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Rewrite absolute URLs to relative for portability across TLDs.
 */
function rewriteUrls(html, routeDepth) {
  // Replace absolute paths with relative
  const prefix = routeDepth > 0 ? '../'.repeat(routeDepth) : './';

  return html
    // Rewrite href="/..." and src="/..." to relative
    .replace(/(href|src|action)="\/(?!\/)/g, `$1="${prefix}`)
    // Rewrite url(/...) in inline styles
    .replace(/url\(\/(?!\/)/g, `url(${prefix}`)
    // Strip sensitive patterns
    .replace(STRIP_PATTERNS[0], '')
    .replace(STRIP_PATTERNS[1], 'REDACTED');
}

/**
 * Pre-render a single route.
 */
async function prerenderRoute(page, route) {
  const url = `${PREVIEW_ORIGIN}${route}`;
  console.log(`  Rendering: ${route}`);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for React to hydrate and content to load
    await page.waitForTimeout(2000);

    // Try waiting for main content to appear
    await page.waitForSelector('[data-testid], main, #root > div', { timeout: 5000 }).catch(() => {});

    let html = await page.content();

    // Calculate depth for relative URL rewriting
    const depth = route === '/' ? 0 : route.split('/').filter(Boolean).length;
    html = rewriteUrls(html, depth);

    // Inject meta tag indicating this is a pre-rendered mirror
    html = html.replace(
      '</head>',
      '  <meta name="generator" content="queer-guide-prerender">\n  </head>'
    );

    // Write to output directory
    const outPath = route === '/'
      ? join(OUTPUT_DIR, 'index.html')
      : join(OUTPUT_DIR, route.slice(1), 'index.html');

    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, html, 'utf-8');
    return true;
  } catch (err) {
    console.error(`  FAILED: ${route} — ${err.message}`);
    return false;
  }
}

/**
 * Copy static assets from dist/ to dist-static/.
 */
async function copyStaticAssets() {
  console.log('\nCopying static assets from dist/ ...');
  const entries = await readdir(DIST_DIR);

  for (const entry of entries) {
    // Skip index.html (we generate our own per-route)
    if (entry === 'index.html') continue;

    const src = join(DIST_DIR, entry);
    const dest = join(OUTPUT_DIR, entry);
    const stats = await stat(src);

    if (stats.isDirectory()) {
      await cp(src, dest, { recursive: true, force: true });
    } else {
      await mkdir(dirname(dest), { recursive: true });
      await cp(src, dest, { force: true });
    }
  }

  // Also copy offline.html to root
  const offlineSrc = join(DIST_DIR, 'offline.html');
  try {
    await cp(offlineSrc, join(OUTPUT_DIR, 'offline.html'), { force: true });
  } catch {
    // offline.html may not exist in dist
  }
}

async function main() {
  console.log('=== queer.guide Static Pre-renderer ===\n');

  // Ensure dist/ exists
  try {
    await stat(DIST_DIR);
  } catch {
    console.error('Error: dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }

  // Clean output directory
  await mkdir(OUTPUT_DIR, { recursive: true });

  // Start preview server
  console.log('Starting preview server...');
  const server = await startPreviewServer();
  console.log(`Preview server running on port ${PREVIEW_PORT}\n`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'queer-guide-prerender/1.0',
      viewport: { width: 1280, height: 800 },
    });

    // Pre-render routes (3 pages concurrently for speed)
    const concurrency = 3;
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < ROUTES.length; i += concurrency) {
      const batch = ROUTES.slice(i, i + concurrency);
      const pages = await Promise.all(batch.map(() => context.newPage()));

      const results = await Promise.all(
        batch.map((route, idx) => prerenderRoute(pages[idx], route))
      );

      results.forEach((ok) => (ok ? succeeded++ : failed++));
      await Promise.all(pages.map((p) => p.close()));
    }

    console.log(`\nPre-rendered: ${succeeded} succeeded, ${failed} failed`);

    // Copy static assets
    await copyStaticAssets();

    console.log(`\nOutput: ${OUTPUT_DIR}`);
    console.log('Done.');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
