#!/usr/bin/env node
/**
 * Measure how much of OUR published tag prose is verbatim FetLife Kinktionary text.
 *
 * WHY THIS EXISTS
 *
 * The revival (waves 1-5) republished ~1,067 tags whose prose was written long
 * before this program — created_at 2026-02-23 for most of them. A 12-term sample
 * found that 4 of 12 carry a run of 33-40+ identical words against the
 * corresponding Kinktionary entry. That is not convergent phrasing for a
 * definition; it is copied text.
 *
 * The Kinktionary licence is non-commercial only and queer.guide is commercial,
 * so a page carrying their prose and marked seo_indexable=true is a live
 * exposure. The revival did not create that text but it did publish it, which is
 * what makes measuring it this program's responsibility.
 *
 * THEIR TEXT IS NEVER STORED. It is fetched, compared in memory, and discarded.
 * The output records only OUR slug, the length of the longest matching word run,
 * and our own word count — no fragment of their prose, not even the matched run,
 * because the matched run IS their prose.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/data-quality/measure-kinktionary-prose-overlap.mjs [--limit N]
 *
 * Output: scripts/data-quality/out/kinktionary-prose-overlap.json
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIGNAL = join(HERE, 'kinktionary-term-index.json');
const OUT_DIR = join(HERE, 'out');
const OUT = join(OUT_DIR, 'kinktionary-prose-overlap.json');
const PROFILE = join(HERE, 'out-kinktionary', 'overlap-profile');

const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) required');
  process.exit(2);
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

/** Longest run considered. Anything at the cap means "at least this" — the true
 *  run may be longer, which is why the cap is reported honestly as >=. */
const MAX_RUN = 60;
const MIN_RUN = 8;

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function longestCommonRun(ours, theirs) {
  const a = norm(ours).split(' ').filter(Boolean);
  const bw = norm(theirs).split(' ').filter(Boolean);
  if (a.length < MIN_RUN || bw.length < MIN_RUN) return 0;
  const shingles = new Set();
  for (let n = MIN_RUN; n <= Math.min(MAX_RUN, bw.length); n++)
    for (let i = 0; i + n <= bw.length; i++) shingles.add(bw.slice(i, i + n).join(' '));
  let best = 0;
  for (let n = MIN_RUN; n <= Math.min(MAX_RUN, a.length); n++)
    for (let i = 0; i + n <= a.length; i++)
      if (shingles.has(a.slice(i, i + n).join(' '))) best = Math.max(best, n);
  return best;
}

const slugify = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  const signal = JSON.parse(await readFile(SIGNAL, 'utf8'));
  // Only terms that resolve to a tag we actually publish.
  const bySlug = new Map();
  for (const t of signal.terms) if (!bySlug.has(slugify(t.term))) bySlug.set(slugify(t.term), t);

  // PAGINATE. `limit=5000` DOES NOT WORK: PostgREST clamps to its server-side
  // max-rows (1000 here) and returns the first page WITHOUT any error, so the
  // request looks like it succeeded. The first run of this script did exactly
  // that — it examined 619 tags spanning only `8-panel-sti-test` to `hentai`,
  // i.e. roughly A-H, and reported "181 overlapping" as if that were the whole
  // corpus. A truncated read reads exactly like a complete one; only the
  // alphabetical range of the output gave it away.
  const all = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(
      `https://xqeacpakadqfxjxjcewc.supabase.co/rest/v1/unified_tags` +
        `?select=slug,description,long_description,seo_indexable&status=eq.active` +
        `&human_reviewed=is.true&order=slug.asc&limit=1000&offset=${offset}`,
      { headers: H },
    );
    if (!res.ok) throw new Error(`tags: HTTP ${res.status}`);
    const page = await res.json();
    all.push(...page);
    if (page.length < 1000) break;
  }
  const tags = all.filter((t) => bySlug.has(t.slug));
  process.stderr.write(`${all.length} active reviewed tags, ${tags.length} with a Kinktionary counterpart\n`);

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  const rows = [];
  let i = 0;
  for (const t of tags) {
    if (i >= limit) break;
    i += 1;
    const entry = bySlug.get(t.slug);
    let theirs = '';
    try {
      const r = await page.goto('https://fetlife.com' + entry.href, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
      if (r && r.status() === 200) theirs = await page.$eval('main', (m) => m.innerText).catch(() => '');
    } catch {
      /* unreachable page is recorded as such, never as "no overlap" */
    }
    if (!theirs) {
      rows.push({ slug: t.slug, status: 'unreachable' });
    } else {
      const ours = `${t.description || ''} ${t.long_description || ''}`;
      const run = longestCommonRun(ours, theirs);
      rows.push({
        slug: t.slug,
        longestRun: run,
        atCap: run >= MAX_RUN,
        ourWords: norm(ours).split(' ').filter(Boolean).length,
        seo_indexable: t.seo_indexable,
      });
    }
    if (i % 25 === 0) process.stderr.write(`${i}/${Math.min(tags.length, limit)}\n`);
    await new Promise((s) => setTimeout(s, 2200));
  }
  await ctx.close();

  const scored = rows.filter((r) => typeof r.longestRun === 'number');
  const summary = {
    examined: rows.length,
    unreachable: rows.filter((r) => r.status === 'unreachable').length,
    clean_run_0: scored.filter((r) => r.longestRun === 0).length,
    run_8_to_19: scored.filter((r) => r.longestRun >= 8 && r.longestRun < 20).length,
    run_20_plus: scored.filter((r) => r.longestRun >= 20).length,
    run_20_plus_and_indexable: scored.filter((r) => r.longestRun >= 20 && r.seo_indexable).length,
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT, `${JSON.stringify({ _summary: summary, rows }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
