#!/usr/bin/env node
// Run axe-core across the whole-app route manifest and emit a JSON + Markdown
// summary. Sweeps each route across viewport(s) and theme(s) so mobile-layout
// and dark-mode contrast regressions are caught, not just desktop-light.
//
// Usage:
//   BASE_URL=https://queer.guide node scripts/a11y-axe-scan.mjs
//   BASE_URL=http://localhost:4173 node scripts/a11y-axe-scan.mjs
//
// Env:
//   SCAN_SCOPE     public | auth | admin | all        (default: public)
//   SCAN_VIEWPORTS desktop | mobile | desktop,mobile   (default: desktop)
//   SCAN_THEMES    light | dark | light,dark           (default: light)
//   SCAN_CONCURRENCY  parallel page scans              (default: 4)
//   OUT_NAME       output basename in docs/a11y-audit  (default: axe-baseline)
//   E2E_STORAGE_STATE  storageState json for auth/admin routes
//                      (default: playwright/.auth/admin.json when present)

import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routesForScope } from './a11y-routes.mjs';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:4173').replace(/\/$/, '');
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SCOPE = process.env.SCAN_SCOPE || 'public';
const VIEWPORTS = (process.env.SCAN_VIEWPORTS || 'desktop').split(',').map((s) => s.trim());
const THEMES = (process.env.SCAN_THEMES || 'light').split(',').map((s) => s.trim());
const OUT_NAME = process.env.OUT_NAME || 'axe-baseline';
// Scans are network- and render-bound, not CPU-bound, so a small pool cuts the
// sweep well under the job budget. Sequential, the public manifest × 4 variants
// is 160 scans ≈ 24 min and the 20-minute runner timeout killed it at 130 —
// leaving no JSON at all, which the CI gate then read as the stale committed
// file. See writeOut() below for the other half of that fix.
const CONCURRENCY = Math.max(1, Number(process.env.SCAN_CONCURRENCY || 4) || 4);

const VIEWPORT_SIZES = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 320, height: 640 },
};

// Surfaces where a horizontal scroll container is the correct, accessible
// pattern (the full-bleed map canvas). Their overflow lives inside a labelled
// scroll region, so the page-level 320px no-scroll assert is relaxed — axe
// target-size still runs.
const ALLOW_INNER_SCROLL = new Set(['map']);

/**
 * Wait until the app is actually ready to be sampled. Steps 1–4 are a port of
 * `e2e/support/appReady.ts` — that file is TypeScript and this script is plain
 * `.mjs` run by bare node, so it cannot be imported; keep the two in step. The
 * final content-settle step is extra, and only this scan needs it (the specs
 * assert against elements they name, so they wait for those directly).
 *
 * **`waitForLoadState('networkidle')` is NOT that signal**, which is what this
 * scan used to rely on. It never settles against a live app (persistent
 * Supabase realtime sockets, analytics beacons on a timer, streaming map
 * tiles), so it burns its whole timeout and the flat `waitForTimeout(800)`
 * after it was doing all the real work. 800 ms happens to outlast the 0.3 s
 * `station-arrive` route fade, so route transitions were never the problem —
 * but it does NOT outlast the lazy overlay chunks (cookie banner, feedback
 * FAB) that LayoutShell mounts after first paint. axe then samples one
 * half-mounted and blends its transient opacity into the computed colour,
 * reporting greys that match no token in the system. The e2e suite hit exactly
 * this on /events in PR #2522 (#ffffff on #e2e2e2, 1.29:1) and fixed it here.
 */
