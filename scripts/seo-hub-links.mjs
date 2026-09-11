#!/usr/bin/env node
// Post-deploy guard for the hub crawl-link block (functions/_lib/hubLinks.ts).
//
// Asserts that each hub page serves Googlebot a non-trivial number of links to
// its OWN detail pages. Before 2026-09-10 every one of these was zero: of ~65
// hrefs on /venues, 57 were /assets/* bundles and 5 were site nav, so all
// 61,718 sitemap URLs had no internal crawl path at all.
//
// This has to run against a real deployment rather than in unit tests, because
// the way it fails in production is environmental and silent: fetchRows returns
// [] when SUPABASE_URL / the key is unset on the Pages project, buildHubLinksHtml
// then returns '' by design (a hub must never 500 over a missing link block),
// and the page keeps serving 200 with no links — indistinguishable from the bug
// it replaced. Unit tests with a mocked fetch cannot see that.
//
// Usage: node scripts/seo-hub-links.mjs https://queer.guide
// Exits 0 on pass, 1 on any failure.

const BASE = (process.argv[2] ?? process.env.SEO_CHECK_BASE ?? 'https://queer.guide').replace(
  /\/$/,
  '',
);

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const HUMAN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Floors are well below the configured limits (60-80) so ordinary content
// churn never trips them, but a collapse to zero — or to a handful — does.
const HUBS = [
  { path: '/venues', prefix: '/venues/', min: 20 },
  { path: '/cities', prefix: '/city/', min: 20 },
  { path: '/places', prefix: '/city/', min: 20 },
  { path: '/tags', prefix: '/tags/', min: 20 },
  { path: '/personalities', prefix: '/personalities/', min: 20 },
  { path: '/hotels', prefix: '/hotels/', min: 20 },
  // /events is upcoming-only, so its count is genuinely seasonal — a low floor
  // here is honest rather than lax. It is still far above the zero it was.
  { path: '/events', prefix: '/events/', min: 5 },
];

const fail = (m) => {
  console.error(`  X ${m}`);
  return 1;
};
const pass = (m) => {
  console.log(`  ok ${m}`);
  return 0;
};

// Plain string scan rather than a constructed RegExp.
//
// The first version built a RegExp out of the prefix and hand-escaped forward
// slashes into it. CodeQL flagged that high severity as
// js/incomplete-sanitization, and correctly so: an escape routine that rewrites
// one metacharacter but not the backslash is incomplete. It was also pointless,
// because a forward slash needs no escaping inside a RegExp *constructor* at
// all (only in a literal). Both problems disappear once no pattern is built,
// and these prefixes are fixed constants regardless.
//
// The offending expression is deliberately NOT quoted here. It was, and the
// alert went on firing against the comment after the real code was gone —
// a stale finding sitting on prose is indistinguishable from a live one at
// review time and costs the next reader the same investigation.
const countLinks = (html, prefix) => {
  const needle = `href="${prefix}`;
  const found = new Set();
  let i = html.indexOf(needle);
  while (i !== -1) {
    const valueStart = i + 'href="'.length;
    const end = html.indexOf('"', valueStart);
    if (end === -1) break;
    found.add(html.slice(valueStart, end));
    i = html.indexOf(needle, end);
  }
  return found.size;
};

async function main() {
  console.log(`Hub crawl-link check against ${BASE}\n`);
  let failures = 0;

  for (const hub of HUBS) {
    console.log(hub.path);
    let botHtml;
    let humanHtml;
    try {
      const [b, h] = await Promise.all([
        fetch(`${BASE}${hub.path}`, { headers: { 'User-Agent': BOT_UA } }),
        fetch(`${BASE}${hub.path}`, { headers: { 'User-Agent': HUMAN_UA } }),
      ]);
      if (b.status !== 200) {
        failures += fail(`bot HTTP ${b.status}`);
        continue;
      }
      botHtml = await b.text();
      humanHtml = await h.text();
    } catch (err) {
      failures += fail(`fetch failed: ${err.message}`);
      continue;
    }

    const n = countLinks(botHtml, hub.prefix);
    if (n < hub.min) {
      failures += fail(`${n} links to ${hub.prefix}* (expected >= ${hub.min})`);
    } else {
      pass(`${n} links to ${hub.prefix}*`);
    }

    if (!botHtml.includes('data-prerendered="hub-links"')) {
      failures += fail('hub-links block absent from the crawler body');
    } else {
      pass('hub-links block present');
    }

    // The block is bot-only by design — it costs a Supabase round-trip and a
    // human page view must not pay for it. If it starts appearing for humans,
    // the isBot gate in functions/_middleware.ts has been lost.
    if (humanHtml.includes('data-prerendered="hub-links"')) {
      failures += fail('hub-links block leaked into the HUMAN response');
    } else {
      pass('not served to humans');
    }
    console.log('');
  }

  if (failures === 0) {
    console.log(`PASS - all ${HUBS.length} hubs carry crawl links`);
    process.exit(0);
  }
  console.error(`FAIL - ${failures} failure(s) across ${HUBS.length} hubs`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
