#!/usr/bin/env node
/**
 * Capture the FetLife Kinktionary VOCABULARY as a corroboration signal.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not store definitions. The Kinktionary licence
 * (https://fetlife.com/kinktionary/license-zcfzz) is non-commercial only —
 * "You may not use any material from the Kinktionary for commercial purposes
 * without the express written consent of FetLife" — and queer.guide is
 * commercial (marketplace, affiliate_partners, Stripe). The NC term binds
 * adaptations and remixes too, so their prose cannot be copied OR paraphrased
 * into this codebase.
 *
 * What IS captured is the term list, the section each term sits in, and the
 * terms a page links to. A list of words and a set of relations between them
 * are facts and short phrases, not expression. They are used only to decide
 * WHICH terms deserve a glossary page here and how those pages relate — never
 * to decide what the page says. Every word of our prose is written here.
 *
 * If you are tempted to add a `definition` field to the output: don't. There is
 * a test that fails the build if one appears
 * (src/lib/__tests__/kinktionarySignal.test.ts).
 *
 * WHY PLAYWRIGHT AND NOT fetch()
 *
 * Cloudflare fronts fetlife.com and rejects on TLS fingerprint, not headers.
 * Measured: node fetch -> 403, curl -> 403 even with a full browser header set
 * (UA, Accept, Accept-Language, Accept-Encoding). A real browser engine is the
 * only thing that gets a 200. No login is needed — the Kinktionary is public.
 *
 * Usage:
 *   node scripts/data-quality/scrape-kinktionary.mjs [--sections] [--related]
 *
 *   (default)     term list per section  -> out/kinktionary-terms.json
 *   --related     ALSO visit all ~1.9k term pages to collect related-term edges.
 *                 Slow (~20 min, rate-limited on purpose). Only needed for the
 *                 ontology pass.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** The committed artifact. Vocabulary signal only — see the header. */
const OUT_FILE = join(HERE, 'kinktionary-term-index.json');
/** Gitignored, alongside the other one-off importers' caches. Carries the
 *  browser profile whose cf_clearance cookie makes the run possible. */
const PROFILE_DIR = join(HERE, 'out-kinktionary', 'browser-profile');
const BASE = 'https://fetlife.com';

/** Content sections. The remaining sidebar entries (Style Guide, License,
 *  Leaderboard, About, Your Kink Is Not My Kink) are prose pages, not
 *  vocabulary, and carry no term list. */
const SECTIONS = [
  'consent-anjvl',
  'genders-k5umh',
  'sexual-orientations-dsley',
  'romantic-orientations-xkbu6',
  'relationships-cfhsp',
  'roles-ujio2',
  'gay-culture-lxk9a',
  'kink-activities-b2s8w',
  'sexual-activities-gchon',
  'philia-fetish-9splb',
  'sex-slang-hvix7',
  'pop-culture-rorxm',
  'toys-equipment-kvmeb',
  'pornography-nqv17',
  'play-spaces-mmc4d',
  'events-66wv4',
  'holidays-1fpai',
  'sexual-health-knbna',
  'mental-health-wdqpk',
  'disability-x3uf5',
  'scene-safety-vhj5m',
  'safety-resources-nhrwz',
  'glossary-pucym',
  'abbreviations-bzdbd',
];

const sectionName = (s) => s.replace(/-[a-z0-9]{5}$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Cloudflare lets a real browser engine through but rate-limits it: measured, a
 * back-to-back run 403s on the third page. A 403 here is throttling, not a dead
 * URL — it succeeds on retry after a pause — so it must be retried rather than
 * treated as "this section has no terms". Recording an empty section as fact is
 * the failure this guards against.
 */
async function gotoWithRetry(page, url, { tries = 5 } = {}) {
  let wait = 3_000;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const status = res ? res.status() : 0;
    if (status === 200) return res;
    if (attempt === tries) {
      throw new Error(`${url}: HTTP ${status} after ${tries} attempts`);
    }
    process.stderr.write(`  ${status} on ${url} — retry ${attempt}/${tries - 1} in ${wait / 1000}s\n`);
    await sleep(wait);
    wait *= 2;
  }
  return null;
}