async function waitForAppReady(page, timeout = 30_000) {
  await page.waitForFunction(
    () => (document.getElementById('root')?.children.length ?? 0) > 0,
    undefined,
    { timeout },
  );
  // Non-fatal: a font that never resolves should not fail a scan.
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  // Load-bearing for axe: sampling before the theme stylesheet applies reads
  // fallback greys and reports bogus contrast ratios.
  await page
    .waitForFunction(
      () =>
        getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim() !== '',
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {});
  // Two steps: give the lazy overlay chunk a bounded window to appear, THEN
  // require it to be opaque. Checking opacity alone passes trivially while the
  // chunk is still in flight, which is the race itself.
  await page
    .waitForSelector('[aria-label="Cookie settings"]', { state: 'attached', timeout: 5_000 })
    .catch(() => { /* consent stored, or the chunk failed — nothing to settle */ });
  await page
    .waitForFunction(
      () => {
        const overlays = document.querySelectorAll(
          '[aria-label="Cookie settings"], [aria-label="Share feedback"]',
        );
        return [...overlays].every((el) => {
          const o = Number(getComputedStyle(el).opacity);
          return Number.isNaN(o) || o === 0 || o === 1;
        });
      },
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {});

  // Then wait for the page's OWN data to land, which `waitForAppReady` does not
  // cover — it guarantees the shell, not the content.
  //
  // Measured against prod: at app-ready every data-driven route carries ~850
  // characters of header and footer and nothing else. Seconds later /cities
  // reaches 16,001, /news 11,965 and /events 3,767. The sweep was therefore
  // reporting "0 violations" for pages whose entire content it had never seen,
  // and *which* fragment had landed by the sample moment moved with network
  // speed — so the violation set drifted run to run on unchanged code. That
  // reads exactly like a flaky scanner and is really a scan racing its data.
  //
  // Quiet-period, not a fixed sleep: settle when the rendered text stops
  // changing for 1.5 s. Bounded, and non-fatal — a route that streams forever
  // (map tiles) just scans at the cap instead of failing.
  await page
    .waitForFunction(
      () => {
        const n = document.body.innerText.length;
        if (window.__qgLastLen !== n) {
          window.__qgLastLen = n;
          window.__qgStableSince = Date.now();
          return false;
        }
        return Date.now() - (window.__qgStableSince ?? 0) > 1500;
      },
      undefined,
      { timeout: 20_000, polling: 300 },
    )
    .catch(() => {});
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'docs', 'a11y-audit');
const JSON_OUT = resolve(OUT_DIR, `${OUT_NAME}.json`);
const MD_OUT = resolve(OUT_DIR, `${OUT_NAME}.md`);

const STORAGE_STATE = process.env.E2E_STORAGE_STATE ||
  resolve(__dirname, '..', 'playwright', '.auth', 'admin.json');
let storageStateAvailable = false;
try {
  await access(STORAGE_STATE);
  storageStateAvailable = true;
} catch {
  storageStateAvailable = false;
}

const ROUTES = routesForScope(SCOPE);

function impactRank(i) {
  return { critical: 4, serious: 3, moderate: 2, minor: 1 }[i] || 0;
}

