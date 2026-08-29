#!/usr/bin/env node
/**
 * Capture the drgay.ch topic VOCABULARY as a coverage signal for the glossary.
 *
 * drgay.ch is the Swiss AIDS Federation's sexual-health service for gay, bi and
 * queer men and trans people. Its 101 English pages are a well-curated inventory
 * of exactly the concepts queer.guide's health glossary claims to cover, which
 * makes it a good probe for "what is missing" — and for nothing else.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not store their prose. drgay.ch carries NO open licence: the Impressum
 * (https://drgay.ch/en/publication-details/) names Aids-Hilfe Schweiz and states
 * no terms at all, so the default is all rights reserved. queer.guide is
 * commercial (marketplace, affiliate_partners, Stripe), and this is the same
 * situation as the Kinktionary and saferparty.ch imports already in this repo:
 * the vocabulary may be stored, the expression may not — not verbatim and not
 * paraphrased.
 *
 * Meta descriptions are the trap here. They read like structured metadata and
 * are in fact one to three sentences of their copy, sitting in a machine-
 * readable attribute where it is very tempting to lift them straight into
 * unified_tags.description. They are NOT captured. Nothing in the output is
 * longer than a label.
 *
 * What IS captured: the page's own title, the section path it sits under, and
 * the concept labels it lists (substance names, practice names, prevention
 * method names). A list of concept names is a fact about which topics exist. It
 * decides WHICH glossary pages deserve to exist here; it never decides what one
 * says. Every word of our prose is written from WHO / CDC / EACS / UNAIDS.
 *
 * If you are tempted to add a `description` field to the output: don't. There is
 * a test that fails the build if one appears
 * (src/lib/__tests__/drgayLicence.test.ts).
 *
 * WHY PLAYWRIGHT AND NOT fetch()
 *
 * drgay.ch is Craft CMS behind a Vue SPA. curl returns HTTP 200 and a ~10 KB
 * shell with zero content in it — no <main>, no headings, one <title>. Measured:
 * a plain fetch of /en/safer-sex/prevention/prep/ yields exactly one text line,
 * the document title. There is no Cloudflare challenge and no login, so headless
 * is enough; the persistent-profile escalation the Kinktionary scraper needs is
 * not required here. It runs on `channel: 'chrome'` (the system browser) like
 * that scraper does, so a checkout that has not run `npx playwright install`
 * still works.
 *
 * HOW SITE CHROME IS REMOVED
 *
 * The nav, language switcher and footer repeat their labels on every page, and
 * they are not concepts ("Emergency", "Blog", "Cookie Settings"). Rather than
 * hardcode a stoplist that silently rots when the site is redesigned, any label
 * appearing on more than half the pages is treated as chrome and dropped. That
 * is a measurement, so it self-corrects.
 *
 * Usage:
 *   node scripts/data-quality/scrape-drgay.mjs [--limit N]
 *   -> scripts/data-quality/drgay-topic-index.json (committed)
 */
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, 'drgay-topic-index.json');
const SITEMAP = 'https://drgay.ch/sitemap.xml';
const HOST = 'drgay.ch';
const LOCALE = '/en/';

/**
 * The four CONTENT sections, and only those.
 *
 * The rest of the site is service and organisational pages — /about-us/,
 * /your-contacts/, /emergency/, /blog/, /shop/, /donate/, /publication-details/
 * — which carry no topic vocabulary. Excluding them is not tidying: the About
 * page lists the Dr. Gay team by name, and a first run put six named
 * individuals into the committed artifact. Staff names are personal data about
 * identifiable people at an HIV organisation, they are not concepts, and a
 * coverage probe has no business carrying them. A section allowlist keeps them
 * out by construction rather than by a name filter that has to be right.
 *
 * ("lieben" is the German slug the English tree kept for Life & Love.)
 */
const CONTENT_SECTIONS = ['lieben', 'sexuality', 'safer-sex', 'safer-drugs'];

/**
 * Content pages that are Swiss SERVICE DIRECTORIES rather than topic pages.
 *
 * queer.guide's glossary is jurisdiction-neutral by decision, and these pages
 * are lists of where to go in Switzerland: the cantonal vaccination centres
 * ("AG (Canton of Aargau)", "AI (Canton of Appenzell Innerrhoden)", ...) and the
 * national drug-checking alert feed. Their labels are the 26 canton codes, which
 * are not concepts in any glossary and would be pure noise in the disposition.
 *
 * Excluded by URL rather than by filtering canton-shaped labels, because the
 * decision is "this page is Swiss service information", not "this string looks
 * like a canton" — and a label filter would keep letting the next Swiss list in.
 */