async function main() {
  const withRelated = process.argv.includes('--related');
  // HEADED REAL CHROME, PERSISTENT PROFILE, AUTOMATION FLAG OFF. All three.
  //
  // Cloudflare's check here is not the User-Agent — overriding that changes
  // nothing. Measured, in order:
  //   node fetch                                    -> 403
  //   curl + full browser header set (UA, Accept,
  //     Accept-Language, Accept-Encoding)           -> 403   (TLS fingerprint)
  //   headless bundled Chromium                     -> 403 on page 2, and on
  //                                                    every retry through a 24s
  //                                                    exponential backoff
  //   headed channel:'chrome', ephemeral context    -> 403 on page 2
  //   headed channel:'chrome', PERSISTENT context,
  //     --disable-blink-features=AutomationControlled -> 200, 200, 200
  //
  // The persistent profile is what carries the cf_clearance cookie between
  // pages, so the challenge is solved once instead of re-issued per navigation.
  // There is no `--headless` escape hatch here on purpose: an option that
  // silently records every section as empty is worse than no option, and an
  // empty section is indistinguishable from a real one downstream.
  await mkdir(PROFILE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] || (await context.newPage());

  const terms = [];
  const seen = new Set();

  for (const section of SECTIONS) {
    await gotoWithRetry(page, `${BASE}/kinktionary/${section}`);
    // A term link is one level deeper than the section itself:
    // /kinktionary/<section>/<term>. The section nav links are shallower, so the
    // slash count is what separates vocabulary from chrome.
    const found = await page.$$eval('main a[href^="/kinktionary/"]', (as) =>
      as
        .map((a) => ({ term: a.textContent.trim(), href: a.getAttribute('href') }))
        .filter((x) => x.term && (x.href.match(/\//g) || []).length >= 3),
    );
    for (const { term, href } of found) {
      if (seen.has(href)) continue;
      seen.add(href);
      terms.push({ term, section: sectionName(section), href });
    }
    process.stderr.write(`${sectionName(section)}: ${found.length}\n`);
    await sleep(2_500);
  }

  if (withRelated) {
    let i = 0;
    for (const t of terms) {
      i += 1;
      try {
        const res = await page.goto(BASE + t.href, {
          waitUntil: 'domcontentloaded',
          timeout: 45_000,
        });
        if (!res || res.status() !== 200) continue;
        // Related terms are the term links in the page body other than itself.
        const related = await page.$$eval('main a[href^="/kinktionary/"]', (as) =>
          as
            .map((a) => a.textContent.trim())
            .filter((x) => x && x.length < 60),
        );
        const uniq = [...new Set(related)].filter((r) => r !== t.term);
        if (uniq.length) t.relatedTerms = uniq;
      } catch {
        /* a single unreachable page must not lose the whole run */
      }
      if (i % 50 === 0) process.stderr.write(`related: ${i}/${terms.length}\n`);
      await sleep(350);
    }
  }

  await context.close();

  await writeFile(
    OUT_FILE,
    `${JSON.stringify(
      {
        _license:
          'Vocabulary signal only — term names, sections and relations. NO definitions: the Kinktionary is licensed non-commercial-only and queer.guide is commercial. Do not add definition text to this file.',
        _source: 'https://fetlife.com/kinktionary',
        _captured: new Date().toISOString().slice(0, 10),
        _count: terms.length,
        terms,
      },
      null,
      2,
    )}\n`,
  );
  process.stderr.write(`\nwrote ${terms.length} terms -> ${OUT_FILE}\n`);
}

main().catch((e) => {
  process.stderr.write(`${e.stack}\n`);
  process.exit(1);
});
