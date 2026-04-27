#!/usr/bin/env node
// Run axe-core against a list of public routes and emit a JSON + Markdown summary.
// Usage:
//   BASE_URL=https://queer.guide node scripts/a11y-axe-scan.mjs
//   BASE_URL=http://localhost:5173 node scripts/a11y-axe-scan.mjs

import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/events', name: 'events-list' },
  { path: '/venues', name: 'venues-list' },
  { path: '/hotels', name: 'hotels-list' },
  { path: '/marketplace', name: 'marketplace' },
  { path: '/news', name: 'news' },
  { path: '/groups', name: 'groups' },
  { path: '/personalities', name: 'personalities' },
  { path: '/places', name: 'places' },
  { path: '/resources', name: 'resources' },
  { path: '/search', name: 'search' },
  { path: '/trips', name: 'trips' },
  { path: '/trips/discover', name: 'trips-discover' },
  { path: '/submit', name: 'submit-hub' },
  { path: '/about', name: 'about' },
  { path: '/contact', name: 'contact' },
  { path: '/accessibility', name: 'accessibility' },
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'docs', 'a11y-audit');
const JSON_OUT = resolve(OUT_DIR, 'axe-baseline.json');
const MD_OUT = resolve(OUT_DIR, 'axe-baseline.md');

function impactRank(i) {
  return { critical: 4, serious: 3, moderate: 2, minor: 1 }[i] || 0;
}

async function scanRoute(browser, route) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'QGAxeScanner/1.0 (a11y-audit)',
  });
  const page = await context.newPage();
  const url = `${BASE_URL}${route.path}`;
  const result = { route: route.path, name: route.name, url, status: null, error: null, violations: [] };
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    result.status = resp?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const axe = await new AxeBuilder({ page })
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
  lines.push(`# axe-core baseline — ${BASE_URL}`);
  lines.push('');
  lines.push(`Scanned ${results.length} routes on ${new Date().toISOString()}.`);
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
  lines.push('## Per-route results');
  for (const r of results) {
    lines.push('');
    lines.push(`### ${r.route} — ${r.name}`);
    lines.push('');
    if (r.error) {
      lines.push(`> Error: ${r.error}`);
      continue;
    }
    lines.push(`Status: ${r.status} · Violations: ${r.violations.length}`);
    if (r.violations.length === 0) {
      lines.push('');
      lines.push('No violations.');
      continue;
    }
    const sorted = [...r.violations].sort((a, b) => impactRank(b.impact) - impactRank(a.impact));
    lines.push('');
    lines.push('| Impact | Rule | Nodes | Help |');
    lines.push('|---|---|---|---|');
    for (const v of sorted) {
      lines.push(`| ${v.impact || 'n/a'} | \`${v.id}\` | ${v.nodes} | ${v.help} |`);
    }
  }
  return lines.join('\n') + '\n';
}

async function main() {
  console.log(`Scanning ${ROUTES.length} routes against ${BASE_URL}…`);
  const browser = await chromium.launch();
  const results = [];
  for (const route of ROUTES) {
    process.stdout.write(`  ${route.path} … `);
    const r = await scanRoute(browser, route);
    process.stdout.write(`${r.error ? 'ERR' : `${r.violations.length} violations`}\n`);
    results.push(r);
  }
  await browser.close();
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(JSON_OUT, JSON.stringify({ baseUrl: BASE_URL, generatedAt: new Date().toISOString(), results }, null, 2));
  await writeFile(MD_OUT, renderMarkdown(results));
  const { byImpact } = summarize(results);
  console.log(`\nDone. critical=${byImpact.critical || 0} serious=${byImpact.serious || 0} moderate=${byImpact.moderate || 0} minor=${byImpact.minor || 0}`);
  console.log(`  ${MD_OUT}`);
  console.log(`  ${JSON_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