async function scanVariant(browser, route, viewport, theme) {
  const useStorage = Boolean(route.auth) && storageStateAvailable;
  const context = await browser.newContext({
    viewport: VIEWPORT_SIZES[viewport],
    userAgent: 'QGAxeScanner/1.0 (a11y-audit)',
    colorScheme: theme === 'dark' ? 'dark' : 'light',
    // Reduced motion: route/scroll-reveal fades animate opacity 0→1; axe blends
    // a transient opacity:0 frame into computed color and reports false contrast
    // failures. Emulating reduce settles the DOM the same way the sibling a11y
    // specs do — the render a reduced-motion user actually gets.
    reducedMotion: 'reduce',
    ...(useStorage ? { storageState: STORAGE_STATE } : {}),
  });
  // Pin the app theme before any script runs so we scan the intended palette.
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('ui-theme', t);
    } catch { /* storage may be unavailable */ }
  }, theme);

  const page = await context.newPage();
  const url = `${BASE_URL}${route.path}`;
  const variant = `${viewport}/${theme}`;
  const result = {
    route: route.path,
    name: route.name,
    variant,
    viewport,
    theme,
    auth: route.auth || null,
    url,
    status: null,
    error: null,
    violations: [],
  };
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    result.status = resp?.status() ?? null;
    await waitForAppReady(page);
    const axe = await new AxeBuilder({ page })
      // link-in-text-block: handled by inline-link underline rule in
      // src/index.css. maplibre attribution/zoom widgets are third-party
      // controls, already documented as target-size exceptions.
      .exclude('.maplibregl-ctrl')
      .disableRules(['link-in-text-block'])
      .withTags(WCAG_TAGS)
      .analyze();
    result.violations = axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      nodes: v.nodes.length,
      sample: v.nodes.slice(0, 2).map((n) => ({
        target: n.target,
        html: n.html.slice(0, 240),
        failureSummary: n.failureSummary,
      })),
    }));

    // `target-size` says WHAT failed and by how much, but never WHY: it reports
    // the largest unobscured sub-rect ("smallest space is 14px by 44px") and
    // names nothing that is doing the obscuring. That left a real finding —
    // reproducible only on the CI runner, moving between the three /*/guides
    // routes run to run — undiagnosable from the report, and un-chaseable
    // locally across ~200 scans on the same dist, server, viewport matrix and
    // concurrency.
    //
    // So record axe's own inputs here, while the page is still open. Obscuring
    // in `getTargetRects` is decided by RECT INTERSECTION and paint order —
    // neither hit-testing nor clipping ancestors play any part, which is worth
    // knowing before writing a probe: an `elementsFromPoint` version of this
    // reports overlays axe deliberately ignored and misses ones it counted.
    // `_findNearbyElms` also drops any neighbour whose `position: fixed`-ness
    // differs from the target's, so a fixed overlay can never obscure a static
    // link. Those discriminators are recorded as FIELDS below rather than
    // applied as filters — see the note at the push site.
    for (const v of result.violations) {
      if (v.id !== 'target-size') continue;
      for (const n of v.sample) {
        const selector = Array.isArray(n.target) ? n.target[0] : n.target;
        if (typeof selector !== 'string') continue;
        n.geometry = await page
          .evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return { error: 'selector no longer matches' };
            const round = (r) => ({
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
            const describe = (e) =>
              `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${String(e.className || '')
                .trim()
                .split(/\s+/)
                .slice(0, 3)
                .join('.')}`;
            const isFixed = (e) => {
              for (let p = e; p; p = p.parentElement) {
                if (getComputedStyle(p).position === 'fixed') return true;
              }
              return false;
            };
            const r = el.getBoundingClientRect();
            const overlapping = [];
            for (const e of document.querySelectorAll('*')) {
              if (e === el || e.contains(el) || el.contains(e)) continue;
              const b = e.getBoundingClientRect();
              if (!b.width || !b.height) continue;
              if (r.left >= b.right || r.right <= b.left) continue;
              if (r.top >= b.bottom || r.bottom <= b.top) continue;
              const cs = getComputedStyle(e);
              // Record axe's discriminators as FIELDS rather than applying them
              // as filters. A filtered probe that returns nothing is
              // indistinguishable from a probe that ran on the wrong page, and
              // this one only gets a single chance per CI run.
              overlapping.push({
                el: describe(e),
                position: cs.position,
                display: cs.display,
                zIndex: cs.zIndex,
                fixed: isFixed(e),
                pointerEvents: cs.pointerEvents,
                rect: round(b),
              });
              if (overlapping.length >= 8) break;
            }
            const header = document.querySelector('header');
            return {
              rect: round(r),
              display: getComputedStyle(el).display,
              fixed: isFixed(el),
              text: (el.textContent || '').trim().slice(0, 40),
              scrollY: Math.round(window.scrollY),
              viewport: { w: window.innerWidth, h: window.innerHeight },
              islandInset: getComputedStyle(document.documentElement)
                .getPropertyValue('--island-inset')
                .trim(),
              header: header
                ? { rect: round(header.getBoundingClientRect()), position: getComputedStyle(header).position }
                : null,
              overlapping,
            };
          }, selector)
          .catch((err) => ({ error: String(err).slice(0, 120) }));
      }
    }

    // Mobile-first reflow gate (WCAG 1.4.10): at 320px the page must not need
    // horizontal scrolling. Reported as a serious violation so it flows through
    // the same summary + CI serious/critical gate as axe findings.
    if (viewport === 'mobile' && !ALLOW_INNER_SCROLL.has(route.name)) {
      const reflow = await page.evaluate(() => {
        const de = document.documentElement;
        return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth };
      });
      result.reflow = reflow;
      if (reflow.scrollWidth > reflow.clientWidth + 1) {
        // Identify the widest offending elements to make the fix actionable.
        const offenders = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const out = [];
          for (const el of Array.from(document.body.querySelectorAll('*'))) {
            const r = el.getBoundingClientRect();
            if (r.right > vw + 1 || r.left < -1) {
              out.push({
                tag: el.tagName.toLowerCase(),
                cls: (el.className && String(el.className)).slice(0, 80),
                right: Math.round(r.right),
                width: Math.round(r.width),
              });
            }
            if (out.length >= 6) break;
          }
          return out;
        });
        result.violations.push({
          id: 'reflow-horizontal-scroll',
          impact: 'serious',
          help: `Horizontal scroll at 320px (scrollWidth ${reflow.scrollWidth} > ${reflow.clientWidth})`,
          helpUrl: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
          tags: ['wcag2aa', 'wcag1410'],
          nodes: offenders.length,
          sample: offenders.map((o) => ({
            target: [`${o.tag}.${o.cls}`],
            html: `right=${o.right}px width=${o.width}px`,
            failureSummary: 'Element extends past the 320px viewport',
          })),
        });
      }
    }
  } catch (err) {
    result.error = err.message;
  } finally {
    await context.close();
  }
  return result;
}

function summarize(results) {
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const byRule = {};
  for (const r of results) {
    for (const v of r.violations) {
      byImpact[v.impact] = (byImpact[v.impact] || 0) + 1;
      byRule[v.id] = (byRule[v.id] || 0) + 1;
    }
  }
  return { byImpact, byRule };
}