const SWISS_SERVICE_PAGES = [
  'safer-sex/mpox/vaccination-sites',
  'safer-sex/tested-and-vaccinated/where-to-get-vaccinated',
  'safer-drugs/get-to-know-the-drug/alert',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A concept label is a noun phrase. These bounds are what keep a sentence of
 * theirs from ever reaching the artifact even if the page markup changes:
 * 80 characters (the same cap the Kinktionary artifact uses), at most 8 words,
 * and no terminal sentence punctuation. "Cathinones (3-MMC, 4-MEC...)" passes;
 * "What and how much does it actually contain?" does not.
 */
const MAX_LABEL_CHARS = 80;
const MAX_LABEL_WORDS = 8;

function isLabelShaped(s) {
  const t = s.trim();
  if (t.length < 2 || t.length > MAX_LABEL_CHARS) return false;
  if (t.split(/\s+/).length > MAX_LABEL_WORDS) return false;
  if (/[.?!]$/.test(t)) return false;
  // A trailing colon marks a lead-in to prose, not a concept: "After-effects:",
  // "Advantages of being single:". The colonless sibling of a real concept is
  // captured elsewhere on the page anyway.
  if (/:$/.test(t)) return false;
  // A label has letters in it. Drops "2026", "→", bare punctuation.
  if (!/\p{L}/u.test(t)) return false;
  return true;
}

/** Section path from the URL, e.g. /en/safer-sex/prevention/prep/ -> safer-sex/prevention */
function sectionOf(url) {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  const afterLocale = parts.slice(1); // drop "en"
  return afterLocale.slice(0, -1).join('/') || 'root';
}

async function sitemapUrls() {
  const res = await fetch(SITEMAP, { headers: { 'User-Agent': 'queer.guide topic probe' } });
  if (!res.ok) throw new Error(`sitemap: HTTP ${res.status}`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  // English CONTENT pages on drgay.ch only. The sitemap also carries the DE/FR/IT
  // trees, the aids.ch privacy policy on another host, /alt/ legacy duplicates,
  // and the service pages excluded by CONTENT_SECTIONS above.
  return [
    ...new Set(
      locs.filter((u) => {
        try {
          const p = new URL(u);
          if (p.host !== HOST || !p.pathname.startsWith(LOCALE)) return false;
          if (p.pathname.includes('/alt/')) return false;
          const path = p.pathname.slice(LOCALE.length).replace(/\/$/, '');
          if (SWISS_SERVICE_PAGES.some((s) => path.startsWith(s))) return false;
          return CONTENT_SECTIONS.includes(path.split('/')[0]);
        } catch {
          return false;
        }
      }),
    ),
  ].sort();
}

/**
 * A page that renders nothing is a FETCH FAILURE, not a page with no concepts.
 * Recording it as the latter is how a coverage probe silently reports "queer.guide
 * already covers everything" — the same failure the Kinktionary scraper guards
 * against, and the same one that made an Overpass regional extract read as "this
 * city has no metro".
 */
async function capturePage(page, url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => null);
    const status = res?.status() ?? 0;
    if (status === 404) return { url, status, skipped: 'not found' };
    if (status === 200) {
      const data = await page.evaluate(() => {
        const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
        const h1 = document.querySelector('h1');
        const labels = [
          ...document.querySelectorAll('h2, h3, [role="tab"], nav a, button'),
        ].map(text);
        return { title: h1 ? text(h1) : '', labels };
      });
      if (data.title || data.labels.length) return { url, status, ...data };
    }
    await sleep(1500 * attempt);
  }
  throw new Error(`${url}: rendered nothing after 3 attempts — treat as a fetch failure, not as "no concepts"`);
}

async function main() {
  const limitArg = process.argv.indexOf('--limit');
  let urls = await sitemapUrls();
  if (limitArg !== -1) urls = urls.slice(0, Number(process.argv[limitArg + 1]));
  console.error(`${urls.length} English pages in the sitemap`);

  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ locale: 'en-GB' });
  const captured = [];
  for (const [i, url] of urls.entries()) {
    const got = await capturePage(page, url);
    captured.push(got);
    console.error(`  [${i + 1}/${urls.length}] ${got.skipped ? 'SKIP ' : ''}${url}`);
    await sleep(400); // deliberate: this is a small NGO's server
  }
  await browser.close();

  const live = captured.filter((c) => !c.skipped && c.title);
  if (live.length < urls.length * 0.8) {
    throw new Error(`only ${live.length}/${urls.length} pages rendered — refusing to write a partial signal`);
  }

  // Chrome detection, measured rather than hardcoded: a label on more than half
  // the pages is nav or footer, not a concept.
  const pageCount = live.length;
  const frequency = new Map();
  for (const c of live) {
    for (const l of new Set(c.labels.filter(isLabelShaped))) {
      frequency.set(l, (frequency.get(l) ?? 0) + 1);
    }
  }
  const chrome = new Set([...frequency].filter(([, n]) => n > pageCount / 2).map(([l]) => l));

  const topics = [];
  const seen = new Set();
  for (const c of live) {
    const section = sectionOf(c.url);
    const push = (label, kind) => {
      const key = `${label.toLowerCase()}|${kind}`;
      if (!isLabelShaped(label) || chrome.has(label) || seen.has(key)) return;
      seen.add(key);
      topics.push({ label: label.trim(), section, url: c.url, kind });
    };
    push(c.title, 'page');
    for (const l of c.labels) push(l, 'concept');
  }

  const artifact = {
    _license:
      'drgay.ch carries NO open licence (Impressum states no terms; default all rights reserved). ' +
      'Vocabulary signal only: page titles and concept labels. NO definitions, NO meta descriptions, ' +
      'NO body text is stored or paraphrased. Every word of queer.guide prose is written from ' +
      'WHO / CDC / EACS / UNAIDS.',
    _source: 'https://drgay.ch/en/',
    _publisher: 'Aids-Hilfe Schweiz / Swiss AIDS Federation',
    _captured: new Date().toISOString().slice(0, 10),
    _pages: pageCount,
    _count: topics.length,
    topics,
  };
  await writeFile(OUT_FILE, `${JSON.stringify(artifact, null, 2)}\n`);
  console.error(`\n${topics.length} labels from ${pageCount} pages (${chrome.size} chrome labels dropped)`);
  console.error(`wrote ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
