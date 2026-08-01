#!/usr/bin/env node
/**
 * Guard for public/_redirects and the SPA-fallback contract.
 *
 * Background (2026-08-01): the SPA catch-all `/*  /index.html  200` was
 * silently DROPPED by Cloudflare Pages — its rule parser reports "Infinite
 * loop detected in this rule and has been ignored", because Pages strips
 * `.html`/`/index` from the target and re-enters `/*`. With the rule gone,
 * every path that wasn't a real file fell through to 404.html, so /help,
 * /city/:slug and every sitemap 404'd site-wide. Separately, four
 * `/assets/*  /404.html  404` rules were rejected because 404 is not a legal
 * status here. Both faults were printed by wrangler on every single deploy
 * and never read, and two attempted fixes traded one outage for another.
 *
 * SPA fallback now relies on Cloudflare Pages' built-in behaviour: with no
 * 404.html in the output directory, Pages serves index.html (200) for any
 * unmatched path, and — unlike a `/*` rewrite — leaves static assets alone.
 *
 * This check fails the build if any of that is undone. Run via
 * `npm run check:redirects` (CI + prebuild).
 */

import { existsSync, readFileSync } from 'node:fs';

const REDIRECTS = 'public/_redirects';
const NOT_FOUND_PAGE = 'public/404.html';

// The only statuses Cloudflare Pages accepts in _redirects. Anything else is
// rejected by the parser and the rule does nothing.
const VALID_STATUSES = new Set([200, 301, 302, 303, 307, 308]);

// Dynamic rules are those containing a splat or a :placeholder. Cloudflare
// caps these at 100 per project; rules past the cap are dropped silently.
const MAX_DYNAMIC_RULES = 100;

const errors = [];
const warnings = [];

if (!existsSync(REDIRECTS)) {
  console.error(`::error::${REDIRECTS} is missing.`);
  process.exit(1);
}

// A 404.html in the build output disables Pages' built-in SPA fallback: every
// unmatched path would render the error page instead of the app.
if (existsSync(NOT_FOUND_PAGE)) {
  errors.push(
    `${NOT_FOUND_PAGE} exists. Pages serves it for every unmatched path, which ` +
      `disables the built-in SPA fallback and 404s every deep route. Delete it, ` +
      `or replace it with an equivalent fallback and update this check.`,
  );
}

const lines = readFileSync(REDIRECTS, 'utf8').split('\n');
let dynamicCount = 0;

lines.forEach((raw, i) => {
  const lineNo = i + 1;
  const line = raw.replace(/#.*$/, '').trim();
  if (!line) return;

  const [from, to, statusRaw] = line.split(/\s+/);
  if (!from || !to) {
    errors.push(`${REDIRECTS}:${lineNo} — malformed rule: "${raw.trim()}"`);
    return;
  }

  const status = statusRaw ? Number(statusRaw) : 302;
  const isDynamic = /[*:]/.test(from);
  if (isDynamic) dynamicCount += 1;

  if (!VALID_STATUSES.has(status)) {
    errors.push(
      `${REDIRECTS}:${lineNo} — status ${statusRaw} is not supported by Cloudflare ` +
        `Pages (only ${[...VALID_STATUSES].join(', ')}). The rule is silently ignored: "${line}"`,
    );
  }

  if (status === 200) {
    // Pages canonicalises `/index.html` -> `/` and strips `.html` / `/index`
    // from rewrite targets. A splat rule then re-matches its own target and
    // the parser drops it; a static rule 308-redirects instead of rewriting.
    if (to.endsWith('.html') || to.endsWith('/index')) {
      errors.push(
        `${REDIRECTS}:${lineNo} — 200-rewrite to "${to}". Pages strips \`.html\`/\`/index\` ` +
          `from the target, so this rule is either dropped as an infinite loop (splat rules) ` +
          `or 308-redirects instead of rewriting. No rewrite to /index.html can work: "${line}"`,
      );
    }

    // A 200-rewrite outranks static-asset serving, so a catch-all serves the
    // SPA shell for /robots.txt and every hashed /assets/**.{js,css} too.
    if (from === '/*' || from === '/:splat') {
      errors.push(
        `${REDIRECTS}:${lineNo} — catch-all 200-rewrite "${line}". 200-rewrites take ` +
          `precedence over static assets, so this serves the SPA HTML for /robots.txt and ` +
          `every hashed /assets/**.{js,css}, breaking MIME checks. SPA fallback is handled ` +
          `by Pages' built-in no-404.html behaviour instead.`,
      );
    }

    if (from === to) {
      errors.push(
        `${REDIRECTS}:${lineNo} — identity rewrite "${line}" creates an infinite rewrite ` +
          `loop that aborts rule parsing for the whole file.`,
      );
    }
  }
});

if (dynamicCount > MAX_DYNAMIC_RULES) {
  errors.push(
    `${REDIRECTS} has ${dynamicCount} dynamic rules (splat or :placeholder); Cloudflare ` +
      `Pages caps them at ${MAX_DYNAMIC_RULES} and drops the rest without an error.`,
  );
} else if (dynamicCount > MAX_DYNAMIC_RULES * 0.8) {
  warnings.push(
    `${REDIRECTS} has ${dynamicCount} dynamic rules, close to Cloudflare's ${MAX_DYNAMIC_RULES} cap.`,
  );
}

for (const w of warnings) console.warn(`::warning::${w}`);

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error(`\n_redirects check FAILED (${errors.length} problem(s)).`);
  process.exit(1);
}

console.log(
  `_redirects OK (${dynamicCount} dynamic rules; no 404.html, so Pages' built-in SPA fallback serves index.html).`,
);