function renderMarkdown(results, complete = true) {
  const { byImpact, byRule } = summarize(results);
  const lines = [];
  lines.push(`# axe-core sweep — ${BASE_URL}`);
  lines.push('');
  lines.push(
    `Scope: **${SCOPE}** · Viewports: ${VIEWPORTS.join('+')} · Themes: ${THEMES.join('+')} · ` +
    `${results.length} scans on ${new Date().toISOString()}.`,
  );
  if (!complete) {
    lines.push('');
    lines.push('> **PARTIAL — this run did not finish.** Counts below cover only the scans');
    lines.push('> that completed and must not be read as a clean result.');
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Impact | Violations |');
  lines.push('|---|---|');
  for (const k of ['critical', 'serious', 'moderate', 'minor']) {
    lines.push(`| ${k} | ${byImpact[k] || 0} |`);
  }
  lines.push('');
  lines.push('## Top rules');
  lines.push('');
  const ruleEntries = Object.entries(byRule).sort((a, b) => b[1] - a[1]);
  if (ruleEntries.length === 0) {
    lines.push('_No violations._');
  } else {
    lines.push('| Rule | Count |');
    lines.push('|---|---|');
    for (const [rule, count] of ruleEntries) lines.push(`| \`${rule}\` | ${count} |`);
  }
  lines.push('');
  lines.push('## Scans with violations');
  const dirty = results.filter((r) => r.error || r.violations.length > 0);
  if (dirty.length === 0) {
    lines.push('');
    lines.push('_All scans clean._');
  }
  for (const r of dirty) {
    lines.push('');
    lines.push(`### ${r.route} — ${r.name} (${r.variant}${r.auth ? `, ${r.auth}` : ''})`);
    lines.push('');
    if (r.error) {
      lines.push(`> Error: ${r.error}`);
      continue;
    }
    lines.push(`Status: ${r.status} · Violations: ${r.violations.length}`);
    lines.push('');
    lines.push('| Impact | Rule | Nodes | Help |');
    lines.push('|---|---|---|---|');
    const sorted = [...r.violations].sort((a, b) => impactRank(b.impact) - impactRank(a.impact));
    for (const v of sorted) {
      lines.push(`| ${v.impact || 'n/a'} | \`${v.id}\` | ${v.nodes} | ${v.help} |`);
    }
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const variants = [];
  for (const vp of VIEWPORTS) for (const th of THEMES) variants.push({ vp, th });
  const tasks = [];
  for (const route of ROUTES) for (const { vp, th } of variants) tasks.push({ route, vp, th });
  const total = tasks.length;
  console.log(
    `Scanning ${ROUTES.length} routes × ${variants.length} variants ` +
    `(${VIEWPORTS.join('+')} / ${THEMES.join('+')}) = ${total} scans against ${BASE_URL} ` +
    `with concurrency ${CONCURRENCY}…`,
  );
  if (ROUTES.some((r) => r.auth) && !storageStateAvailable) {
    console.log(`  (no storageState at ${STORAGE_STATE} — auth routes scanned as anonymous gate)`);
  }
  const browser = await chromium.launch();
  // Slot-indexed so the report keeps manifest order regardless of finish order.
  const results = new Array(total);
  let done = 0;

  await mkdir(OUT_DIR, { recursive: true });
  // Write after every completed scan. A killed run (runner timeout) then still
  // leaves a `complete: false` report naming the scans it DID finish, instead of
  // leaving the previous file on disk — which is how a stale committed
  // axe-postdeploy.json from April got uploaded as if it were this run's result.
  let writing = null;
  async function writeOut(complete) {
    const settled = results.filter(Boolean);
    await writeFile(
      JSON_OUT,
      JSON.stringify(
        {
          baseUrl: BASE_URL,
          scope: SCOPE,
          viewports: VIEWPORTS,
          themes: THEMES,
          generatedAt: new Date().toISOString(),
          complete,
          scanned: settled.length,
          expected: total,
          results: settled,
        },
        null,
        2,
      ),
    );
    await writeFile(MD_OUT, renderMarkdown(settled, complete));
  }
  // Serialize writes so a partial file is never observed half-written.
  const flush = (complete) => {
    writing = (writing ?? Promise.resolve()).then(() => writeOut(complete)).catch(() => {});
    return writing;
  };
  await flush(false);

  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      const { route, vp, th } = tasks[i];
      const r = await scanVariant(browser, route, vp, th);
      results[i] = r;
      done += 1;
      process.stdout.write(
        `  [${done}/${total}] ${route.path} [${vp}/${th}] … ` +
        `${r.error ? 'ERR' : `${r.violations.length} violations`}\n`,
      );
      await flush(false);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));

  await browser.close();
  await flush(true);
  await writing;
  const { byImpact } = summarize(results.filter(Boolean));
  console.log(
    `\nDone. critical=${byImpact.critical || 0} serious=${byImpact.serious || 0} ` +
    `moderate=${byImpact.moderate || 0} minor=${byImpact.minor || 0}`,
  );
  console.log(`  ${MD_OUT}`);
  console.log(`  ${JSON_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
