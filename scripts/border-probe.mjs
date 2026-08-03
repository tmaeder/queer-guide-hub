#!/usr/bin/env node
/**
 * Border probe — counts elements that actually PAINT a border on a rendered page.
 *
 * The PASTE-UP rebrand replaced outlines with filled ink plates. Grep is not a
 * proxy for the result: `src/index.css` resets `border-width: 0` on `*`, so a
 * `border-<color>` class alone draws nothing, and conversely a border can arrive
 * from `divide-y`, an inline style or a stylesheet with no utility class at all.
 * Computed width is the only honest signal.
 *
 * Route choice matters more than it looks. Sampling `/`, `/news`, `/places` and
 * `/marketplace` reported 2-8 bordered elements and would have declared the job
 * done — those pages simply had not loaded much content. `/city/new-york`, with
 * ~11k characters rendered, showed 176. Always measure a content-dense route.
 *
 *   node scripts/border-probe.mjs [--base https://queer.guide] [routes...]
 */
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
let base = 'http://localhost:4173';
const routes = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base') base = args[++i];
  else routes.push(args[i]);
}
if (routes.length === 0) routes.push('/city/new-york', '/', '/news', '/places');

const browser = await chromium.launch();
let grand = 0;
const report = [];

for (const route of routes) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const page = await ctx.newPage();
  try {
    await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('#root *', { state: 'attached', timeout: 20_000 });

    // Wait for the CONTENT, not just the shell. `#root *` attaches as soon as
    // the header mounts, which on a slow data fetch is ~500 characters of
    // chrome — and a border count taken then reads as a triumph. Poll until the
    // rendered text stops growing.
    let last = -1;
    for (let i = 0; i < 30; i++) {
      const n = await page.evaluate(() => document.body.innerText.trim().length);
      if (n > 1500 && n === last) break;
      last = n;
      await page.waitForTimeout(500);
    }

    // Then let lazy sections mount, and settle back at the top.
    for (let y = 0; y < 5; y++) {
      await page.evaluate((n) => window.scrollTo(0, n * 1000), y);
      await page.waitForTimeout(350);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
  } catch (err) {
    report.push({ route, error: String(err).split('\n')[0] });
    await ctx.close();
    continue;
  }

  const result = await page.evaluate(() => {
    const groups = new Map();
    let total = 0;
    for (const el of document.querySelectorAll('#root *, header *, footer *')) {
      const cs = getComputedStyle(el);
      // A side counts only if it has width AND is not fully transparent.
      // `scroll-area` and `switch` use `border-transparent` purely as spacing,
      // and a transparent border paints nothing — counting it would send the
      // sweep chasing borders that are not visible to anyone.
      const visible = ['Top', 'Right', 'Bottom', 'Left'].some((s) => {
        if ((parseFloat(cs[`border${s}Width`]) || 0) <= 0) return false;
        const c = cs[`border${s}Color`] || '';
        const m = c.match(/^rgba?\([^)]*?,\s*([\d.]+)\s*\)$/);
        if (m && Number(m[1]) === 0) return false;
        return c !== 'transparent';
      });
      if (!visible) continue;
      const r = el.getBoundingClientRect();
      // Ignore hairline slivers and zero-size nodes — they paint nothing visible.
      if (r.width < 8 || r.height < 8) continue;
      const cls = el.getAttribute('class') || `<${el.tagName.toLowerCase()}>`;
      total++;
      groups.set(cls, (groups.get(cls) || 0) + 1);
    }
    return {
      total,
      distinct: groups.size,
      bodyText: document.body.innerText.trim().length,
      top: [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
    };
  });

  grand += result.total;
  report.push({ route, ...result });
  await ctx.close();
}
await browser.close();

for (const r of report) {
  if (r.error) {
    console.log(`\n${r.route}  ERROR  ${r.error}`);
    continue;
  }
  console.log(`\n${r.route}  —  ${r.total} bordered elements, ${r.distinct} distinct  (content: ${r.bodyText} chars)`);
  if (r.bodyText < 1500) console.log('   ! thin page — this route is a weak signal, do not judge by it');
  for (const [cls, n] of r.top) console.log(`   ${String(n).padStart(4)}  ${cls.slice(0, 110)}`);
}
console.log(`\nTOTAL across ${report.length} route(s): ${grand}`);
