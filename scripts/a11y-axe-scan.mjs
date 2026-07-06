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

const VIEWPORT_SIZES = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 320, height: 640 },
};

// Surfaces where a horizontal scroll container is the correct, accessible
// pattern (the full-bleed map canvas). Their overflow lives inside a labelled
// scroll region, so the page-level 320px no-scroll assert is relaxed — axe
// target-size still runs.
const ALLOW_INNER_SCROLL = new Set(['map']);

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
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
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

function renderMarkdown(results) {
  const { byImpact, byRule } = summarize(results);
  const lines = [];
  lines.push(`# axe-core sweep — ${BASE_URL}`);
  lines.push('');
  lines.push(
    `Scope: **${SCOPE}** · Viewports: ${VIEWPORTS.join('+')} · Themes: ${THEMES.join('+')} · ` +
    `${results.length} scans on ${new Date().toISOString()}.`,
  );
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
  const total = ROUTES.length * variants.length;
  console.log(
    `Scanning ${ROUTES.length} routes × ${variants.length} variants ` +
    `(${VIEWPORTS.join('+')} / ${THEMES.join('+')}) = ${total} scans against ${BASE_URL}…`,
  );
  if (ROUTES.some((r) => r.auth) && !storageStateAvailable) {
    console.log(`  (no storageState at ${STORAGE_STATE} — auth routes scanned as anonymous gate)`);
  }
  const browser = await chromium.launch();
  const results = [];
  for (const route of ROUTES) {
    for (const { vp, th } of variants) {
      process.stdout.write(`  ${route.path} [${vp}/${th}] … `);
      const r = await scanVariant(browser, route, vp, th);
      process.stdout.write(`${r.error ? 'ERR' : `${r.violations.length} violations`}\n`);
      results.push(r);
    }
  }
  await browser.close();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    JSON_OUT,
    JSON.stringify(
      { baseUrl: BASE_URL, scope: SCOPE, viewports: VIEWPORTS, themes: THEMES, generatedAt: new Date().toISOString(), results },
      null,
      2,
    ),
  );
  await writeFile(MD_OUT, renderMarkdown(results));
  const { byImpact } = summarize(results);
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
